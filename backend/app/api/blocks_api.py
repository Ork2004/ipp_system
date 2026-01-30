from fastapi import APIRouter, HTTPException
from backend.app.database import get_connection
import re

router = APIRouter(prefix="/blocks", tags=["Blocks"])

SEM_RE = re.compile(r"(?:(\d+)\s*(?:сем|semestr|semester))", re.IGNORECASE)
HOURLY_RE = re.compile(r"(почас|hourly)", re.IGNORECASE)


def _detect_semester_columns(columns: list[tuple[str, str]]) -> dict:
    found: dict[int, str] = {}
    for col_name, header_text in columns:
        if not header_text:
            continue
        m = SEM_RE.search(str(header_text))
        if not m:
            continue
        try:
            sem = int(m.group(1))
        except Exception:
            continue
        if sem > 0 and sem not in found:
            found[sem] = col_name

    out = {}
    for sem in sorted(found.keys()):
        out[f"sem{sem}"] = found[sem]
    return out


def _has_hourly(columns: list[tuple[str, str]]) -> bool:
    for _, header_text in columns:
        if header_text and HOURLY_RE.search(str(header_text)):
            return True
    return False


def _pick_example_row_field(columns: list[tuple[str, str]], exclude_cols: set[str]) -> str:
    for col_name, _ in columns:
        if col_name not in exclude_cols:
            return col_name
    return "any_field"


def _snippet(loop_key: str, example_col: str) -> str:
    return (
        "{%tr for row in " + loop_key + " %}\n"
        "  {{ row." + example_col + " }}\n"
        "{%tr endfor %}"
    )


@router.get("/available")
def available(excel_template_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM excel_templates WHERE id=%s;", (excel_template_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Excel template не найден")

            cur.execute("""
                SELECT column_name, header_text
                FROM excel_columns
                WHERE template_id=%s
                ORDER BY position_index;
            """, (excel_template_id,))
            columns = cur.fetchall()

        semester_map = _detect_semester_columns(columns)
        if not semester_map:
            return {
                "excel_template_id": excel_template_id,
                "semester_map": {},
                "blocks": [],
                "warning": "Не нашёл семестры по заголовкам (нужны вроде: '1 сем', '2 сем', '3 сем'...)."
            }

        has_hourly = _has_hourly(columns)

        exclude = set(semester_map.values())

        example_col = _pick_example_row_field(columns, exclude_cols=exclude)

        blocks = []
        for sem_key in semester_map.keys():
            staff_key = f"blocks.teaching_load.staff.{sem_key}"
            blocks.append({
                "key": staff_key,
                "title": f"Учебная нагрузка (штатная) — {sem_key}",
                "type": "loop",
                "snippet": _snippet(staff_key, example_col),
            })

            if has_hourly:
                hourly_key = f"blocks.teaching_load.hourly.{sem_key}"
                blocks.append({
                    "key": hourly_key,
                    "title": f"Учебная нагрузка (почасовая) — {sem_key}",
                    "type": "loop",
                    "snippet": _snippet(hourly_key, example_col),
                })

        return {
            "excel_template_id": excel_template_id,
            "semester_map": semester_map,
            "blocks": blocks
        }

    finally:
        conn.close()
