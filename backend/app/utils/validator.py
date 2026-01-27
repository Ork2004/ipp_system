from backend.app.database import get_connection
from backend.app.utils.blocks import detect_semester_columns, build_available_block_keys


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
                    "unknown_loops": [],
                    "available_loops": [],
                }

            excel_template_id = r[0]

            cur.execute("""
                SELECT column_name, header_text
                FROM excel_columns
                WHERE template_id=%s
                ORDER BY position_index;
            """, (excel_template_id,))
            excel_cols_rows = cur.fetchall()
            excel_cols = {x[0] for x in excel_cols_rows}

            cur.execute("""
                SELECT dt.id
                FROM docx_templates dt
                WHERE dt.id=%s;
            """, (docx_template_id,))
            cur.fetchone()

            cur.execute("""
                SELECT config
                FROM generation_settings
                WHERE excel_template_id=%s AND docx_template_id=%s AND is_active=TRUE
                ORDER BY created_at DESC
                LIMIT 1;
            """, (excel_template_id, docx_template_id))
            s = cur.fetchone()
            config = s[0] if s else {}
            hourly_hours_col = ((config or {}).get("columns") or {}).get("hourly_hours_col")

            semester_map = detect_semester_columns(excel_cols_rows)
            available = build_available_block_keys(semester_map, has_hourly=bool(hourly_hours_col))
            available_loop_keys = {b["key"] for b in available}

            cur.execute("""
                SELECT placeholder_name, placeholder_type
                FROM docx_placeholders
                WHERE template_id=%s;
            """, (docx_template_id,))
            docx_ph = cur.fetchall()

            used_row = []
            used_loops = []
            for name, ptype in docx_ph:
                if ptype == "text" and isinstance(name, str) and name.startswith("row."):
                    used_row.append(name)
                if ptype == "loop" and isinstance(name, str):
                    used_loops.append(name)

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

            unknown_loops = []
            for lk in used_loops:
                if lk.startswith("blocks.") and lk not in available_loop_keys:
                    unknown_loops.append(lk)

            ok = (len(missing) == 0) and (len(unknown_loops) == 0)

            errors = []
            if missing:
                errors.append("В DOCX есть row.* которых нет в Excel (см missing_row_placeholders)")
            if unknown_loops:
                errors.append("В DOCX есть loops blocks.* которых нет среди доступных (см unknown_loops)")

            return {
                "ok": ok,
                "excel_template_id": excel_template_id,
                "docx_template_id": docx_template_id,
                "missing_row_placeholders": sorted(missing),
                "unused_excel_columns": sorted(unused),
                "unknown_loops": sorted(unknown_loops),
                "available_loops": sorted(list(available_loop_keys)),
                "errors": errors,
            }
    finally:
        conn.close()
