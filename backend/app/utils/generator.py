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
        return f"{value:.2f}".rstrip("0").rstrip(".")
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


def _clear_row(row):
    for cell in row.cells:
        cell.text = ""


def _clone_row_before(table, row_index: int):
    tr = table.rows[row_index]._tr
    new_tr = deepcopy(tr)
    tr.addprevious(new_tr)
    return row_index


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


def _row_text(table_row) -> str:
    return " ".join(_normalize_text(c.text).lower() for c in table_row.cells if _normalize_text(c.text)).strip()


def _find_semester_segment(table, sem_number: int) -> Optional[Dict[str, int]]:
    marker_variants = [
        f"{sem_number} сем.",
        f"{sem_number} сем",
        f"{sem_number} семестр",
        f"{sem_number} sem",
    ]
    total_variants = ["итого", "итог", "total", "всего", "барлығы"]

    marker_row_index = None

    for r_idx, row in enumerate(table.rows):
        txt = _row_text(row)
        if any(v in txt for v in marker_variants):
            marker_row_index = r_idx
            break

    if marker_row_index is None:
        return None

    total_row_index = None
    for r_idx in range(marker_row_index + 1, len(table.rows)):
        txt = _row_text(table.rows[r_idx])
        if any(v == txt or txt.startswith(v + " ") or v in txt for v in total_variants):
            total_row_index = r_idx
            break

    if total_row_index is None:
        return None

    template_row_index = marker_row_index + 1
    if template_row_index >= total_row_index:
        return None

    return {
        "marker_row_index": marker_row_index,
        "template_row_index": template_row_index,
        "total_row_index": total_row_index,
    }


def _guess_column_map(raw_table: Dict[str, Any], settings_cfg: Dict[str, Any]) -> Dict[str, int]:
    hints = [str(x).strip().lower() for x in (raw_table.get("column_hints") or [])]
    cols_cfg = (settings_cfg or {}).get("columns") or {}

    discipline_key = cols_cfg.get("discipline_col") or "distsiplina"
    group_key = cols_cfg.get("group_col") or "group_col"

    out = {}

    for idx, hint in enumerate(hints):
        if "наименование" in hint or "subject" in hint or "атауы" in hint:
            out[discipline_key] = idx
        elif "группа" in hint or "group" in hint:
            out[group_key] = idx
        elif "лек" in hint:
            out["l"] = idx
        elif "практ" in hint:
            out["spz"] = idx
        elif "лабор" in hint:
            out["lz"] = idx
        elif "срсп" in hint or "сроп" in hint:
            out["srsp"] = idx
        elif "рубеж" in hint:
            out["rk_1_2"] = idx
        elif "экзам" in hint:
            out["ekzameny"] = idx
        elif "итого" in hint and "час" in hint:
            out["itogo"] = idx

    if discipline_key not in out and len(hints) > 1:
        out[discipline_key] = 1
    if group_key not in out and len(hints) > 2:
        out[group_key] = 2
    if "l" not in out and len(hints) > 5:
        out["l"] = 5
    if "spz" not in out and len(hints) > 6:
        out["spz"] = 6
    if "lz" not in out and len(hints) > 7:
        out["lz"] = 7
    if "srsp" not in out and len(hints) > 8:
        out["srsp"] = 8
    if "rk_1_2" not in out and len(hints) > 9:
        out["rk_1_2"] = 9
    if "ekzameny" not in out and len(hints) > 10:
        out["ekzameny"] = 10

    return out


def _build_payload(row_data: Dict[str, Any], settings_cfg: Dict[str, Any]) -> Dict[str, Any]:
    cols_cfg = (settings_cfg or {}).get("columns") or {}

    discipline_key = cols_cfg.get("discipline_col") or "distsiplina"
    group_key = cols_cfg.get("group_col") or "group_col"

    return {
        discipline_key: row_data.get(discipline_key, ""),
        group_key: row_data.get(group_key, ""),
        "l": row_data.get("l", ""),
        "spz": row_data.get("spz", ""),
        "lz": row_data.get("lz", ""),
        "srsp": row_data.get("srsp", ""),
        "rk_1_2": row_data.get("rk_1_2", ""),
        "ekzameny": row_data.get("ekzameny", ""),
        "itogo": row_data.get("itogo", ""),
    }


def _fill_row_by_map(table, row_index: int, payload: Dict[str, Any], col_map: Dict[str, int]):
    for field_key, col_index in (col_map or {}).items():
        if field_key not in payload:
            continue
        cell = _safe_get_cell(table, row_index, int(col_index))
        _set_cell_text(cell, payload.get(field_key))


def _fill_semester_in_single_table(
    table,
    sem_segment: Dict[str, int],
    rows_data: List[Dict[str, Any]],
    col_map: Dict[str, int],
    settings_cfg: Dict[str, Any],
):
    template_row_index = sem_segment["template_row_index"]
    total_row_index = sem_segment["total_row_index"]

    available_slots = max(total_row_index - template_row_index, 0)
    if available_slots == 0:
        return

    payloads = [_build_payload(row, settings_cfg) for row in (rows_data or [])]

    if len(payloads) > available_slots:
        need_add = len(payloads) - available_slots
        for _ in range(need_add):
            _clone_row_before(table, total_row_index)
            total_row_index += 1

    for idx, payload in enumerate(payloads):
        row_index = template_row_index + idx
        if row_index >= total_row_index:
            break
        _clear_row(table.rows[row_index])
        _fill_row_by_map(table, row_index, payload, col_map)

    start_clear = template_row_index + len(payloads)
    for r_idx in range(start_clear, total_row_index):
        _clear_row(table.rows[r_idx])


def _render_teaching_load_for_kind(
    doc: Document,
    raw_tables: Dict[int, Dict[str, Any]],
    settings_cfg: Dict[str, Any],
    context: Dict[str, Any],
    load_kind: str,
):
    teaching_binding = (((settings_cfg or {}).get("template_bindings") or {}).get("teaching_load") or {}).get(load_kind) or {}
    raw_table_id = teaching_binding.get("raw_table_id")
    if not raw_table_id:
        return

    raw_table = raw_tables.get(int(raw_table_id))
    if not raw_table:
        return

    table = _safe_get_table(doc, raw_table["table_index"])
    if table is None:
        return

    col_map = _guess_column_map(raw_table, settings_cfg)
    sem1_segment = _find_semester_segment(table, 1)
    sem2_segment = _find_semester_segment(table, 2)

    rows_by_sem = (context.get("teaching_load") or {}).get(load_kind) or {}
    sem1_rows = rows_by_sem.get("sem1") or []
    sem2_rows = rows_by_sem.get("sem2") or []

    if sem1_segment:
        _fill_semester_in_single_table(
            table=table,
            sem_segment=sem1_segment,
            rows_data=sem1_rows,
            col_map=col_map,
            settings_cfg=settings_cfg,
        )

    if sem2_segment:
        _fill_semester_in_single_table(
            table=table,
            sem_segment=sem2_segment,
            rows_data=sem2_rows,
            col_map=col_map,
            settings_cfg=settings_cfg,
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

        _render_teaching_load_for_kind(
            doc=doc,
            raw_tables=raw_tables,
            settings_cfg=settings_cfg,
            context=context,
            load_kind="staff",
        )

        _render_teaching_load_for_kind(
            doc=doc,
            raw_tables=raw_tables,
            settings_cfg=settings_cfg,
            context=context,
            load_kind="hourly",
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