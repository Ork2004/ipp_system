import re
from backend.app.database import get_connection

SEM_RE = re.compile(r"(?:(\d+)\s*(?:сем|semestr|semester))", re.IGNORECASE)
HOURLY_RE = re.compile(r"(почас|hourly)", re.IGNORECASE)


def _detect_semesters(columns: list[tuple[str, str]]) -> list[str]:
    found = set()
    for _, header_text in columns:
        if not header_text:
            continue
        m = SEM_RE.search(str(header_text))
        if not m:
            continue
        try:
            sem = int(m.group(1))
        except Exception:
            continue
        if sem > 0:
            found.add(sem)
    return [f"sem{n}" for n in sorted(found)]


def _has_hourly(columns: list[tuple[str, str]]) -> bool:
    for _, header_text in columns:
        if header_text and HOURLY_RE.search(str(header_text)):
            return True
    return False


def _build_available_loops(columns: list[tuple[str, str]]) -> list[str]:
    sems = _detect_semesters(columns)
    if not sems:
        return []

    hourly = _has_hourly(columns)

    loops = []
    for sem in sems:
        loops.append(f"blocks.teaching_load.staff.{sem}")
        if hourly:
            loops.append(f"blocks.teaching_load.hourly.{sem}")
    return loops


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
                    "unknown_loops": [],
                    "available_loops": [],
                }

            excel_template_id = r[0]

            cur.execute("""
                SELECT column_name, header_text
                FROM excel_columns
                WHERE template_id=%s;
            """, (excel_template_id,))
            excel_cols_rows = cur.fetchall()
            excel_cols = {x[0] for x in excel_cols_rows}

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

            used_loops = set()
            for name, ptype in docx_ph:
                if ptype == "loop" and isinstance(name, str) and name.startswith("blocks."):
                    used_loops.add(name.strip())

            available_loops = set(_build_available_loops(excel_cols_rows))

            unknown_loops = []
            if used_loops:
                for lp in sorted(used_loops):
                    if lp not in available_loops:
                        unknown_loops.append(lp)

            errors = []
            if missing:
                errors.append("В DOCX есть row.* которых нет в Excel (смотри missing_row_placeholders)")
            if unknown_loops:
                errors.append("В DOCX есть loops blocks.* которых нет среди доступных (см unknown_loops)")

            ok = (len(missing) == 0) and (len(unknown_loops) == 0)

            return {
                "ok": ok,
                "excel_template_id": excel_template_id,
                "docx_template_id": docx_template_id,
                "used_row_placeholders": sorted(list(used_row_set)),
                "missing_row_placeholders": sorted(missing),
                "unused_excel_columns": sorted(unused),
                "available_loops": sorted(list(available_loops)),
                "unknown_loops": unknown_loops,
                "errors": errors
            }
    finally:
        conn.close()
