from backend.app.database import get_connection


def validate_docx_against_excel(docx_template_id: int) -> dict:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT excel_template_id
                FROM docx_templates
                WHERE id=%s;
            """, (docx_template_id,))
            r = cur.fetchone()
            if not r or not r[0]:
                return {
                    "ok": False,
                    "errors": ["DOCX не связан с Excel (excel_template_id is NULL)"],
                    "missing_row_placeholders": [],
                    "unused_excel_columns": [],
                    "used_row_placeholders": [],
                }

            excel_template_id = r[0]

            cur.execute("""
                SELECT column_name
                FROM excel_columns
                WHERE template_id=%s;
            """, (excel_template_id,))
            excel_cols = {x[0] for x in cur.fetchall()}

            cur.execute("""
                SELECT placeholder_name, placeholder_type
                FROM docx_placeholders
                WHERE template_id=%s;
            """, (docx_template_id,))
            docx_ph = cur.fetchall()

            used_row = []
            for name, ptype in docx_ph:
                if ptype == "text" and isinstance(name, str) and name.startswith("row."):
                    used_row.append(name)

            used_row_set = set(used_row)

            missing = []
            for ph in used_row_set:
                col = ph.split(".", 1)[1]
                if col not in excel_cols:
                    missing.append(ph)

            unused = []
            for col in excel_cols:
                if f"row.{col}" not in used_row_set:
                    unused.append(f"row.{col}")

            ok = len(missing) == 0
            return {
                "ok": ok,
                "excel_template_id": excel_template_id,
                "docx_template_id": docx_template_id,
                "used_row_placeholders": sorted(list(used_row_set)),
                "missing_row_placeholders": sorted(missing),
                "unused_excel_columns": sorted(unused),
                "errors": [] if ok else ["В DOCX есть row.* которых нет в Excel (смотри missing_row_placeholders)"]
            }
    finally:
        conn.close()
