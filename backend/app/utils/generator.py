import os
from datetime import datetime
from docx import Document

from backend.app.database import get_connection


def _get_raw_template_path(department_id: int, academic_year: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT current_file_path
                FROM raw_docx_templates
                WHERE department_id=%s AND academic_year=%s;
                """,
                (department_id, academic_year),
            )
            r = cur.fetchone()
            if not r:
                raise Exception("Raw шаблон не найден")
            return r[0]
    finally:
        conn.close()


def _get_settings(department_id: int, academic_year: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT config
                FROM generation_settings
                WHERE department_id=%s AND academic_year=%s AND is_active=true;
                """,
                (department_id, academic_year),
            )
            r = cur.fetchone()
            if not r:
                raise Exception("Настройки не найдены")
            return r[0]
    finally:
        conn.close()


def _get_excel_rows(excel_template_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT row_data
                FROM excel_rows
                WHERE template_id=%s;
                """,
                (excel_template_id,),
            )
            rows = cur.fetchall()
            return [r[0] for r in rows]
    finally:
        conn.close()


def _get_excel_template_id(department_id: int, academic_year: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM excel_templates
                WHERE department_id=%s AND academic_year=%s;
                """,
                (department_id, academic_year),
            )
            r = cur.fetchone()
            if not r:
                raise Exception("Excel шаблон не найден")
            return r[0]
    finally:
        conn.close()


def _group_rows(rows, cfg):
    cols = cfg["columns"]
    activity = cfg["activity_types"]
    merge = cfg["merge_rules"]

    grouped = {}

    for r in rows:
        discipline = r.get(cols["discipline_col"])
        group = r.get(cols["group_col"])
        activity_type = str(r.get(cols["activity_type_col"], "")).lower()

        key = discipline

        if key not in grouped:
            grouped[key] = {
                "discipline": discipline,
                "groups": set(),
                "lecture": 0,
                "practice": 0,
            }

        grouped[key]["groups"].add(group)

        if any(x in activity_type for x in activity["lecture"]):
            grouped[key]["lecture"] += float(r.get(cols["staff_hours_col"] or 0) or 0)

        if any(x in activity_type for x in activity["lab_practice"]):
            grouped[key]["practice"] += float(r.get(cols["staff_hours_col"] or 0) or 0)

    result = []
    for v in grouped.values():
        result.append({
            "discipline": v["discipline"],
            "groups": ", ".join(v["groups"]),
            "lecture": v["lecture"],
            "practice": v["practice"],
            "total": v["lecture"] + v["practice"],
        })

    return result


def _fill_table(doc: Document, table_index: int, data):
    table = doc.tables[table_index]

    while len(table.rows) > 1:
        table._element.remove(table.rows[-1]._element)

    for row_data in data:
        row_cells = table.add_row().cells

        row_cells[0].text = str(row_data["discipline"] or "")
        row_cells[1].text = str(row_data["groups"] or "")
        row_cells[2].text = str(row_data["lecture"] or "")
        row_cells[3].text = str(row_data["practice"] or "")
        row_cells[4].text = str(row_data["total"] or "")


def generate_docx_for_teacher(teacher_id: int, department_id: int, academic_year: str):
    raw_path = _get_raw_template_path(department_id, academic_year)
    cfg = _get_settings(department_id, academic_year)

    excel_id = _get_excel_template_id(department_id, academic_year)
    rows = _get_excel_rows(excel_id)

    grouped_data = _group_rows(rows, cfg)

    doc = Document(raw_path)

    staff_sem1 = cfg["template_bindings"]["teaching_load"]["staff"]["sem1"].get("raw_table_id")
    staff_sem2 = cfg["template_bindings"]["teaching_load"]["staff"]["sem2"].get("raw_table_id")

    if staff_sem1 is not None:
        _fill_table(doc, int(staff_sem1), grouped_data)

    if staff_sem2 is not None:
        _fill_table(doc, int(staff_sem2), grouped_data)

    os.makedirs("generated", exist_ok=True)

    filename = f"IPP_{teacher_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx"
    out_path = os.path.join("generated", filename)

    doc.save(out_path)

    return out_path