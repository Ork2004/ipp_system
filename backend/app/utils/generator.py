import re
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional

from docx import Document

from backend.app.config import GENERATED_DIR
from backend.app.database import get_connection
from backend.app.utils.blocks import build_block_rows, detect_semester_columns
from backend.app.utils.manual_docx_filler import apply_manual_fill_to_generated_docx


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def _to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        s = f"{value:.2f}".rstrip("0").rstrip(".")
        return s
    return str(value)


def _safe_name(value: str) -> str:
    return re.sub(r"[^0-9A-Za-zА-Яа-я_]+", "_", value).strip("_")


def _safe_get_table(doc: Document, table_index: int):
    if table_index < 0 or table_index >= len(doc.tables):
        return None
    return doc.tables[table_index]


def _safe_get_cell(table, row_index: int, col_index: int):
    try:
        return table.rows[row_index].cells[col_index]
    except Exception:
        return None


def _set_cell_text(cell, value: Any):
    if cell is None:
        return
    cell.text = _to_str(value)


def _clone_row_before(table, row_index: int):
    tr = table.rows[row_index]._tr
    new_tr = deepcopy(tr)
    tr.addprevious(new_tr)
    return row_index


def _clear_row(row):
    for cell in row.cells:
        cell.text = ""


def _row_non_empty_count(row) -> int:
    count = 0
    for cell in row.cells:
        if _normalize_text(cell.text):
            count += 1
    return count


def _find_first_footer_row(table, start_row_index: int) -> Optional[int]:
    for idx in range(start_row_index + 1, len(table.rows)):
        if _row_non_empty_count(table.rows[idx]) > 0:
            return idx
    return None


def _fill_cells_by_mapping(table, row_index: int, values: Dict[str, Any], col_map: Dict[str, int]):
    for field_key, col_index in (col_map or {}).items():
        if field_key not in values:
            continue
        cell = _safe_get_cell(table, row_index, int(col_index))
        _set_cell_text(cell, values.get(field_key))


def _extract_teacher(cur, teacher_id: int) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT
            t.id,
            t.full_name,
            t.department_id,
            t.faculty,
            t.position,
            t.academic_degree,
            t.academic_rank,
            t.staff_type,
            t.extra_data,
            d.name
        FROM teachers t
        LEFT JOIN departments d ON d.id = t.department_id
        WHERE t.id = %s;
        """,
        (teacher_id,),
    )
    row = cur.fetchone()
    if not row:
        raise Exception("Преподаватель не найден")

    return {
        "id": row[0],
        "full_name": row[1] or "",
        "department_id": row[2],
        "faculty": row[3] or "",
        "position": row[4] or "",
        "academic_degree": row[5] or "",
        "academic_rank": row[6] or "",
        "staff_type": row[7] or "",
        "extra_data": row[8] or {},
        "department": row[9] or "",
    }


def _get_excel_by_year(cur, department_id: int, academic_year: str) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT id
        FROM excel_templates
        WHERE department_id = %s AND academic_year = %s;
        """,
        (department_id, academic_year),
    )
    row = cur.fetchone()
    if not row:
        raise Exception("Для этого года Excel не загружен")
    return {"id": int(row[0])}


def _get_raw_template_by_year(cur, department_id: int, academic_year: str) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT id, file_path
        FROM raw_docx_templates
        WHERE department_id = %s AND academic_year = %s;
        """,
        (department_id, academic_year),
    )
    row = cur.fetchone()
    if not row:
        raise Exception("Для этого года raw шаблон не загружен")
    return {"id": int(row[0]), "file_path": row[1]}


def _get_settings_for_excel(cur, excel_template_id: int) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT config
        FROM generation_settings
        WHERE excel_template_id = %s
        LIMIT 1;
        """,
        (excel_template_id,),
    )
    row = cur.fetchone()
    if not row:
        raise Exception("Нет настроек для этого Excel. Сначала сохрани Settings.")
    return row[0] or {}


def _get_excel_columns(cur, excel_template_id: int) -> List[tuple[str, str]]:
    cur.execute(
        """
        SELECT column_name, header_text
        FROM excel_columns
        WHERE template_id = %s
        ORDER BY position_index;
        """,
        (excel_template_id,),
    )
    return cur.fetchall()


def _get_excel_rows(cur, excel_template_id: int) -> List[Dict[str, Any]]:
    cur.execute(
        """
        SELECT row_data
        FROM excel_rows
        WHERE template_id = %s
        ORDER BY row_number;
        """,
        (excel_template_id,),
    )
    return [r[0] for r in cur.fetchall()]


def _get_raw_tables(cur, raw_template_id: int) -> Dict[int, Dict[str, Any]]:
    cur.execute(
        """
        SELECT
            id,
            table_index,
            section_title,
            table_type,
            row_count,
            col_count,
            header_signature,
            has_total_row,
            loop_template_row_index,
            column_hints,
            editable_cells_count,
            prefilled_cells_count,
            extra_meta
        FROM raw_docx_tables
        WHERE template_id = %s
        ORDER BY table_index;
        """,
        (raw_template_id,),
    )
    out = {}
    for r in cur.fetchall():
        out[int(r[0])] = {
            "id": int(r[0]),
            "table_index": int(r[1]),
            "section_title": r[2] or "",
            "table_type": r[3] or "",
            "row_count": int(r[4] or 0),
            "col_count": int(r[5] or 0),
            "header_signature": r[6] or "",
            "has_total_row": bool(r[7]),
            "loop_template_row_index": r[8] if r[8] is None else int(r[8]),
            "column_hints": r[9] or [],
            "editable_cells_count": int(r[10] or 0),
            "prefilled_cells_count": int(r[11] or 0),
            "extra_meta": r[12] or {},
        }
    return out


def _build_excel_context(
    teacher: Dict[str, Any],
    excel_columns: List[tuple[str, str]],
    excel_rows: List[Dict[str, Any]],
    settings_cfg: Dict[str, Any],
) -> Dict[str, Any]:
    cols_cfg = (settings_cfg or {}).get("columns") or {}

    teacher_col = cols_cfg.get("teacher_col")
    staff_hours_col = cols_cfg.get("staff_hours_col")
    hourly_hours_col = cols_cfg.get("hourly_hours_col")

    if not teacher_col or not staff_hours_col:
        raise Exception("Настройки неполные: columns.teacher_col и columns.staff_hours_col обязательны")

    col_to_header = {col_name: header_text for col_name, header_text in excel_columns}
    semester_map = detect_semester_columns(excel_columns)

    if not semester_map:
        raise Exception("Не найдены колонки семестров в Excel")

    teaching_load = {"staff": {}, "hourly": {}}

    for sem_key in semester_map.keys():
        staff_loop_key = f"blocks.teaching_load.staff.{sem_key}"
        hourly_loop_key = f"blocks.teaching_load.hourly.{sem_key}"

        teaching_load["staff"][sem_key] = build_block_rows(
            loop_key=staff_loop_key,
            excel_rows=excel_rows,
            col_to_header=col_to_header,
            teacher_full_name=teacher["full_name"],
            teacher_col=teacher_col,
            semester_map=semester_map,
            staff_hours_col=staff_hours_col,
            hourly_hours_col=hourly_hours_col,
            settings_cfg=settings_cfg,
        )

        teaching_load["hourly"][sem_key] = build_block_rows(
            loop_key=hourly_loop_key,
            excel_rows=excel_rows,
            col_to_header=col_to_header,
            teacher_full_name=teacher["full_name"],
            teacher_col=teacher_col,
            semester_map=semester_map,
            staff_hours_col=staff_hours_col,
            hourly_hours_col=hourly_hours_col,
            settings_cfg=settings_cfg,
        )

    return {
        "teacher": teacher,
        "teaching_load": teaching_load,
    }


def _render_header_fields(doc: Document, raw_tables: Dict[int, Dict[str, Any]], settings_cfg: Dict[str, Any], context: Dict[str, Any]):
    header_fields = ((settings_cfg or {}).get("template_bindings") or {}).get("header_fields") or {}
    teacher_ctx = context.get("teacher") or {}

    for field_key, bindings in header_fields.items():
        value = None

        if field_key.startswith("teacher."):
            attr = field_key.split(".", 1)[1]
            value = teacher_ctx.get(attr)

        if value is None:
            continue

        if not isinstance(bindings, list):
            continue

        for binding in bindings:
            raw_table_id = binding.get("raw_table_id")
            row_index = binding.get("row_index")
            col_index = binding.get("col_index")

            if raw_table_id is None or row_index is None or col_index is None:
                continue

            raw_table = raw_tables.get(int(raw_table_id))
            if not raw_table:
                continue

            table = _safe_get_table(doc, raw_table["table_index"])
            if table is None:
                continue

            cell = _safe_get_cell(table, int(row_index), int(col_index))
            _set_cell_text(cell, value)


def _build_row_payload(row_data: Dict[str, Any], row_order_config: List[str]) -> Dict[str, Any]:
    payload = {}
    for key in row_order_config:
        payload[key] = row_data.get(key, "")
    return payload


def _render_loop_rows_to_table(
    doc: Document,
    raw_table: Dict[str, Any],
    rows_data: List[Dict[str, Any]],
    row_order: List[str],
    col_map: Dict[str, int],
):
    table = _safe_get_table(doc, raw_table["table_index"])
    if table is None:
        return

    template_row_index = raw_table.get("loop_template_row_index")
    if template_row_index is None:
        return

    if template_row_index < 0 or template_row_index >= len(table.rows):
        return

    footer_row_index = _find_first_footer_row(table, template_row_index)

    if not rows_data:
        if footer_row_index is None:
            _clear_row(table.rows[template_row_index])
        return

    first_payload = _build_row_payload(rows_data[0], row_order)
    _clear_row(table.rows[template_row_index])
    _fill_cells_by_mapping(table, template_row_index, first_payload, col_map)

    current_last_row_index = template_row_index

    for item in rows_data[1:]:
        insert_before = footer_row_index if footer_row_index is not None else current_last_row_index + 1

        if insert_before >= len(table.rows):
            insert_before = len(table.rows) - 1

        new_row_index = _clone_row_before(table, insert_before)
        _clear_row(table.rows[new_row_index])

        payload = _build_row_payload(item, row_order)
        _fill_cells_by_mapping(table, new_row_index, payload, col_map)

        current_last_row_index = new_row_index

        if footer_row_index is not None:
            footer_row_index += 1


def _render_teaching_load(doc: Document, raw_tables: Dict[int, Dict[str, Any]], settings_cfg: Dict[str, Any], context: Dict[str, Any]):
    template_bindings = ((settings_cfg or {}).get("template_bindings") or {}).get("teaching_load") or {}
    table_column_bindings = (settings_cfg or {}).get("table_column_bindings") or {}
    row_orders = (settings_cfg or {}).get("table_row_orders") or {}

    teaching_load = context.get("teaching_load") or {}
    staff_ctx = teaching_load.get("staff") or {}
    hourly_ctx = teaching_load.get("hourly") or {}

    for load_kind, load_ctx in (("staff", staff_ctx), ("hourly", hourly_ctx)):
        kind_bindings = template_bindings.get(load_kind) or {}
        for sem_key, sem_rows in load_ctx.items():
            binding = kind_bindings.get(sem_key) or {}
            raw_table_id = binding.get("raw_table_id")
            if not raw_table_id:
                continue

            raw_table = raw_tables.get(int(raw_table_id))
            if not raw_table:
                continue

            col_map = table_column_bindings.get(str(raw_table_id)) or table_column_bindings.get(int(raw_table_id)) or {}
            row_order = row_orders.get(str(raw_table_id)) or row_orders.get(int(raw_table_id)) or list(col_map.keys())

            if not col_map or not row_order:
                continue

            _render_loop_rows_to_table(
                doc=doc,
                raw_table=raw_table,
                rows_data=sem_rows or [],
                row_order=row_order,
                col_map=col_map,
            )


def generate_docx_for_teacher(
    teacher_id: int,
    department_id: int,
    academic_year: str,
) -> str:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            teacher = _extract_teacher(cur, teacher_id)
            excel = _get_excel_by_year(cur, department_id, academic_year)
            raw_template = _get_raw_template_by_year(cur, department_id, academic_year)
            settings_cfg = _get_settings_for_excel(cur, excel["id"])
            excel_columns = _get_excel_columns(cur, excel["id"])
            excel_rows = _get_excel_rows(cur, excel["id"])
            raw_tables = _get_raw_tables(cur, raw_template["id"])

        context = _build_excel_context(
            teacher=teacher,
            excel_columns=excel_columns,
            excel_rows=excel_rows,
            settings_cfg=settings_cfg,
        )

        doc = Document(raw_template["file_path"])

        _render_header_fields(
            doc=doc,
            raw_tables=raw_tables,
            settings_cfg=settings_cfg,
            context=context,
        )

        _render_teaching_load(
            doc=doc,
            raw_tables=raw_tables,
            settings_cfg=settings_cfg,
            context=context,
        )

        safe_teacher_name = _safe_name(teacher["full_name"]) or f"teacher_{teacher_id}"
        output_path = str((Path(GENERATED_DIR) / f"IPP_{safe_teacher_name}_{academic_year}.docx").resolve())

        doc.save(output_path)

        apply_manual_fill_to_generated_docx(
            teacher_id=teacher_id,
            department_id=department_id,
            academic_year=academic_year,
            output_path=output_path,
        )

        return output_path

    finally:
        conn.close()