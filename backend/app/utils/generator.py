import re
from copy import deepcopy
from typing import Dict, Any, List, Optional

from docx import Document

from backend.app.database import get_connection
from backend.app.config import GENERATED_DIR
from backend.app.utils.blocks import detect_semester_columns, build_block_rows, to_num
from backend.app.utils.manual_docx_filler import apply_manual_fill_to_generated_docx


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def _lower_text(value: Any) -> str:
    return _normalize_text(value).lower()


def _fmt_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(round(value, 2)).rstrip("0").rstrip(".")
    if isinstance(value, int):
        return str(value)
    s = str(value).strip()
    if s.endswith(".0"):
        return s[:-2]
    return s


def _set_cell_text(cell, value: Any):
    cell.text = "" if value is None else str(value)


def _clear_row(row):
    for cell in row.cells:
        cell.text = ""


def _insert_row_before(table, row_index: int):
    tr = table.rows[row_index]._tr
    new_tr = deepcopy(tr)
    tr.addprevious(new_tr)
    return row_index


def _safe_get_table(doc: Document, table_index: int):
    if table_index < 0 or table_index >= len(doc.tables):
        return None
    return doc.tables[table_index]


def _row_text(row) -> str:
    return " | ".join(_normalize_text(c.text) for c in row.cells if _normalize_text(c.text))


def _table_text(table, max_rows: int = 16) -> str:
    chunks = []
    for row in table.rows[:max_rows]:
        txt = _row_text(row)
        if txt:
            chunks.append(txt)
    return " ".join(chunks).lower()


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


def _get_excel_by_year(cur, department_id: int, academic_year: str) -> dict:
    cur.execute("""
        SELECT id
        FROM excel_templates
        WHERE department_id=%s AND academic_year=%s;
    """, (department_id, academic_year))
    r = cur.fetchone()
    if not r:
        raise Exception("Для этого года Excel не загружен")
    return {"id": r[0]}


def _get_raw_template_by_year(cur, department_id: int, academic_year: str) -> dict:
    cur.execute("""
        SELECT id, file_path
        FROM raw_docx_templates
        WHERE department_id=%s AND academic_year=%s;
    """, (department_id, academic_year))
    r = cur.fetchone()
    if not r:
        raise Exception("Для этого года raw DOCX шаблон не загружен")
    return {"id": r[0], "tpl_path": r[1]}


def _get_settings_for_excel(cur, excel_template_id: int) -> dict:
    cur.execute("""
        SELECT config
        FROM generation_settings
        WHERE excel_template_id=%s
        LIMIT 1;
    """, (excel_template_id,))
    r = cur.fetchone()
    if not r:
        raise Exception("Нет настроек для этого Excel. Сначала сохрани Settings.")
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


def _replace_academic_year(doc: Document, academic_year: str):
    year_pattern = re.compile(r"\b20__\s*-\s*20__\b")
    for p in doc.paragraphs:
        text = p.text or ""
        if year_pattern.search(text):
            p.text = year_pattern.sub(academic_year, text)

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                text = cell.text or ""
                if year_pattern.search(text):
                    cell.text = year_pattern.sub(academic_year, text)


def _fill_near_label_in_tables(doc: Document, labels: List[str], value: str):
    labels_l = [x.lower() for x in labels if x]
    if not value:
        return

    for table in doc.tables:
        for r_idx, row in enumerate(table.rows):
            for c_idx, cell in enumerate(row.cells):
                txt = _lower_text(cell.text)
                if not txt:
                    continue
                if not any(label in txt for label in labels_l):
                    continue

                candidates = []

                for cc in range(c_idx + 1, len(row.cells)):
                    candidates.append(row.cells[cc])

                if r_idx + 1 < len(table.rows):
                    next_row = table.rows[r_idx + 1]
                    if c_idx < len(next_row.cells):
                        candidates.append(next_row.cells[c_idx])
                    if c_idx + 1 < len(next_row.cells):
                        candidates.append(next_row.cells[c_idx + 1])

                for target in candidates:
                    target_txt = _normalize_text(target.text)
                    if not target_txt or target_txt == "—" or target_txt == "_":
                        _set_cell_text(target, value)
                        break


def _fill_teacher_header(doc: Document, teacher: dict, academic_year: str):
    _replace_academic_year(doc, academic_year)

    _fill_near_label_in_tables(
        doc,
        ["должность", "position"],
        _fmt_value(teacher.get("position")),
    )
    _fill_near_label_in_tables(
        doc,
        ["уч.степень", "ученая степень", "academic degree", "ғылыми дәрежесі"],
        _fmt_value(teacher.get("academic_degree")),
    )
    _fill_near_label_in_tables(
        doc,
        ["фио преподавателя", "last name, name, patronymic of teacher", "оқытушының"],
        _fmt_value(teacher.get("full_name")),
    )
    _fill_near_label_in_tables(
        doc,
        ["кафедра", "department"],
        _fmt_value(teacher.get("department")),
    )
    _fill_near_label_in_tables(
        doc,
        ["факультет", "faculty"],
        _fmt_value(teacher.get("faculty")),
    )
    _fill_near_label_in_tables(
        doc,
        ["штаттағы", "штатный", "staff, part-time", "сағаттық", "почасовая", "hourly"],
        _fmt_value(teacher.get("staff_type")),
    )


def _find_workload_table(doc: Document, kind: str):
    for idx, table in enumerate(doc.tables):
        text = _table_text(table)
        if kind == "staff":
            if "учебная нагрузка" in text and ("штат" in text or "part-time" in text):
                return idx, table
        if kind == "hourly":
            if "учебная нагрузка" in text and ("почас" in text or "hourly" in text):
                return idx, table
    return None, None


def _detect_header_map(table) -> Dict[str, int]:
    patterns = {
        "subject": [r"наименование", r"subject"],
        "group": [r"\bгруппа\b", r"\bgroup\b"],
        "course": [r"\bкурс\b", r"\bcourse\b"],
        "credits": [r"кредит", r"credit"],
        "students": [r"обуч", r"student"],
        "lectures": [r"лекц", r"lecture"],
        "practice": [r"практ", r"practical"],
        "lab": [r"лабор", r"laboratory"],
        "srsp": [r"срсп", r"сроп", r"tsis"],
        "rk": [r"рубеж", r"контроль"],
        "exam": [r"экзам", r"exam"],
        "practice_all": [r"практика", r"все виды"],
        "diploma": [r"рук", r"\bдп\b", r"\bмд\b", r"\bдд\b"],
        "research": [r"нирм", r"нирд"],
        "other": [r"другой двр", r"дополнительн", r"\bдвр\b"],
        "total": [r"итого", r"total", r"hours", r"час"],
    }

    best_score = -1
    best_map = {}

    scan_rows = min(len(table.rows), 12)

    for r_idx in range(scan_rows):
        row = table.rows[r_idx]
        row_map = {}
        score = 0

        for c_idx, cell in enumerate(row.cells):
            txt = _lower_text(cell.text)
            if not txt:
                continue

            for key, regs in patterns.items():
                ok = False
                for rg in regs:
                    if re.search(rg, txt):
                        ok = True
                        break
                if ok and key not in row_map:
                    row_map[key] = c_idx
                    if key != "total":
                        score += 1

        if score > best_score:
            best_score = score
            best_map = row_map

    return best_map


def _find_semester_segments(table) -> Dict[str, Dict[str, int]]:
    rows_info = []
    for idx, row in enumerate(table.rows):
        rows_info.append((idx, _row_text(row).lower()))

    sem1_idx = None
    sem2_idx = None

    for idx, txt in rows_info:
        if sem1_idx is None and re.search(r"\b1\s*сем", txt):
            sem1_idx = idx
        elif sem2_idx is None and re.search(r"\b2\s*сем", txt):
            sem2_idx = idx

    def find_total_after(start_idx: int, stop_before: Optional[int]) -> Optional[int]:
        for idx, txt in rows_info:
            if idx <= start_idx:
                continue
            if stop_before is not None and idx >= stop_before:
                break
            if "итого" in txt or "итог" in txt:
                return idx
        return None

    out = {}

    if sem1_idx is not None:
        total1 = find_total_after(sem1_idx, sem2_idx)
        if total1 is not None:
            out["sem1"] = {
                "marker_row": sem1_idx,
                "body_start": sem1_idx + 1,
                "total_row": total1,
            }

    if sem2_idx is not None:
        total2 = find_total_after(sem2_idx, None)
        if total2 is not None:
            out["sem2"] = {
                "marker_row": sem2_idx,
                "body_start": sem2_idx + 1,
                "total_row": total2,
            }

    return out


def _first_match_key(keys: List[str], patterns: List[str]) -> Optional[str]:
    for key in keys:
        low = key.lower()
        for p in patterns:
            if re.search(p, low):
                return key
    return None


def _pick_row_value(row: dict, preferred_key: Optional[str], fallback_patterns: List[str]) -> Any:
    if preferred_key and preferred_key in row:
        return row.get(preferred_key)

    keys = list(row.keys())
    guessed = _first_match_key(keys, fallback_patterns)
    if guessed:
        return row.get(guessed)
    return None


def _build_render_row(row: dict, settings_cfg: dict, load_kind: str) -> dict:
    cols_cfg = settings_cfg.get("columns", {}) or {}
    discipline_col = cols_cfg.get("discipline_col")
    group_col = cols_cfg.get("group_col")
    staff_hours_col = cols_cfg.get("staff_hours_col")
    hourly_hours_col = cols_cfg.get("hourly_hours_col")

    total_hours = row.get(staff_hours_col) if load_kind == "staff" else row.get(hourly_hours_col)

    out = {
        "subject": _pick_row_value(row, discipline_col, [r"distsip", r"discip", r"predmet", r"atauy"]),
        "group": _pick_row_value(row, group_col, [r"\bgrupp", r"\btop\b", r"group"]),
        "course": _pick_row_value(row, None, [r"\bkurs\b", r"course"]),
        "credits": _pick_row_value(row, None, [r"kredit", r"credit"]),
        "students": _pick_row_value(row, None, [r"obuch", r"student", r"count"]),
        "lectures": _pick_row_value(row, None, [r"^l$", r"lek", r"lecture"]),
        "practice": _pick_row_value(row, None, [r"spz", r"prakt", r"semin"]),
        "lab": _pick_row_value(row, None, [r"^lz$", r"labor", r"\blab\b"]),
        "srsp": _pick_row_value(row, None, [r"srsp", r"srop", r"tsis"]),
        "rk": _pick_row_value(row, None, [r"\brk\b", r"rubezh", r"kontrol"]),
        "exam": _pick_row_value(row, None, [r"ekzam", r"exam"]),
        "practice_all": _pick_row_value(row, None, [r"praktika", r"practice"]),
        "diploma": _pick_row_value(row, None, [r"dp", r"md", r"dd", r"ruk"]),
        "research": _pick_row_value(row, None, [r"nirm", r"nird"]),
        "other": _pick_row_value(row, None, [r"drug", r"\bdvr\b", r"other"]),
        "total": total_hours,
    }

    total_num = to_num(out.get("total"))
    if total_num <= 0:
        calc = 0.0
        for k in ["lectures", "practice", "lab", "srsp", "rk", "exam", "practice_all", "diploma", "research", "other"]:
            calc += to_num(out.get(k))
        out["total"] = calc

    return out


def _fill_workload_segment(table, segment: dict, data_rows: List[dict], header_map: Dict[str, int], settings_cfg: dict, load_kind: str):
    body_start = segment["body_start"]
    total_row_idx = segment["total_row"]

    template_row_idx = body_start if body_start < total_row_idx else None

    write_row_idx = body_start
    total_sum = 0.0

    for row_data in data_rows:
        render_row = _build_render_row(row_data, settings_cfg, load_kind)

        if write_row_idx < total_row_idx:
            row = table.rows[write_row_idx]
            _clear_row(row)
        else:
            if template_row_idx is None:
                break
            new_index = _insert_row_before(table, total_row_idx)
            row = table.rows[new_index]
            _clear_row(row)
            total_row_idx += 1
            write_row_idx = new_index

        for field, col_idx in header_map.items():
            if field not in render_row:
                continue
            if col_idx >= len(row.cells):
                continue
            _set_cell_text(row.cells[col_idx], _fmt_value(render_row.get(field)))

        total_sum += to_num(render_row.get("total"))
        write_row_idx += 1

    for idx in range(write_row_idx, total_row_idx):
        row = table.rows[idx]
        if all(_normalize_text(c.text) == "" for c in row.cells):
            continue
        _clear_row(row)

    if "total" in header_map and total_row_idx < len(table.rows):
        total_row = table.rows[total_row_idx]
        col_idx = header_map["total"]
        if col_idx < len(total_row.cells):
            _set_cell_text(total_row.cells[col_idx], _fmt_value(total_sum))


def _fill_workload_tables(doc: Document, settings_cfg: dict, blocks: Dict[str, Any]):
    for kind in ("staff", "hourly"):
        _, table = _find_workload_table(doc, kind)
        if table is None:
            continue

        header_map = _detect_header_map(table)
        segments = _find_semester_segments(table)

        for sem in ("sem1", "sem2"):
            rows = (((blocks.get("teaching_load") or {}).get(kind) or {}).get(sem) or [])
            segment = segments.get(sem)
            if not segment:
                continue
            _fill_workload_segment(
                table=table,
                segment=segment,
                data_rows=rows,
                header_map=header_map,
                settings_cfg=settings_cfg,
                load_kind=kind,
            )


def generate_docx_for_teacher(
    teacher_id: int,
    department_id: int,
    academic_year: str,
) -> str:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            excel = _get_excel_by_year(cur, department_id, academic_year)
            raw_template = _get_raw_template_by_year(cur, department_id, academic_year)

            settings = _get_settings_for_excel(cur, excel["id"])
            cols_cfg = (settings or {}).get("columns") or {}

            teacher_col = cols_cfg.get("teacher_col")
            staff_hours_col = cols_cfg.get("staff_hours_col")
            hourly_hours_col = cols_cfg.get("hourly_hours_col")

            if not teacher_col or not staff_hours_col:
                raise Exception("Настройки неполные: columns.teacher_col и columns.staff_hours_col обязательны")

            teacher = _get_teacher(cur, teacher_id)

            mapping = _get_excel_mapping(cur, excel["id"])
            col_to_header = mapping["col_to_header"]
            excel_columns = mapping["columns"]

            semester_map = detect_semester_columns(excel_columns)
            if not semester_map:
                raise Exception("Не найдены колонки семестров в Excel")

            excel_rows = _get_excel_rows(cur, excel["id"])

            blocks: Dict[str, Any] = {"teaching_load": {"staff": {}, "hourly": {}}}

            for sem_key in semester_map.keys():
                staff_key = f"blocks.teaching_load.staff.{sem_key}"
                hourly_key = f"blocks.teaching_load.hourly.{sem_key}"

                staff_rows = build_block_rows(
                    loop_key=staff_key,
                    excel_rows=excel_rows,
                    col_to_header=col_to_header,
                    teacher_full_name=teacher["full_name"],
                    teacher_col=teacher_col,
                    semester_map=semester_map,
                    staff_hours_col=staff_hours_col,
                    hourly_hours_col=hourly_hours_col,
                    settings_cfg=settings,
                )
                blocks["teaching_load"]["staff"][sem_key] = staff_rows

                hourly_rows = build_block_rows(
                    loop_key=hourly_key,
                    excel_rows=excel_rows,
                    col_to_header=col_to_header,
                    teacher_full_name=teacher["full_name"],
                    teacher_col=teacher_col,
                    semester_map=semester_map,
                    staff_hours_col=staff_hours_col,
                    hourly_hours_col=hourly_hours_col,
                    settings_cfg=settings,
                )
                blocks["teaching_load"]["hourly"][sem_key] = hourly_rows

        doc = Document(raw_template["tpl_path"])
        _fill_teacher_header(doc, teacher, academic_year)
        _fill_workload_tables(doc, settings, blocks)

        safe_name = re.sub(r"[^0-9A-Za-zА-Яа-я_]+", "_", teacher["full_name"]).strip("_")
        output_path = str((GENERATED_DIR / f"IPP_{safe_name}_{academic_year}.docx").resolve())
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