import re
from pathlib import Path
from typing import Any, Dict, List

from docxtpl import DocxTemplate

from backend.app.database import get_connection


def to_num(x):
    if x is None:
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    try:
        return float(str(x).replace(",", ".").strip())
    except Exception:
        return 0.0


def _get_teacher(cur, teacher_id: int) -> dict:
    cur.execute("""
        SELECT t.full_name, t.position, t.academic_degree, t.staff_type, t.faculty, d.name
        FROM teachers t
        LEFT JOIN departments d ON d.id=t.department_id
        WHERE t.id=%s;
    """, (teacher_id,))
    t = cur.fetchone()
    if not t:
        raise Exception("Преподаватель не найден")

    return {
        "full_name": t[0],
        "position": t[1],
        "academic_degree": t[2],
        "staff_type": t[3],
        "faculty": t[4] or "",
        "department": t[5] or "",
    }


def _resolve_active_docx(cur, department_id: int, academic_year: str) -> int:
    cur.execute("""
        SELECT id FROM docx_templates
        WHERE department_id=%s AND academic_year=%s AND is_active=TRUE
        ORDER BY created_at DESC
        LIMIT 1;
    """, (department_id, academic_year))
    r = cur.fetchone()
    if not r:
        raise Exception("Не найден active DOCX шаблон для кафедры/года")
    return r[0]


def _get_docx_info(cur, docx_template_id: int) -> dict:
    cur.execute("""
        SELECT id, current_file_path, excel_template_id
        FROM docx_templates
        WHERE id=%s;
    """, (docx_template_id,))
    r = cur.fetchone()
    if not r:
        raise Exception("DOCX template не найден")
    return {"id": r[0], "tpl_path": r[1], "excel_template_id": r[2]}


def _get_active_settings(cur, excel_template_id: int, docx_template_id: int) -> dict:
    cur.execute("""
        SELECT config
        FROM generation_settings
        WHERE excel_template_id=%s AND docx_template_id=%s AND is_active=TRUE
        ORDER BY created_at DESC
        LIMIT 1;
    """, (excel_template_id, docx_template_id))
    r = cur.fetchone()
    if not r:
        raise Exception("Нет активных настроек для этой пары Excel+DOCX. Сначала сохрани настройки.")
    return r[0]


def _get_excel_mapping(cur, excel_template_id: int) -> dict:
    cur.execute("""
        SELECT column_name, header_text
        FROM excel_columns
        WHERE template_id=%s
        ORDER BY position_index;
    """, (excel_template_id,))
    rows = cur.fetchall()
    col_to_header = {cn: ht for (cn, ht) in rows}
    return {"col_to_header": col_to_header, "headers": rows}


def _build_row_object(row_data: dict, col_to_header: dict) -> dict:
    out = {}
    for col_name, header_text in col_to_header.items():
        out[col_name] = row_data.get(header_text)
    return out


def generate_docx_for_teacher(
    teacher_id: int,
    department_id: int,
    academic_year: str,
    docx_template_id: int | None = None,
) -> str:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if docx_template_id is None:
                docx_template_id = _resolve_active_docx(cur, department_id, academic_year)

            docx_info = _get_docx_info(cur, docx_template_id)
            tpl_path = docx_info["tpl_path"]
            excel_template_id = docx_info["excel_template_id"]
            if not excel_template_id:
                raise Exception("DOCX не связан с Excel (excel_template_id = NULL). Загрузи DOCX с выбранным Excel.")

            settings = _get_active_settings(cur, excel_template_id, docx_template_id)
            cols = settings.get("columns") or {}

            teacher_col = cols.get("teacher_col")
            sem1_col = cols.get("sem1_col")
            sem2_col = cols.get("sem2_col")
            staff_hours_col = cols.get("staff_hours_col")
            hourly_hours_cols = cols.get("hourly_hours_cols") or []

            required = [teacher_col, sem1_col, sem2_col, staff_hours_col]
            if not all(required):
                raise Exception("Настройки неполные: teacher_col/sem1_col/sem2_col/staff_hours_col обязательны")

            teacher = _get_teacher(cur, teacher_id)
            teacher_name = (teacher["full_name"] or "").lower()

            mapping = _get_excel_mapping(cur, excel_template_id)
            col_to_header = mapping["col_to_header"]

            def get_val(row_data: dict, col_name: str):
                ht = col_to_header.get(col_name)
                return None if not ht else row_data.get(ht)

            def is_row_for_teacher(row_data: dict) -> bool:
                v = get_val(row_data, teacher_col)
                return isinstance(v, str) and teacher_name in v.lower()

            def has_sem(row_data: dict, sem_col: str) -> bool:
                v = get_val(row_data, sem_col)
                return v is not None and str(v).strip() != ""

            def staff_val(row_data: dict) -> float:
                return to_num(get_val(row_data, staff_hours_col))

            def hourly_val(row_data: dict) -> float:
                s = 0.0
                for c in hourly_hours_cols:
                    s += to_num(get_val(row_data, c))
                return s

            cur.execute("""
                SELECT row_data
                FROM excel_rows
                WHERE template_id=%s
                ORDER BY row_number;
            """, (excel_template_id,))
            excel_rows = [r[0] for r in cur.fetchall()]

            staff_sem1: List[dict] = []
            staff_sem2: List[dict] = []
            hourly_sem1: List[dict] = []
            hourly_sem2: List[dict] = []

            for rd in excel_rows:
                if not is_row_for_teacher(rd):
                    continue

                s_val = staff_val(rd)
                h_val = hourly_val(rd)

                row_obj = _build_row_object(rd, col_to_header)

                if has_sem(rd, sem1_col):
                    if s_val > 0:
                        staff_sem1.append(row_obj)
                    if h_val > 0:
                        hourly_sem1.append(row_obj)

                if has_sem(rd, sem2_col):
                    if s_val > 0:
                        staff_sem2.append(row_obj)
                    if h_val > 0:
                        hourly_sem2.append(row_obj)

            context = {
                "teacher": teacher,
                "teaching_load_staff_sem1": staff_sem1,
                "teaching_load_staff_sem2": staff_sem2,
                "teaching_load_hourly_sem1": hourly_sem1,
                "teaching_load_hourly_sem2": hourly_sem2,
            }

        tpl = DocxTemplate(tpl_path)
        tpl.render(context)

        out_dir = Path("backend/uploads/generated")
        out_dir.mkdir(parents=True, exist_ok=True)

        safe_name = re.sub(r"[^0-9A-Za-zА-Яа-я_]+", "_", teacher["full_name"]).strip("_")
        output_path = str(out_dir / f"IPP_{safe_name}_{academic_year}.docx")
        tpl.save(output_path)
        return output_path

    finally:
        conn.close()
