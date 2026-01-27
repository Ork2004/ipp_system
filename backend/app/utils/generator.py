import re
from pathlib import Path
from typing import Dict, Any, List, Optional

from docxtpl import DocxTemplate

from backend.app.database import get_connection
from backend.app.config import GENERATED_DIR
from backend.app.utils.blocks import detect_semester_columns, build_block_rows


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


def _get_excel_columns(cur, excel_template_id: int) -> List[tuple[str, str]]:
    cur.execute("""
        SELECT column_name, header_text
        FROM excel_columns
        WHERE template_id=%s
        ORDER BY position_index;
    """, (excel_template_id,))
    return cur.fetchall()


def _get_excel_mapping(cur, excel_template_id: int) -> dict:
    cols = _get_excel_columns(cur, excel_template_id)
    col_to_header = {cn: ht for (cn, ht) in cols}
    return {"col_to_header": col_to_header, "columns": cols}


def _get_excel_rows(cur, excel_template_id: int) -> List[dict]:
    cur.execute("""
        SELECT row_data
        FROM excel_rows
        WHERE template_id=%s
        ORDER BY row_number;
    """, (excel_template_id,))
    return [r[0] for r in cur.fetchall()]


def _get_docx_loop_keys(cur, docx_template_id: int) -> List[str]:
    cur.execute("""
        SELECT placeholder_name
        FROM docx_placeholders
        WHERE template_id=%s AND placeholder_type='loop'
        ORDER BY placeholder_name;
    """, (docx_template_id,))
    return [r[0] for r in cur.fetchall()]


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
            cols_cfg = (settings or {}).get("columns") or {}

            teacher_col = cols_cfg.get("teacher_col")
            staff_hours_col = cols_cfg.get("staff_hours_col")
            hourly_hours_col = cols_cfg.get("hourly_hours_col")

            if not teacher_col or not staff_hours_col:
                raise Exception("Настройки неполные: columns.teacher_col и columns.staff_hours_col обязательны")

            teacher = _get_teacher(cur, teacher_id)

            mapping = _get_excel_mapping(cur, excel_template_id)
            col_to_header = mapping["col_to_header"]
            excel_columns = mapping["columns"]

            semester_map = detect_semester_columns(excel_columns)
            if not semester_map:
                raise Exception("Не найдены колонки семестров в Excel (например '1 сем', '2 сем', '3 сем').")

            excel_rows = _get_excel_rows(cur, excel_template_id)

            loop_keys = _get_docx_loop_keys(cur, docx_template_id)

            blocks: Dict[str, Any] = {}
            for lk in loop_keys:
                if isinstance(lk, str) and lk.startswith("blocks."):
                    rows = build_block_rows(
                        loop_key=lk,
                        excel_rows=excel_rows,
                        col_to_header=col_to_header,
                        teacher_full_name=teacher["full_name"],
                        teacher_col=teacher_col,
                        semester_map=semester_map,
                        staff_hours_col=staff_hours_col,
                        hourly_hours_col=hourly_hours_col,
                    )
                    parts = lk.split(".")[1:]
                    node = blocks
                    for p in parts[:-1]:
                        node = node.setdefault(p, {})
                    node[parts[-1]] = rows

            context = {
                "teacher": teacher,
                "blocks": blocks,
            }

        tpl = DocxTemplate(tpl_path)
        tpl.render(context)

        safe_name = re.sub(r"[^0-9A-Za-zА-Яа-я_]+", "_", teacher["full_name"]).strip("_")
        output_path = str((GENERATED_DIR / f"IPP_{safe_name}_{academic_year}.docx").resolve())
        tpl.save(output_path)
        return output_path

    finally:
        conn.close()
