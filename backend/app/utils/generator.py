import re
from copy import deepcopy
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

from backend.app.config import GENERATED_DIR
from backend.app.database import get_connection
from backend.app.utils.manual_docx_filler import apply_manual_fill_to_generated_docx
from backend.app.utils.teaching_load import (
    build_effective_generation_settings,
    build_teaching_load_context,
    build_teaching_load_summary,
    get_teaching_load_binding,
    get_teaching_load_summary_binding,
    is_excel_source_binding,
    is_manual_source_binding,
    is_teaching_load_summary_raw_table,
)


TOTAL_TEXT_VARIANTS = ("итого", "итог", "total", "всего", "барлығы")
NUMERIC_TOTAL_FIELDS = (
    "l",
    "spz",
    "lz",
    "srsp",
    "rk_1_2",
    "ekzameny",
    "practika",
    "diploma_supervision",
    "research_work",
    "other_work",
    "itogo",
)
OFFICE_TOTAL_FIELDS = (
    "practika",
    "diploma_supervision",
    "research_work",
    "other_work",
)
CLASS_TOTAL_FIELDS = (
    "l",
    "spz",
    "lz",
    "srsp",
    "rk_1_2",
    "ekzameny",
)
PAYLOAD_FIELDS = (
    "discipline",
    "op",
    "group",
    "course",
    "academic_period",
    "credits",
    "student_count",
    "l",
    "spz",
    "lz",
    "srsp",
    "rk_1_2",
    "ekzameny",
    "practika",
    "diploma_supervision",
    "research_work",
    "other_work",
    "itogo",
)
SUMMARY_TABLE_COLUMN_MAP = {
    "l": 1,
    "spz": 2,
    "lz": 3,
    "srsp": 4,
    "rk_1_2": 5,
    "ekzameny": 6,
    "class_hours": 7,
    "practika": 8,
    "research_work": 9,
    "diploma_supervision": 10,
    "other_work": 11,
    "office_hours": 12,
    "itogo": 13,
}
PLAN_TEXT_VARIANTS = ("жоспар", "план", "plan", "planned")
IMPLEMENTATION_TEXT_VARIANTS = ("орындал", "выполн", "implementation", "actual")
ACTIVITY_TEXT_VARIANTS = (
    "жұмыс аталуы",
    "наименование работ",
    "activities",
    "виды работ",
)
ANNUAL_TEXT_VARIANTS = ("за учеб. год", "academic year", "год.план", "жылдық", "учебный год")
CLASS_TOTAL_TEXT_VARIANTS = ("total class hours", "всего аудит", "аудит. жұм. барлығы")
OFFICE_TOTAL_TEXT_VARIANTS = ("total office hours", "всего внеаудит", "ауд. тыс", "внеаудит. часов")


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def _normalize_text_lower(value: Any) -> str:
    return _normalize_text(value).lower()


def _to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return f"{value:.2f}".rstrip("0").rstrip(".")
    return str(value)


def _to_num(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", ".").strip())
    except Exception:
        return 0.0


def _safe_name(value: str) -> str:
    return re.sub(r"[^\w]+", "_", str(value or ""), flags=re.UNICODE).strip("_")


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


def _clone_row_before(table, row_index: int, source_row_index: Optional[int] = None):
    source_index = row_index if source_row_index is None else source_row_index
    tr = table.rows[source_index]._tr
    new_tr = deepcopy(tr)
    table.rows[row_index]._tr.addprevious(new_tr)
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
        return {}
    return row[0] or {}


def _get_excel_columns(cur, excel_template_id: int) -> List[Tuple[str, str]]:
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
    return [row[0] for row in cur.fetchall()]


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
            table_fingerprint,
            structure_meta,
            extra_meta
        FROM raw_docx_tables
        WHERE template_id = %s
        ORDER BY table_index;
        """,
        (raw_template_id,),
    )
    out: Dict[int, Dict[str, Any]] = {}
    for row in cur.fetchall():
        out[int(row[0])] = {
            "id": int(row[0]),
            "table_index": int(row[1]),
            "section_title": row[2] or "",
            "table_type": row[3] or "",
            "row_count": int(row[4] or 0),
            "col_count": int(row[5] or 0),
            "header_signature": row[6] or "",
            "has_total_row": bool(row[7]),
            "loop_template_row_index": row[8] if row[8] is None else int(row[8]),
            "column_hints": row[9] or [],
            "editable_cells_count": int(row[10] or 0),
            "prefilled_cells_count": int(row[11] or 0),
            "table_fingerprint": row[12] or "",
            "structure_meta": row[13] or {},
            "extra_meta": row[14] or {},
        }
    return out


def _build_excel_context(
    teacher: Dict[str, Any],
    excel_columns: List[Tuple[str, str]],
    excel_rows: List[Dict[str, Any]],
    settings_cfg: Dict[str, Any],
    academic_year: str,
) -> Dict[str, Any]:
    return build_teaching_load_context(
        teacher=teacher,
        excel_columns=excel_columns,
        excel_rows=excel_rows,
        settings_cfg=settings_cfg,
        academic_year=academic_year,
    )


def _short_teacher_name(full_name: str) -> str:
    parts = [part for part in _normalize_text(full_name).split(" ") if part]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    initials = "".join(f"{part[0]}." for part in parts[1:] if part)
    return f"{parts[0]} {initials}".strip()


def _academic_year_label(academic_year: str) -> str:
    match = re.match(r"^\s*(\d{4})\s*[-/]\s*(\d{4})\s*$", str(academic_year or "").strip())
    if not match:
        return str(academic_year or "")
    return f"{match.group(1)} - {match.group(2)} оқу жылы/ учебный год/ academic year"


def _profile_field_value(teacher: Dict[str, Any], field_key: str) -> str:
    if field_key == "staff_type":
        return _to_str(teacher.get("staff_type"))
    if field_key == "position":
        return _to_str(teacher.get("position"))
    if field_key == "academic_degree":
        degree = _to_str(teacher.get("academic_degree"))
        rank = _to_str(teacher.get("academic_rank"))
        if degree and rank and degree != rank:
            return f"{degree}, {rank}"
        return degree or rank
    if field_key == "full_name":
        return _short_teacher_name(_to_str(teacher.get("full_name")))
    if field_key == "department":
        return _to_str(teacher.get("department"))
    if field_key == "faculty":
        return _to_str(teacher.get("faculty"))
    return ""


def _field_patterns() -> Dict[str, Tuple[str, ...]]:
    return {
        "staff_type": ("штаттағы", "штатный", "совместитель", "staff, part-time"),
        "position": ("должность", "position"),
        "academic_degree": ("уч.степень", "звание", "academic degree", "academic rank"),
        "full_name": ("фио преподавателя", "last name, name, patronymic"),
        "department": ("кафедра", "department"),
        "faculty": ("факультет", "faculty"),
    }


def _match_profile_field(text: str) -> Optional[str]:
    norm_text = _normalize_text_lower(text)
    if not norm_text:
        return None
    for field_key, patterns in _field_patterns().items():
        if any(pattern in norm_text for pattern in patterns):
            return field_key
    return None


def _fill_row_segment(row, start_col: int, end_col: int, value: str) -> None:
    if start_col >= end_col:
        return
    for col_index in range(start_col, end_col):
        try:
            row.cells[col_index].text = value
        except Exception:
            continue


def _render_teacher_profile(doc: Document, teacher: Dict[str, Any], academic_year: str) -> None:
    academic_year_label = _academic_year_label(academic_year)

    for table in doc.tables:
        for row in table.rows:
            row_text = " ".join(_normalize_text(cell.text) for cell in row.cells if _normalize_text(cell.text))
            if not row_text:
                continue

            row_text_norm = _normalize_text_lower(row_text)
            if "оқу жылы" in row_text_norm and "academic year" in row_text_norm:
                for cell in row.cells:
                    cell.text = academic_year_label
                continue

            label_positions: List[Tuple[int, str]] = []
            for col_index, cell in enumerate(row.cells):
                field_key = _match_profile_field(cell.text)
                if field_key:
                    label_positions.append((col_index, field_key))

            if not label_positions:
                continue

            for idx, (label_col, field_key) in enumerate(label_positions):
                next_label_col = label_positions[idx + 1][0] if idx + 1 < len(label_positions) else len(row.cells)
                value = _profile_field_value(teacher, field_key)
                if not value:
                    continue
                _fill_row_segment(row, label_col + 1, next_label_col, value)


def _row_text(table_row) -> str:
    return " ".join(_normalize_text(cell.text).lower() for cell in table_row.cells if _normalize_text(cell.text)).strip()


def _is_total_text(text: str) -> bool:
    return any(variant in text for variant in TOTAL_TEXT_VARIANTS)


def _parse_scope_from_text(text: str) -> tuple[int, ...]:
    norm = _normalize_text(text).lower()
    if not norm:
        return ()
    if "контроль" in norm and not _is_total_text(norm):
        return ()

    match = re.match(r"^\s*(\d+(?:\s*,\s*\d+)*)", norm)
    if not match:
        return ()

    if "сем" not in norm and "sem" not in norm and not re.fullmatch(r"\d+(?:\s*,\s*\d+)*", norm):
        return ()

    numbers: List[int] = []
    for part in match.group(1).split(","):
        try:
            number = int(part.strip())
        except Exception:
            continue
        if 0 < number <= 12 and number not in numbers:
            numbers.append(number)
    return tuple(numbers)


def _detect_table_blocks(table, raw_table: Dict[str, Any]) -> List[Dict[str, Any]]:
    default_insert_start = int(raw_table.get("loop_template_row_index") or 1)
    rows_meta: List[Dict[str, Any]] = []

    for row_index, row in enumerate(table.rows):
        text = _row_text(row)
        scope = _parse_scope_from_text(text)
        rows_meta.append(
            {
                "row_index": row_index,
                "scope": scope,
                "is_total": bool(scope and _is_total_text(text)),
            }
        )

    total_rows = [item for item in rows_meta if item["is_total"]]
    blocks: List[Dict[str, Any]] = []
    prev_total_row_index: Optional[int] = None

    for total_row in total_rows:
        search_start = default_insert_start if prev_total_row_index is None else prev_total_row_index + 1
        label_row_index = None

        for candidate in rows_meta:
            candidate_row_index = int(candidate["row_index"])
            if candidate_row_index < search_start or candidate_row_index >= int(total_row["row_index"]):
                continue
            if candidate["scope"] == total_row["scope"] and not candidate["is_total"]:
                label_row_index = candidate_row_index

        insert_start = label_row_index + 1 if label_row_index is not None else search_start
        if insert_start > int(total_row["row_index"]):
            insert_start = int(total_row["row_index"])

        blocks.append(
            {
                "scope": tuple(total_row["scope"]),
                "scope_key": ",".join(str(x) for x in total_row["scope"]),
                "label_row_index": label_row_index,
                "insert_start_row_index": insert_start,
                "total_row_index": int(total_row["row_index"]),
            }
        )
        prev_total_row_index = int(total_row["row_index"])

    return blocks


def _guess_column_map(raw_table: Dict[str, Any]) -> Dict[str, int]:
    hints = [str(value).strip().lower() for value in (raw_table.get("column_hints") or [])]
    out: Dict[str, int] = {}

    for idx, hint in enumerate(hints):
        if "наименование" in hint or "subject" in hint or "пән" in hint:
            out["discipline"] = idx
        elif "образовательная программа" in hint or hint == "оп" or "program" in hint:
            out["op"] = idx
        elif "группа" in hint or "group" in hint:
            out["group"] = idx
        elif "академ" in hint or "period" in hint:
            out["academic_period"] = idx
        elif "курс" in hint or hint == "course":
            out["course"] = idx
        elif "кредит" in hint:
            out["credits"] = idx
        elif "обуча" in hint or "контингент" in hint or "students" in hint:
            out["student_count"] = idx
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
        elif "практика" in hint:
            out["practika"] = idx
        elif "рук-во дп" in hint or "дп и мд" in hint or "диссертац" in hint:
            out["diploma_supervision"] = idx
        elif "нирм" in hint or "нирд" in hint:
            out["research_work"] = idx
        elif "двр" in hint or "другой" in hint or "дополнительн" in hint:
            out["other_work"] = idx
        elif "итого" in hint and "час" in hint:
            out["itogo"] = idx

    fallback_indexes = {
        "discipline": 1,
        "group": 2,
    }

    for field_key, fallback_index in fallback_indexes.items():
        if field_key in out:
            continue
        if len(hints) > fallback_index:
            out[field_key] = fallback_index

    return out


def _display_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, (int, float)) and abs(float(value)) < 1e-9:
        return ""
    return value


def _build_payload(row_data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        field_key: _display_value(row_data.get(field_key, ""))
        for field_key in PAYLOAD_FIELDS
    }


def _fill_row_by_map(table, row_index: int, payload: Dict[str, Any], col_map: Dict[str, int]):
    for field_key, col_index in (col_map or {}).items():
        if field_key not in payload:
            continue
        cell = _safe_get_cell(table, row_index, int(col_index))
        _set_cell_text(cell, payload.get(field_key))


def _fill_total_row(table, row_index: int, totals: Dict[str, Any], col_map: Dict[str, int]):
    payload = {
        field_key: _display_value(value)
        for field_key, value in (totals or {}).items()
    }
    _fill_row_by_map(
        table=table,
        row_index=row_index,
        payload={field_key: payload.get(field_key, "") for field_key in NUMERIC_TOTAL_FIELDS},
        col_map=col_map,
    )


def _render_scope_block(
    table,
    block: Dict[str, Any],
    rows_data: List[Dict[str, Any]],
    totals: Dict[str, Any],
    col_map: Dict[str, int],
):
    insert_start_row_index = int(block["insert_start_row_index"])
    total_row_index = int(block["total_row_index"])
    available_slots = max(total_row_index - insert_start_row_index, 0)
    payloads = [_build_payload(row) for row in (rows_data or [])]

    if len(payloads) > available_slots:
        need_add = len(payloads) - available_slots
        for _ in range(need_add):
            source_row_index = max(insert_start_row_index, total_row_index - 1)
            _clone_row_before(table, total_row_index, source_row_index=source_row_index)
            total_row_index += 1

    for idx, payload in enumerate(payloads):
        row_index = insert_start_row_index + idx
        if row_index >= total_row_index:
            break
        _clear_row(table.rows[row_index])
        _fill_row_by_map(table, row_index, payload, col_map)

    start_clear = insert_start_row_index + len(payloads)
    for row_index in range(start_clear, total_row_index):
        _clear_row(table.rows[row_index])

    _fill_total_row(table, total_row_index, totals or {}, col_map)


def _find_annual_total_row_index(table, last_semester_total_row_index: int) -> Optional[int]:
    for row_index in range(last_semester_total_row_index + 1, len(table.rows)):
        text = _row_text(table.rows[row_index])
        if _is_total_text(text) and not _parse_scope_from_text(text):
            return row_index
    return None


def _map_scope_rows_to_blocks(
    rows_by_scope: Dict[str, List[Dict[str, Any]]],
    blocks: List[Dict[str, Any]],
    primary_common_scope_key: Optional[str],
) -> Dict[str, List[Dict[str, Any]]]:
    mapped: Dict[str, List[Dict[str, Any]]] = {
        block["scope_key"]: list(rows_by_scope.get(block["scope_key"]) or [])
        for block in blocks
    }
    available_scope_keys = {block["scope_key"] for block in blocks}
    common_block_keys = [block["scope_key"] for block in blocks if "," in block["scope_key"]]

    for scope_key, rows in (rows_by_scope or {}).items():
        if scope_key in available_scope_keys:
            continue

        fallback_scope_key = None
        if primary_common_scope_key and primary_common_scope_key in available_scope_keys:
            fallback_scope_key = primary_common_scope_key
        elif common_block_keys:
            fallback_scope_key = common_block_keys[-1]

        if not fallback_scope_key:
            continue

        mapped.setdefault(fallback_scope_key, []).extend(rows)

    for scope_key, rows in mapped.items():
        rows.sort(key=lambda item: item.get("_row_order") or 0)
        mapped[scope_key] = rows

    return mapped


def _sum_scope_rows(rows: List[Dict[str, Any]]) -> Dict[str, float]:
    totals = {field_key: 0.0 for field_key in NUMERIC_TOTAL_FIELDS}
    for row in rows or []:
        for field_key in NUMERIC_TOTAL_FIELDS:
            value = row.get(field_key)
            if value is None:
                continue
            try:
                totals[field_key] += float(value)
            except Exception:
                continue
    return totals


def _annual_office_totals_only(load_context: Dict[str, Any]) -> Dict[str, float]:
    annual_totals = (load_context or {}).get("annual_totals") or {}
    totals = {field_key: 0.0 for field_key in NUMERIC_TOTAL_FIELDS}

    for field_key in OFFICE_TOTAL_FIELDS:
        totals[field_key] = _to_num(annual_totals.get(field_key))

    totals["itogo"] = round(sum(totals[field_key] for field_key in OFFICE_TOTAL_FIELDS), 2)
    return totals


def _resolve_teaching_load_summary_raw_table(
    raw_tables: Dict[int, Dict[str, Any]],
    settings_cfg: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    summary_binding = get_teaching_load_summary_binding(settings_cfg)
    raw_table_id = summary_binding.get("raw_table_id")

    if summary_binding and is_manual_source_binding(summary_binding):
        return None

    if raw_table_id and is_excel_source_binding(summary_binding):
        raw_table = raw_tables.get(int(raw_table_id))
        if raw_table:
            return raw_table

    summary_tables = [
        raw_table
        for raw_table in (raw_tables or {}).values()
        if is_teaching_load_summary_raw_table(raw_table)
    ]
    if not summary_tables:
        return None

    summary_tables.sort(key=lambda item: int(item.get("table_index") or 0))
    return summary_tables[0]


def _find_summary_row_index(table, *patterns: str) -> Optional[int]:
    lowered_patterns = tuple(pattern.lower() for pattern in patterns if pattern)
    for row_index, row in enumerate(table.rows):
        first_cell_text = _normalize_text(row.cells[0].text if row.cells else "").lower()
        if not first_cell_text:
            continue
        if any(pattern in first_cell_text for pattern in lowered_patterns):
            return row_index
    return None


def _find_teaching_load_summary_row_indexes(table) -> Dict[str, int]:
    row_indexes = {
        "1": _find_summary_row_index(table, "1st term workload", "plan 1 sem"),
        "2": _find_summary_row_index(table, "2nd term workload", "plan 2 sem"),
        "annual": _find_summary_row_index(table, "academic year workload", "год.план"),
    }

    fallback_indexes = {"1": 2, "2": 3, "annual": 4}
    for key, fallback_index in fallback_indexes.items():
        if row_indexes.get(key) is None and len(table.rows) > fallback_index:
            row_indexes[key] = fallback_index

    return {key: value for key, value in row_indexes.items() if value is not None}


def _fill_teaching_load_summary_row(table, row_index: int, payload: Dict[str, Any]) -> None:
    for field_key, col_index in SUMMARY_TABLE_COLUMN_MAP.items():
        cell = _safe_get_cell(table, row_index, col_index)
        _set_cell_text(cell, _display_value((payload or {}).get(field_key)))


def _find_workload_overview_row_indexes(table) -> Dict[str, int]:
    row_indexes: Dict[str, int] = {}

    for row_index, row in enumerate(table.rows):
        if len(row.cells) < 8:
            continue

        activity_text = _normalize_text(row.cells[1].text if len(row.cells) > 1 else "").lower()
        scope_text = _normalize_text(row.cells[2].text if len(row.cells) > 2 else "").lower()
        if "teaching workload" not in activity_text:
            continue

        if "внеаудитор" in scope_text:
            row_indexes["office"] = row_index
        elif "аудитор" in scope_text:
            row_indexes["class"] = row_index

    return row_indexes


def _fill_workload_overview_row(
    table,
    row_index: int,
    *,
    sem1_value: Any,
    sem2_value: Any,
    annual_value: Any,
) -> None:
    payload = {
        3: sem1_value,
        5: sem2_value,
        7: annual_value,
    }
    for col_index, value in payload.items():
        cell = _safe_get_cell(table, row_index, col_index)
        _set_cell_text(cell, _display_value(value))


def _render_workload_overview_table(doc: Document, context: Dict[str, Any]) -> None:
    summary = build_teaching_load_summary((context.get("teaching_load") or {}), load_kind="staff")
    by_semester = summary.get("by_semester") or {}
    annual = summary.get("annual") or {}

    for table in doc.tables:
        row_indexes = _find_workload_overview_row_indexes(table)
        if not row_indexes:
            continue

        if row_indexes.get("class") is not None:
            _fill_workload_overview_row(
                table,
                row_indexes["class"],
                sem1_value=(by_semester.get("1") or {}).get("class_hours"),
                sem2_value=(by_semester.get("2") or {}).get("class_hours"),
                annual_value=annual.get("class_hours"),
            )
        if row_indexes.get("office") is not None:
            _fill_workload_overview_row(
                table,
                row_indexes["office"],
                sem1_value=(by_semester.get("1") or {}).get("office_hours"),
                sem2_value=(by_semester.get("2") or {}).get("office_hours"),
                annual_value=annual.get("office_hours"),
            )
        return


def _render_teaching_load_summary(
    doc: Document,
    raw_tables: Dict[int, Dict[str, Any]],
    settings_cfg: Dict[str, Any],
    context: Dict[str, Any],
) -> None:
    raw_table = _resolve_teaching_load_summary_raw_table(raw_tables, settings_cfg)
    if not raw_table:
        return

    table = _safe_get_table(doc, int(raw_table["table_index"]))
    if table is None:
        return

    row_indexes = _find_teaching_load_summary_row_indexes(table)
    if not row_indexes:
        return

    summary = build_teaching_load_summary((context.get("teaching_load") or {}), load_kind="staff")
    by_semester = summary.get("by_semester") or {}

    if row_indexes.get("1") is not None:
        _fill_teaching_load_summary_row(table, row_indexes["1"], by_semester.get("1") or {})
    if row_indexes.get("2") is not None:
        _fill_teaching_load_summary_row(table, row_indexes["2"], by_semester.get("2") or {})
    if row_indexes.get("annual") is not None:
        _fill_teaching_load_summary_row(table, row_indexes["annual"], summary.get("annual") or {})


def _render_teaching_load_for_kind(
    doc: Document,
    raw_tables: Dict[int, Dict[str, Any]],
    settings_cfg: Dict[str, Any],
    context: Dict[str, Any],
    load_kind: str,
):
    teaching_binding = get_teaching_load_binding(settings_cfg, load_kind)
    if teaching_binding and is_manual_source_binding(teaching_binding):
        return

    raw_table_id = teaching_binding.get("raw_table_id")
    if not raw_table_id:
        return

    raw_table = raw_tables.get(int(raw_table_id))
    if not raw_table:
        return

    table = _safe_get_table(doc, raw_table["table_index"])
    if table is None:
        return

    blocks = _detect_table_blocks(table, raw_table)
    if not blocks:
        return

    col_map = _guess_column_map(raw_table)
    teaching_load = (context.get("teaching_load") or {})
    load_context = teaching_load.get(load_kind) or {}
    rows_by_scope = load_context.get("rows_by_scope") or {}
    mapped_rows = _map_scope_rows_to_blocks(
        rows_by_scope=rows_by_scope,
        blocks=blocks,
        primary_common_scope_key=teaching_load.get("primary_common_scope_key"),
    )

    for block in sorted(blocks, key=lambda item: item["total_row_index"], reverse=True):
        scope_key = block["scope_key"]
        scope_rows = mapped_rows.get(scope_key) or []
        block_totals = _sum_scope_rows(scope_rows)
        if scope_key == teaching_load.get("primary_common_scope_key") and len(block.get("scope") or ()) > 1:
            annual_office_totals = _annual_office_totals_only(load_context)
            if annual_office_totals["itogo"] > _to_num(block_totals.get("itogo")):
                block_totals = annual_office_totals
        _render_scope_block(
            table=table,
            block=block,
            rows_data=scope_rows,
            totals=block_totals,
            col_map=col_map,
        )

    annual_total_row_index = _find_annual_total_row_index(
        table,
        max(block["total_row_index"] for block in blocks),
    )
    if annual_total_row_index is not None:
        _fill_total_row(
            table=table,
            row_index=annual_total_row_index,
            totals=load_context.get("annual_totals") or {},
            col_map=col_map,
        )


def _render_all_teaching_loads(
    doc: Document,
    raw_tables: Dict[int, Dict[str, Any]],
    settings_cfg: Dict[str, Any],
    context: Dict[str, Any],
):
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
    _render_teaching_load_summary(
        doc=doc,
        raw_tables=raw_tables,
        settings_cfg=settings_cfg,
        context=context,
    )
    _render_workload_overview_table(
        doc=doc,
        context=context,
    )


def _contains_any(text: str, variants: Tuple[str, ...]) -> bool:
    return any(variant in text for variant in variants)


def _max_table_cols(table) -> int:
    return max((len(row.cells) for row in table.rows), default=0)


def _cell_text_at(table, row_index: int, col_index: int) -> str:
    cell = _safe_get_cell(table, row_index, col_index)
    if cell is None:
        return ""
    return _normalize_text(cell.text)


def _row_joined_text(row, *, lower: bool = True) -> str:
    text = " ".join(_normalize_text(cell.text) for cell in row.cells if _normalize_text(cell.text))
    return text.lower() if lower else text


def _table_head_text(table, row_count: int = 2) -> str:
    parts: List[str] = []
    for row in table.rows[:row_count]:
        parts.extend(_normalize_text(cell.text) for cell in row.cells if _normalize_text(cell.text))
    return " ".join(parts).lower()


def _is_performance_overview_table(table) -> bool:
    head_text = _table_head_text(table, row_count=3)
    has_semester = "семестр" in head_text or "semester" in head_text or "term" in head_text
    return (
        _contains_any(head_text, ACTIVITY_TEXT_VARIANTS)
        and _contains_any(head_text, PLAN_TEXT_VARIANTS)
        and _contains_any(head_text, ANNUAL_TEXT_VARIANTS)
        and has_semester
    )


def _header_scope_from_text(text: str) -> Optional[Any]:
    norm = _normalize_text_lower(text)
    if _contains_any(norm, ANNUAL_TEXT_VARIANTS) and not re.search(r"\d+\s*(сем|semester|term)", norm):
        return "annual"

    match = re.search(r"(\d+)\s*(?:семестр|сем\.?|semester|term)", norm, flags=re.IGNORECASE)
    if not match:
        match = re.search(r"(\d+)(?:st|nd|rd|th)\s*(?:term|semester)", norm, flags=re.IGNORECASE)
    if not match:
        return None

    try:
        return int(match.group(1))
    except Exception:
        return None


def _detect_overview_plan_columns(table) -> Dict[str, Any]:
    out = {"semesters": {}, "annual": None}
    max_cols = _max_table_cols(table)
    header_row_count = min(3, len(table.rows))

    for col_index in range(max_cols):
        parts = [
            _cell_text_at(table, row_index, col_index)
            for row_index in range(header_row_count)
        ]
        header_text = _normalize_text_lower(" ".join(part for part in parts if part))

        if not _contains_any(header_text, PLAN_TEXT_VARIANTS):
            continue
        if _contains_any(header_text, IMPLEMENTATION_TEXT_VARIANTS):
            continue

        scope = _header_scope_from_text(header_text)
        if scope == "annual":
            out["annual"] = col_index
        elif isinstance(scope, int):
            out["semesters"].setdefault(scope, col_index)

    return out


def _context_semesters(context: Dict[str, Any]) -> List[int]:
    semesters = []
    for value in ((context.get("teaching_load") or {}).get("semesters") or []):
        try:
            semesters.append(int(value))
        except Exception:
            continue
    return sorted(set(semesters))


def _semester_numbers(plan_columns: Dict[str, Any], context: Dict[str, Any]) -> List[int]:
    from_table = sorted(int(value) for value in (plan_columns.get("semesters") or {}).keys())
    if from_table:
        return from_table
    return _context_semesters(context)


def _leading_section_number(text: Any) -> Optional[int]:
    match = re.match(r"^\s*(\d+)", _normalize_text(text))
    if not match:
        return None
    try:
        return int(match.group(1))
    except Exception:
        return None


def _best_table_context_title(recent_paragraphs: List[str]) -> str:
    if not recent_paragraphs:
        return ""

    last_text = recent_paragraphs[-1]
    if len(recent_paragraphs) >= 2:
        prev_text = recent_paragraphs[-2]
        if _leading_section_number(prev_text) and not _leading_section_number(last_text) and len(last_text) < 140:
            return f"{prev_text} {last_text}"

    return last_text


def _iter_doc_tables_with_context(doc: Document) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    recent_paragraphs: List[str] = []
    table_index = 0

    for child in doc.element.body.iterchildren():
        if isinstance(child, CT_P):
            paragraph_text = _normalize_text(Paragraph(child, doc).text)
            if paragraph_text:
                recent_paragraphs.append(paragraph_text)
                recent_paragraphs = recent_paragraphs[-6:]
            continue

        if isinstance(child, CT_Tbl):
            out.append(
                {
                    "table_index": table_index,
                    "table": Table(child, doc),
                    "title": _best_table_context_title(recent_paragraphs),
                }
            )
            table_index += 1

    return out


def _find_performance_overview_item(table_items: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    matches = [item for item in table_items if _is_performance_overview_table(item["table"])]
    return matches[-1] if matches else None


def _is_activity_plan_table(table) -> bool:
    if _is_performance_overview_table(table):
        return False

    head_text = _table_head_text(table, row_count=2)
    has_activity_header = _contains_any(head_text, ACTIVITY_TEXT_VARIANTS)
    has_plan_header = (
        _contains_any(head_text, PLAN_TEXT_VARIANTS)
        or "workload" in head_text
        or "объем работы" in head_text
        or "көлемі" in head_text
        or "сағат" in head_text
        or "часы" in head_text
        or "hrs" in head_text
    )
    return has_activity_header and has_plan_header and _max_table_cols(table) >= 3


def _activity_value_column(table) -> Optional[int]:
    max_cols = _max_table_cols(table)
    if max_cols <= 0:
        return None

    best_col = max_cols - 1
    best_score = -1.0

    for col_index in range(max_cols):
        if col_index == 0:
            continue

        header_text = _normalize_text_lower(
            " ".join(_cell_text_at(table, row_index, col_index) for row_index in range(min(2, len(table.rows))))
        )
        score = 0.0
        if _contains_any(header_text, PLAN_TEXT_VARIANTS):
            score += 3.0
        if any(marker in header_text for marker in ("workload", "объем", "көлем", "сағат", "часы", "hrs", "час")):
            score += 2.0
        if _contains_any(header_text, ACTIVITY_TEXT_VARIANTS):
            score -= 3.0
        if col_index == max_cols - 1:
            score += 0.75

        if score > best_score:
            best_col = col_index
            best_score = score

    return best_col


def _numeric_cell_value(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)

    text = _normalize_text(value).replace(",", ".")
    if not text:
        return 0.0

    compact = re.sub(r"[\s/]+", "", text)
    if re.fullmatch(r"-?\d+(?:\.\d+)?", compact):
        return float(compact)

    if re.search(r"[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]", text):
        return 0.0

    matches = re.findall(r"-?\d+(?:\.\d+)?", text)
    if len(matches) == 1:
        return float(matches[0])
    return 0.0


def _strict_numeric_cell_value(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)

    text = _normalize_text(value).replace(",", ".")
    if re.fullmatch(r"-?\d+(?:\.\d+)?", text):
        return float(text)
    return 0.0


def _round_hours(value: Any) -> float:
    rounded = round(_to_num(value), 2)
    return 0.0 if abs(rounded) < 1e-9 else rounded


def _add_amount(target: Dict[int, float], key: int, value: Any) -> None:
    target[key] = _round_hours(target.get(key, 0.0) + _to_num(value))


def _split_evenly(value: float, semesters: List[int]) -> Dict[int, float]:
    if not semesters or value <= 0:
        return {}

    share = round(value / len(semesters), 2)
    out: Dict[int, float] = {}
    assigned = 0.0

    for sem_num in semesters[:-1]:
        out[sem_num] = share
        assigned += share

    out[semesters[-1]] = _round_hours(value - assigned)
    return out


def _scope_key_to_semesters(scope_key: Any) -> Tuple[int, ...]:
    out: List[int] = []
    for part in str(scope_key or "").split(","):
        try:
            sem_num = int(str(part).strip())
        except Exception:
            continue
        if sem_num > 0 and sem_num not in out:
            out.append(sem_num)
    return tuple(out)


def _has_class_workload(row: Dict[str, Any]) -> bool:
    return any(_to_num(row.get(field_key)) > 0 for field_key in CLASS_TOTAL_FIELDS)


def _activity_distribution_features(context: Dict[str, Any], semesters: List[int]) -> Dict[str, Any]:
    features = {
        "lecture_hours": {sem_num: 0.0 for sem_num in semesters},
        "student_count": {sem_num: 0.0 for sem_num in semesters},
        "discipline_sets": {sem_num: set() for sem_num in semesters},
    }
    staff_load = (((context or {}).get("teaching_load") or {}).get("staff") or {})
    rows_by_scope = staff_load.get("rows_by_scope") or {}

    for scope_key, rows in rows_by_scope.items():
        scope = _scope_key_to_semesters(scope_key)
        if not scope:
            continue

        for row in rows or []:
            if not _has_class_workload(row):
                continue

            lecture_share = _to_num(row.get("l")) / len(scope)
            student_share = _to_num(row.get("student_count")) / len(scope)
            discipline = _normalize_text_lower(row.get("discipline"))

            for sem_num in scope:
                if sem_num not in features["lecture_hours"]:
                    continue
                features["lecture_hours"][sem_num] += lecture_share
                features["student_count"][sem_num] += student_share
                if discipline:
                    features["discipline_sets"][sem_num].add(discipline)

    features["discipline_count"] = {
        sem_num: len(features["discipline_sets"].get(sem_num) or set())
        for sem_num in semesters
    }
    return features


def _scale_distribution_to_total(values: Dict[int, float], total: float, semesters: List[int]) -> Dict[int, float]:
    source_total = _round_hours(sum(values.values()))
    if source_total <= 0 or total <= 0:
        return {}

    out: Dict[int, float] = {}
    assigned = 0.0
    ordered_semesters = [sem_num for sem_num in semesters if sem_num in values] or sorted(values.keys())

    for sem_num in ordered_semesters[:-1]:
        scaled = round(total * values.get(sem_num, 0.0) / source_total, 2)
        out[sem_num] = scaled
        assigned += scaled

    out[ordered_semesters[-1]] = _round_hours(total - assigned)
    return out


def _proportional_distribution(
    source_values: Dict[int, float],
    total: float,
    semesters: List[int],
) -> Dict[int, float]:
    positive_values = {
        int(sem_num): _to_num(value)
        for sem_num, value in (source_values or {}).items()
        if _to_num(value) > 0
    }
    return _scale_distribution_to_total(positive_values, total, semesters)


def _last_semester_distribution(total: float, semesters: List[int]) -> Dict[int, float]:
    if not semesters or total <= 0:
        return {}
    return {semesters[-1]: _round_hours(total)}


def _first_semester_distribution(total: float, semesters: List[int]) -> Dict[int, float]:
    if not semesters or total <= 0:
        return {}
    return {semesters[0]: _round_hours(total)}


def _multiplier_formula_distribution(
    text: str,
    total: float,
    source_values: Dict[int, float],
    semesters: List[int],
) -> Dict[int, float]:
    if total <= 0:
        return {}

    matches = re.findall(
        r"(\d+(?:[.,]\d+)?)\s*(?:студ|student|дисц|дисциплин|discipline)[^0-9]{0,20}[*xх]\s*(\d+(?:[.,]\d+)?)",
        text,
        flags=re.IGNORECASE,
    )
    if not matches:
        return {}

    try:
        count = float(str(matches[-1][0]).replace(",", "."))
        multiplier = float(str(matches[-1][1]).replace(",", "."))
    except Exception:
        return {}

    source_total = _round_hours(sum(_to_num(value) for value in (source_values or {}).values()))
    if source_total > 0 and count > 0 and abs(source_total - count) > max(0.1, count * 0.2):
        return {}

    raw_distribution = {
        sem_num: _round_hours(_to_num(source_values.get(sem_num)) * multiplier)
        for sem_num in semesters
    }
    return _scale_distribution_to_total(raw_distribution, total, semesters)


def _semantic_activity_distribution(
    *,
    row_text: str,
    table_title: str,
    total: float,
    features: Dict[str, Any],
    semesters: List[int],
) -> Dict[int, float]:
    if total <= 0:
        return {}

    text = _normalize_text_lower(row_text)
    title = _normalize_text_lower(table_title)

    if any(token in text for token in ("взаимопосещ", "mutual visit", "peer observation")):
        return _last_semester_distribution(total, semesters)

    if any(token in text for token in ("диплом", "дп", "мд", "диссертац")):
        return _last_semester_distribution(total, semesters)

    if any(token in text for token in ("лекц", "lecture", "дәріс")):
        distribution = _proportional_distribution(features.get("lecture_hours") or {}, total, semesters)
        if distribution:
            return distribution

    if any(token in text for token in ("студ", "student")):
        distribution = _multiplier_formula_distribution(
            text,
            total,
            features.get("student_count") or {},
            semesters,
        )
        if distribution:
            return distribution

    if any(token in text for token in ("дисц", "дисциплин", "discipline")):
        distribution = _multiplier_formula_distribution(
            text,
            total,
            features.get("discipline_count") or {},
            semesters,
        )
        if distribution:
            return distribution

    if "повышение квалификации" in title or "professional development" in title:
        if any(token in text for token in ("текущ", "чтение", "current")):
            return _first_semester_distribution(total, semesters)
        if any(token in text for token in ("курс", "сертифик", "семинар", "тренинг", "course", "training")):
            return _last_semester_distribution(total, semesters)

    return {}


def _semester_amounts_from_text(text: str) -> Dict[int, float]:
    norm = _normalize_text(text).replace(",", ".")
    out: Dict[int, float] = {}

    patterns = (
        r"(?P<sem>\d+)\s*(?:семестр|сем\.?|semester|term)\s*[-:–—]?\s*(?P<value>\d+(?:\.\d+)?)\s*(?:ч|час|hrs|h)?",
        r"(?P<sem>\d+)(?:st|nd|rd|th)\s*(?:term|semester)\s*[-:–—]?\s*(?P<value>\d+(?:\.\d+)?)\s*(?:hrs|h)?",
    )

    for pattern in patterns:
        for match in re.finditer(pattern, norm, flags=re.IGNORECASE):
            try:
                sem_num = int(match.group("sem"))
                amount = float(match.group("value"))
            except Exception:
                continue
            _add_amount(out, sem_num, amount)

    return out


def _find_total_row_index_by_text(table) -> Optional[int]:
    for row_index, row in enumerate(table.rows):
        if _is_total_text(_row_joined_text(row)):
            return row_index
    return None


def _activity_plan_from_table(
    table,
    semesters: List[int],
    *,
    table_title: str = "",
    features: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    value_col = _activity_value_column(table)
    if value_col is None:
        return {"annual": 0.0, "semesters": {}, "has_semester_hints": False}

    total_row_index = _find_total_row_index_by_text(table)
    annual_from_total = (
        _numeric_cell_value(_cell_text_at(table, total_row_index, value_col))
        if total_row_index is not None
        else 0.0
    )

    row_values_total = 0.0
    unassigned_total = 0.0
    semester_values: Dict[int, float] = {}
    has_semester_hints = False

    for row_index, row in enumerate(table.rows):
        if row_index == total_row_index:
            continue
        if row_index < 2 and _contains_any(_row_joined_text(row), ACTIVITY_TEXT_VARIANTS):
            continue

        row_value = _numeric_cell_value(_cell_text_at(table, row_index, value_col))
        if row_value <= 0:
            continue

        row_values_total += row_value
        row_text = " ".join(
            _cell_text_at(table, row_index, col_index)
            for col_index in range(_max_table_cols(table))
            if col_index != value_col
        )
        hinted_values = _semester_amounts_from_text(row_text)
        hinted_total = sum(hinted_values.values())

        if hinted_values and hinted_total <= row_value + 0.01:
            has_semester_hints = True
            for sem_num, amount in hinted_values.items():
                _add_amount(semester_values, sem_num, amount)
            unassigned_total += max(row_value - hinted_total, 0.0)
        else:
            semantic_values = _semantic_activity_distribution(
                row_text=row_text,
                table_title=table_title,
                total=row_value,
                features=features or {},
                semesters=semesters,
            )
            if semantic_values:
                has_semester_hints = True
                for sem_num, amount in semantic_values.items():
                    _add_amount(semester_values, sem_num, amount)
            else:
                unassigned_total += row_value

    annual = annual_from_total if annual_from_total > 0 else row_values_total
    if annual > row_values_total + 0.01:
        unassigned_total += annual - row_values_total

    if has_semester_hints:
        for sem_num, amount in _split_evenly(_round_hours(unassigned_total), semesters).items():
            _add_amount(semester_values, sem_num, amount)

    return {
        "annual": _round_hours(annual),
        "semesters": {sem_num: _round_hours(value) for sem_num, value in semester_values.items()},
        "has_semester_hints": has_semester_hints,
    }


def _normalize_match_text(value: Any) -> str:
    text = _normalize_text_lower(value)
    text = re.sub(r"[^\w\s]+", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def _meaningful_tokens(value: Any) -> set[str]:
    stopwords = {
        "work",
        "works",
        "activity",
        "activities",
        "жұмыс",
        "жұмысы",
        "работа",
        "работы",
        "жұмысын",
        "наименование",
        "виды",
    }
    return {
        token
        for token in _normalize_match_text(value).split()
        if len(token) > 3 and token not in stopwords
    }


def _text_match_score(left: Any, right: Any) -> float:
    left_norm = _normalize_match_text(left)
    right_norm = _normalize_match_text(right)
    if not left_norm or not right_norm:
        return 0.0

    ratio = SequenceMatcher(None, left_norm, right_norm).ratio()
    left_tokens = _meaningful_tokens(left_norm)
    right_tokens = _meaningful_tokens(right_norm)
    overlap = 0.0
    if left_tokens and right_tokens:
        overlap = len(left_tokens & right_tokens) / max(len(left_tokens), len(right_tokens))
    return ratio + overlap


def _build_activity_source_items(
    table_items: List[Dict[str, Any]],
    overview_index: int,
    semesters: List[int],
    context: Dict[str, Any],
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    features = _activity_distribution_features(context, semesters)

    for item in table_items:
        if int(item["table_index"]) >= overview_index:
            continue
        table = item["table"]
        if not _is_activity_plan_table(table):
            continue

        title = _normalize_text(item.get("title")) or _table_head_text(table, row_count=1)
        plan = _activity_plan_from_table(
            table,
            semesters,
            table_title=title,
            features=features,
        )
        out.append(
            {
                "table_index": int(item["table_index"]),
                "title": title,
                "section_number": _leading_section_number(title),
                "plan": plan,
            }
        )

    return out


def _overview_row_label(row) -> str:
    return " ".join(_normalize_text(cell.text) for cell in row.cells[:3] if _normalize_text(cell.text))


def _best_activity_source_for_row(
    row,
    source_items: List[Dict[str, Any]],
    used_table_indexes: set[int],
) -> Optional[Dict[str, Any]]:
    row_label = _overview_row_label(row)
    row_number = _leading_section_number(row_label)
    best_item = None
    best_score = 0.0

    for item in source_items:
        if int(item["table_index"]) in used_table_indexes:
            continue

        score = _text_match_score(row_label, item.get("title"))
        if row_number and item.get("section_number") and int(row_number) == int(item["section_number"]):
            score += 1.25

        if score > best_score:
            best_score = score
            best_item = item

    if best_item is None or best_score < 0.45:
        return None
    return best_item


def _is_teaching_summary_table(table) -> bool:
    head_text = _table_head_text(table, row_count=2)
    return (
        "teaching workload" in head_text
        and ("class hours" in head_text or "аудитор" in head_text)
        and ("office" in head_text or "внеаудитор" in head_text)
    )


def _detect_teaching_summary_columns(table) -> Dict[str, Optional[int]]:
    out = {"class": None, "office": None}
    max_cols = _max_table_cols(table)

    for col_index in range(max_cols):
        header_text = _normalize_text_lower(
            " ".join(_cell_text_at(table, row_index, col_index) for row_index in range(min(2, len(table.rows))))
        )
        if out["class"] is None and _contains_any(header_text, CLASS_TOTAL_TEXT_VARIANTS):
            out["class"] = col_index
        if out["office"] is None and _contains_any(header_text, OFFICE_TOTAL_TEXT_VARIANTS):
            out["office"] = col_index

    return out


def _summary_row_scope(row) -> Optional[Any]:
    row_text = _row_joined_text(row)
    if _contains_any(row_text, ANNUAL_TEXT_VARIANTS):
        return "annual"
    match = re.search(r"(\d+)\s*(?:семестр|сем\.?|semester|term)", row_text, flags=re.IGNORECASE)
    if match:
        try:
            return int(match.group(1))
        except Exception:
            return None
    parsed_scope = _parse_scope_from_text(row_text)
    return parsed_scope[0] if parsed_scope else None


def _empty_plan() -> Dict[str, Any]:
    return {"annual": 0.0, "semesters": {}, "has_semester_hints": True}


def _teaching_plans_from_context(context: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    summary = build_teaching_load_summary((context.get("teaching_load") or {}), load_kind="staff")
    by_semester = summary.get("by_semester") or {}
    annual = summary.get("annual") or {}

    out = {"class": _empty_plan(), "office": _empty_plan()}
    for sem_key, payload in by_semester.items():
        try:
            sem_num = int(sem_key)
        except Exception:
            continue
        out["class"]["semesters"][sem_num] = _round_hours((payload or {}).get("class_hours"))
        out["office"]["semesters"][sem_num] = _round_hours((payload or {}).get("office_hours"))

    out["class"]["annual"] = _round_hours(annual.get("class_hours"))
    out["office"]["annual"] = _round_hours(annual.get("office_hours"))
    return out


def _teaching_plans_from_doc(
    table_items: List[Dict[str, Any]],
    overview_index: int,
    context: Dict[str, Any],
) -> Dict[str, Dict[str, Any]]:
    fallback = _teaching_plans_from_context(context)

    for item in table_items:
        if int(item["table_index"]) >= overview_index:
            continue
        table = item["table"]
        if not _is_teaching_summary_table(table):
            continue

        columns = _detect_teaching_summary_columns(table)
        if columns.get("class") is None or columns.get("office") is None:
            continue

        out = {"class": _empty_plan(), "office": _empty_plan()}
        for row_index, row in enumerate(table.rows):
            scope = _summary_row_scope(row)
            if scope is None:
                continue

            class_value = _numeric_cell_value(_cell_text_at(table, row_index, int(columns["class"])))
            office_value = _numeric_cell_value(_cell_text_at(table, row_index, int(columns["office"])))

            if scope == "annual":
                out["class"]["annual"] = _round_hours(class_value)
                out["office"]["annual"] = _round_hours(office_value)
            elif isinstance(scope, int):
                out["class"]["semesters"][scope] = _round_hours(class_value)
                out["office"]["semesters"][scope] = _round_hours(office_value)

        if out["class"]["annual"] or out["office"]["annual"]:
            return out

    return fallback


def _is_overview_header_row(row) -> bool:
    row_text = _row_joined_text(row)
    has_timeline_header = (
        "семестр" in row_text
        or "semester" in row_text
        or "term" in row_text
        or _contains_any(row_text, ANNUAL_TEXT_VARIANTS)
    )
    return _contains_any(row_text, ACTIVITY_TEXT_VARIANTS) and (
        has_timeline_header or _contains_any(row_text, PLAN_TEXT_VARIANTS)
    )


def _is_overview_class_row(row) -> bool:
    row_text = _row_joined_text(row)
    if "teaching workload" not in row_text and "учебная работа" not in row_text and "оқу жұмысы" not in row_text:
        return False
    return ("аудитор" in row_text or "class" in row_text) and "внеаудитор" not in row_text and "office" not in row_text


def _is_overview_office_row(row) -> bool:
    row_text = _row_joined_text(row)
    if "teaching workload" not in row_text and "учебная работа" not in row_text and "оқу жұмысы" not in row_text:
        return False
    return "внеаудитор" in row_text or "office" in row_text


def _existing_semester_values(table, row_index: int, plan_columns: Dict[str, Any]) -> Dict[int, float]:
    out: Dict[int, float] = {}
    for sem_num, col_index in (plan_columns.get("semesters") or {}).items():
        value = _strict_numeric_cell_value(_cell_text_at(table, row_index, int(col_index)))
        if value > 0:
            out[int(sem_num)] = value
    return out


def _scale_semester_values(values: Dict[int, float], annual: float, semesters: List[int]) -> Dict[int, float]:
    current_total = sum(values.values())
    if current_total <= 0 or annual <= 0:
        return _split_evenly(annual, semesters)

    out: Dict[int, float] = {}
    assigned = 0.0
    ordered_semesters = [sem_num for sem_num in semesters if sem_num in values] or sorted(values.keys())

    for sem_num in ordered_semesters[:-1]:
        scaled = round(annual * values.get(sem_num, 0.0) / current_total, 2)
        out[sem_num] = scaled
        assigned += scaled

    out[ordered_semesters[-1]] = _round_hours(annual - assigned)
    return out


def _resolve_plan_semesters(
    *,
    table,
    row_index: int,
    plan: Dict[str, Any],
    plan_columns: Dict[str, Any],
    semesters: List[int],
) -> Dict[int, float]:
    annual = _round_hours(plan.get("annual"))
    existing_values = _existing_semester_values(table, row_index, plan_columns)
    existing_total = _round_hours(sum(existing_values.values()))

    if existing_total > 0 and annual > 0:
        if abs(existing_total - annual) <= 0.01:
            return {sem_num: _round_hours(value) for sem_num, value in existing_values.items()}
        if not plan.get("has_semester_hints"):
            return _scale_semester_values(existing_values, annual, semesters)

    sem_values = {
        int(sem_num): _round_hours(value)
        for sem_num, value in (plan.get("semesters") or {}).items()
        if _to_num(value) > 0
    }
    assigned = _round_hours(sum(sem_values.values()))
    remainder = _round_hours(annual - assigned)

    if remainder > 0:
        for sem_num, value in _split_evenly(remainder, semesters).items():
            _add_amount(sem_values, sem_num, value)

    if not sem_values and annual > 0:
        sem_values = _split_evenly(annual, semesters)

    return {sem_num: _round_hours(value) for sem_num, value in sem_values.items()}


def _clear_overview_plan_cells(table, row_index: int, plan_columns: Dict[str, Any]) -> None:
    for col_index in (plan_columns.get("semesters") or {}).values():
        _set_cell_text(_safe_get_cell(table, row_index, int(col_index)), "")
    if plan_columns.get("annual") is not None:
        _set_cell_text(_safe_get_cell(table, row_index, int(plan_columns["annual"])), "")


def _fill_overview_plan_row(
    table,
    row_index: int,
    plan: Dict[str, Any],
    plan_columns: Dict[str, Any],
    semesters: List[int],
) -> None:
    annual = _round_hours(plan.get("annual"))
    sem_values = _resolve_plan_semesters(
        table=table,
        row_index=row_index,
        plan=plan,
        plan_columns=plan_columns,
        semesters=semesters,
    )

    for sem_num, col_index in (plan_columns.get("semesters") or {}).items():
        value = sem_values.get(int(sem_num), 0.0)
        _set_cell_text(_safe_get_cell(table, row_index, int(col_index)), _display_value(_round_hours(value)))

    if plan_columns.get("annual") is not None:
        if annual <= 0 and sem_values:
            annual = _round_hours(sum(sem_values.values()))
        _set_cell_text(_safe_get_cell(table, row_index, int(plan_columns["annual"])), _display_value(annual))


def _find_overview_total_row_index(table) -> Optional[int]:
    for row_index in range(len(table.rows) - 1, -1, -1):
        if _is_total_text(_row_joined_text(table.rows[row_index])):
            return row_index
    return None


def _recalculate_overview_total_row(table, total_row_index: int, plan_columns: Dict[str, Any]) -> None:
    target_cols = list((plan_columns.get("semesters") or {}).values())
    if plan_columns.get("annual") is not None:
        target_cols.append(int(plan_columns["annual"]))

    for col_index in target_cols:
        total = 0.0
        for row_index, row in enumerate(table.rows):
            if row_index == total_row_index or _is_overview_header_row(row):
                continue
            total += _strict_numeric_cell_value(_cell_text_at(table, row_index, int(col_index)))
        _set_cell_text(_safe_get_cell(table, total_row_index, int(col_index)), _display_value(_round_hours(total)))


def _render_final_performance_summary(doc: Document, context: Dict[str, Any]) -> None:
    table_items = _iter_doc_tables_with_context(doc)
    overview_item = _find_performance_overview_item(table_items)
    if not overview_item:
        return

    overview_table = overview_item["table"]
    plan_columns = _detect_overview_plan_columns(overview_table)
    if not plan_columns.get("semesters") and plan_columns.get("annual") is None:
        return

    overview_index = int(overview_item["table_index"])
    semesters = _semester_numbers(plan_columns, context)
    teaching_plans = _teaching_plans_from_doc(table_items, overview_index, context)
    activity_sources = _build_activity_source_items(table_items, overview_index, semesters, context)
    used_source_table_indexes: set[int] = set()
    total_row_index = _find_overview_total_row_index(overview_table)

    for row_index, row in enumerate(overview_table.rows):
        if row_index == total_row_index or _is_overview_header_row(row):
            continue

        row_text = _row_joined_text(row)
        if not row_text:
            continue

        if _is_overview_class_row(row):
            _fill_overview_plan_row(overview_table, row_index, teaching_plans["class"], plan_columns, semesters)
            continue

        if _is_overview_office_row(row):
            _fill_overview_plan_row(overview_table, row_index, teaching_plans["office"], plan_columns, semesters)
            continue

        source_item = _best_activity_source_for_row(row, activity_sources, used_source_table_indexes)
        if source_item:
            used_source_table_indexes.add(int(source_item["table_index"]))
            _fill_overview_plan_row(overview_table, row_index, source_item["plan"], plan_columns, semesters)
        else:
            _clear_overview_plan_cells(overview_table, row_index, plan_columns)

    if total_row_index is not None:
        _recalculate_overview_total_row(overview_table, total_row_index, plan_columns)


def _find_overall_total_hours(doc: Document) -> Optional[str]:
    for table in doc.tables:
        has_annual_header = any(
            "за учеб. год" in _normalize_text_lower(cell.text)
            for row in table.rows[:2]
            for cell in row.cells
        )
        if not has_annual_header:
            continue

        for row in table.rows:
            first_cell_text = _normalize_text_lower(row.cells[0].text if row.cells else "")
            if not first_cell_text:
                continue
            if "барлығы" not in first_cell_text and "всего" not in first_cell_text and "total" not in first_cell_text:
                continue

            numeric_values: List[str] = []
            for cell in row.cells:
                text = _normalize_text(cell.text).replace(",", ".")
                if text and re.fullmatch(r"\d+(?:\.\d+)?", text):
                    numeric_values.append(text)

            if numeric_values:
                return numeric_values[-1].replace(".", ",")

    return None


def _render_overall_total_hours_paragraph(doc: Document) -> None:
    total_hours = _find_overall_total_hours(doc)
    if not total_hours:
        return

    for paragraph in doc.paragraphs:
        if "общее количество часов за учебный год" not in _normalize_text_lower(paragraph.text):
            continue
        paragraph.text = f"Общее количество часов за учебный год ____________{total_hours}__________________"
        return


def _build_output_path(teacher: Dict[str, Any], academic_year: str) -> str:
    safe_teacher_name = _safe_name(teacher["full_name"]) or f"teacher_{teacher['id']}"
    return str((Path(GENERATED_DIR) / f"IPP_{safe_teacher_name}_{academic_year}.docx").resolve())


def _load_generation_dependencies(cur, teacher_id: int, department_id: int, academic_year: str):
    teacher = _extract_teacher(cur, teacher_id)
    excel = _get_excel_by_year(cur, department_id, academic_year)
    raw_template = _get_raw_template_by_year(cur, department_id, academic_year)
    settings_cfg = _get_settings_for_excel(cur, excel["id"])
    excel_columns = _get_excel_columns(cur, excel["id"])
    excel_rows = _get_excel_rows(cur, excel["id"])
    raw_tables = _get_raw_tables(cur, raw_template["id"])
    effective_settings_cfg = build_effective_generation_settings(settings_cfg, raw_tables)

    return {
        "teacher": teacher,
        "excel": excel,
        "raw_template": raw_template,
        "settings_cfg": effective_settings_cfg,
        "excel_columns": excel_columns,
        "excel_rows": excel_rows,
        "raw_tables": raw_tables,
        "academic_year": academic_year,
    }


def _build_generation_context(deps: Dict[str, Any]) -> Dict[str, Any]:
    return _build_excel_context(
        teacher=deps["teacher"],
        excel_columns=deps["excel_columns"],
        excel_rows=deps["excel_rows"],
        settings_cfg=deps["settings_cfg"],
        academic_year=deps["academic_year"],
    )


def _render_generated_doc(
    raw_template_path: str,
    raw_tables: Dict[int, Dict[str, Any]],
    settings_cfg: Dict[str, Any],
    context: Dict[str, Any],
    teacher: Dict[str, Any],
    academic_year: str,
) -> Document:
    doc = Document(raw_template_path)
    _render_teacher_profile(doc, teacher, academic_year)
    _render_all_teaching_loads(
        doc=doc,
        raw_tables=raw_tables,
        settings_cfg=settings_cfg,
        context=context,
    )
    return doc


def generate_docx_for_teacher(
    teacher_id: int,
    department_id: int,
    academic_year: str,
) -> str:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            deps = _load_generation_dependencies(
                cur=cur,
                teacher_id=teacher_id,
                department_id=department_id,
                academic_year=academic_year,
            )

        context = _build_generation_context(deps)

        doc = _render_generated_doc(
            raw_template_path=deps["raw_template"]["file_path"],
            raw_tables=deps["raw_tables"],
            settings_cfg=deps["settings_cfg"],
            context=context,
            teacher=deps["teacher"],
            academic_year=academic_year,
        )

        output_path = _build_output_path(deps["teacher"], academic_year)
        doc.save(output_path)

        apply_manual_fill_to_generated_docx(
            teacher_id=teacher_id,
            department_id=department_id,
            academic_year=academic_year,
            output_path=output_path,
        )

        final_doc = Document(output_path)
        _render_final_performance_summary(final_doc, context)
        _render_overall_total_hours_paragraph(final_doc)
        final_doc.save(output_path)

        return output_path
    finally:
        conn.close()
