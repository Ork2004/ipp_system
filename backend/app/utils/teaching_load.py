import re
from collections import defaultdict
from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional, Tuple


SEM_RE = re.compile(r"(?:(\d+)\s*(?:сем|semestr|semester))", re.IGNORECASE)
SCOPE_RE = re.compile(r"(\d+(?:\s*,\s*\d+)*)")
COURSE_IN_OP_RE = re.compile(r"(\d+)\s*курс", re.IGNORECASE)
WORKLOAD_VALUE_FIELDS = (
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
SUMMARY_CLASS_FIELDS = (
    "l",
    "spz",
    "lz",
    "srsp",
    "rk_1_2",
    "ekzameny",
)
SUMMARY_OFFICE_FIELDS = (
    "practika",
    "research_work",
    "diploma_supervision",
    "other_work",
)
ROW_VALUE_FIELDS = (
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
DEFAULT_COLUMN_ALIASES = {
    "teacher_col": ("fio_pps", "teacher", "prepodavatel", "pps"),
    "discipline_col": ("distsiplina", "discipline", "subject"),
    "group_col": ("gruppa", "group"),
    "op_col": ("op", "obrazovatelnaya_programma", "educational_program"),
    "course_col": ("kurs", "course"),
    "academic_period_col": ("akadem_period", "academic_period", "period"),
    "credits_col": ("kredity", "credits"),
    "student_count_col": (
        "kontingent_po_zapisi",
        "kontingent",
        "student_count",
        "students_count",
    ),
    "activity_type_col": ("vid_zanyatii", "activity_type", "work_type"),
    "payment_form_col": ("forma_oplaty", "payment_form"),
    "normative_col": ("normativ", "normative"),
    "staff_hours_col": ("shtatnaya_nagruzka", "staff_hours"),
    "hourly_hours_col": ("pochasovaya_nagruzka", "hourly_hours"),
    "lecture_hours_col": ("l", "lectures"),
    "practice_hours_col": ("spz", "practice"),
    "lab_hours_col": ("lz", "lab"),
    "srsp_hours_col": ("srsp",),
    "rk_hours_col": ("rk_1_2", "rk"),
    "exam_hours_col": ("ekzameny", "exam"),
    "practice_load_col": ("practika", "practice_load"),
    "diploma_load_col": ("diploma_supervision", "rukovodstvo_dp"),
    "research_load_col": ("research_work", "nirm"),
    "other_load_col": ("other_work", "dvr"),
    "total_col": ("itogo", "total"),
}
DEFAULT_ACTIVITY_TYPES = {
    "lecture": ["лек", "лк", "lecture"],
    "lab_practice": ["лаб", "пра", "lab", "pract"],
}
DEFAULT_SUM_COLS_BY_TYPE = {
    "lecture": ("l", "srsp", "ekzameny"),
    "lab_practice": ("spz", "lz", "rk_1_2"),
}
DEFAULT_SPECIAL_BUCKET_PATTERNS = {
    "practika": ["практик", "practice", "стажировк"],
    "diploma_supervision": [
        "диплом",
        "диссертац",
        "дп",
        "мд",
        "dd",
        "руководство диплом",
        "руководство магистер",
    ],
    "research_work": [
        "нирм",
        "нирд",
        "научно-исследователь",
        "research",
        "магистрант",
    ],
    "other_work": [
        "двр",
        "эдвайзер",
        "ментор",
        "координатор",
        "завед",
        "секретарь",
        "кафедр",
        "advisor",
        "mentor",
    ],
}


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def _normalize_text_lower(value: Any) -> str:
    return _normalize_text(value).lower()


def _to_num(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", ".").strip())
    except Exception:
        return 0.0


def _not_empty(value: Any) -> bool:
    return _normalize_text(value) != ""


def _dedupe_preserve(items: Iterable[Any]) -> List[Any]:
    out: List[Any] = []
    seen = set()
    for item in items:
        key = str(item)
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _scope_key(scope: Tuple[int, ...]) -> str:
    return ",".join(str(x) for x in scope)


def _scope_sort_key(scope_key: str) -> Tuple[int, List[int]]:
    numbers = [int(x) for x in scope_key.split(",") if str(x).strip().isdigit()]
    return (len(numbers), numbers)


def detect_semester_columns(columns: List[Tuple[str, str]]) -> Dict[str, str]:
    found: Dict[int, str] = {}

    for col_name, header_text in columns:
        if not header_text:
            continue
        match = SEM_RE.search(str(header_text))
        if not match:
            continue
        try:
            sem_num = int(match.group(1))
        except Exception:
            continue
        if sem_num <= 0 or sem_num in found:
            continue
        found[sem_num] = col_name

    out: Dict[str, str] = {}
    for sem_num in sorted(found.keys()):
        out[f"sem{sem_num}"] = found[sem_num]
    return out


def _binding_payload(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _binding_source(binding: Dict[str, Any]) -> str:
    source = _normalize_text_lower((binding or {}).get("source"))
    if source in ("manual", "excel"):
        return source
    return "excel"


def is_manual_source_binding(binding: Dict[str, Any]) -> bool:
    return _binding_source(binding) == "manual"


def is_excel_source_binding(binding: Dict[str, Any]) -> bool:
    return _binding_source(binding) == "excel"


def get_teaching_load_binding(settings_cfg: Dict[str, Any], load_kind: str) -> Dict[str, Any]:
    template_bindings = (settings_cfg or {}).get("template_bindings") or {}
    teaching_load_cfg = template_bindings.get("teaching_load") or {}
    return _binding_payload(teaching_load_cfg.get(load_kind))


def get_teaching_load_summary_binding(settings_cfg: Dict[str, Any]) -> Dict[str, Any]:
    template_bindings = (settings_cfg or {}).get("template_bindings") or {}
    teaching_load_cfg = template_bindings.get("teaching_load") or {}

    nested_binding = _binding_payload(teaching_load_cfg.get("summary"))
    if nested_binding:
        return nested_binding

    return _binding_payload(template_bindings.get("teaching_load_summary"))


def extract_excel_bound_raw_table_ids(settings_cfg: Dict[str, Any]) -> set[int]:
    return extract_excel_bound_raw_table_ids_with_raw_tables(settings_cfg, raw_tables=None)


def _raw_tables_iterable(raw_tables: Any) -> List[Dict[str, Any]]:
    if isinstance(raw_tables, dict):
        return list(raw_tables.values())
    if isinstance(raw_tables, list):
        return list(raw_tables)
    if isinstance(raw_tables, tuple):
        return list(raw_tables)
    return []


def is_teaching_load_detail_raw_table(raw_table: Dict[str, Any]) -> bool:
    hints = [_normalize_text_lower(value) for value in (raw_table.get("column_hints") or [])]
    if len(hints) < 10:
        return False

    has_semester = any("семестр" in hint or "semester" in hint for hint in hints[:2])
    has_subject = any(
        any(token in hint for token in ("наименование", "subject", "пән", "discipline"))
        for hint in hints
    )
    has_group = any("груп" in hint or "group" in hint for hint in hints)
    load_markers = (
        "лек",
        "практ",
        "лаб",
        "срсп",
        "сроп",
        "рубеж",
        "экзам",
        "практика",
        "нир",
        "дп",
        "ддр",
        "друг",
        "итого",
        "hours",
    )
    load_hint_matches = sum(
        1
        for hint in hints
        if any(marker in hint for marker in load_markers)
    )

    return has_semester and has_subject and has_group and load_hint_matches >= 5


def infer_teaching_load_bindings(raw_tables: Any) -> Dict[str, Dict[str, Any]]:
    table_items = sorted(
        _raw_tables_iterable(raw_tables),
        key=lambda item: int(item.get("table_index") or 0),
    )
    detail_tables = [item for item in table_items if is_teaching_load_detail_raw_table(item)]
    summary_tables = [item for item in table_items if is_teaching_load_summary_raw_table(item)]

    out: Dict[str, Dict[str, Any]] = {}
    if detail_tables:
        out["staff"] = {"source": "excel", "raw_table_id": int(detail_tables[0]["id"])}
    if len(detail_tables) > 1:
        out["hourly"] = {"source": "excel", "raw_table_id": int(detail_tables[1]["id"])}
    if summary_tables:
        out["summary"] = {"source": "excel", "raw_table_id": int(summary_tables[0]["id"])}
    return out


def build_effective_generation_settings(
    settings_cfg: Dict[str, Any],
    raw_tables: Any,
) -> Dict[str, Any]:
    effective = deepcopy(settings_cfg or {})
    inferred = infer_teaching_load_bindings(raw_tables)
    template_bindings = deepcopy((effective.get("template_bindings") or {}))
    teaching_load_cfg = deepcopy((template_bindings.get("teaching_load") or {}))

    for load_kind in ("staff", "hourly"):
        existing_binding = _binding_payload(teaching_load_cfg.get(load_kind))
        if not existing_binding and inferred.get(load_kind):
            teaching_load_cfg[load_kind] = inferred[load_kind]

    existing_summary_binding = _binding_payload(teaching_load_cfg.get("summary"))
    legacy_summary_binding = _binding_payload(template_bindings.get("teaching_load_summary"))
    if not existing_summary_binding and not legacy_summary_binding and inferred.get("summary"):
        teaching_load_cfg["summary"] = inferred["summary"]

    if teaching_load_cfg:
        template_bindings["teaching_load"] = teaching_load_cfg
    if template_bindings:
        effective["template_bindings"] = template_bindings

    return effective


def extract_excel_bound_raw_table_ids_with_raw_tables(
    settings_cfg: Dict[str, Any],
    raw_tables: Any,
) -> set[int]:
    effective_settings = build_effective_generation_settings(settings_cfg, raw_tables)
    out: set[int] = set()
    for load_kind in ("staff", "hourly"):
        binding = get_teaching_load_binding(effective_settings, load_kind)
        raw_table_id = binding.get("raw_table_id")
        if not is_excel_source_binding(binding):
            continue
        if raw_table_id:
            try:
                out.add(int(raw_table_id))
            except Exception:
                continue

    summary_binding = get_teaching_load_summary_binding(effective_settings)
    raw_table_id = summary_binding.get("raw_table_id")
    if not is_excel_source_binding(summary_binding):
        raw_table_id = None
    if raw_table_id:
        try:
            out.add(int(raw_table_id))
        except Exception:
            pass

    return out


def is_teaching_load_summary_raw_table(raw_table: Dict[str, Any]) -> bool:
    hints = [_normalize_text_lower(value) for value in (raw_table.get("column_hints") or [])]
    if len(hints) < 14:
        return False

    first_hint = hints[0]
    last_hint = hints[-1]

    if "teaching workload" not in first_hint:
        return False

    return any(token in last_hint for token in ("total", "всего", "барлығы"))


def _empty_workload_totals() -> Dict[str, float]:
    return {field_key: 0.0 for field_key in WORKLOAD_VALUE_FIELDS}


def _scope_numbers_from_key(scope_key: Any) -> Tuple[int, ...]:
    numbers: List[int] = []
    for part in str(scope_key or "").split(","):
        try:
            number = int(str(part).strip())
        except Exception:
            continue
        if number not in numbers:
            numbers.append(number)
    return tuple(numbers)


def _round_num(value: Any) -> float:
    return round(_to_num(value), 2)


def _build_summary_payload(totals: Dict[str, Any]) -> Dict[str, float]:
    payload = {
        field_key: _round_num((totals or {}).get(field_key))
        for field_key in WORKLOAD_VALUE_FIELDS
    }
    payload["class_hours"] = round(sum(payload[field_key] for field_key in SUMMARY_CLASS_FIELDS), 2)
    payload["office_hours"] = round(sum(payload[field_key] for field_key in SUMMARY_OFFICE_FIELDS), 2)
    payload["itogo"] = round(sum(payload[field_key] for field_key in WORKLOAD_VALUE_FIELDS if field_key != "itogo"), 2)
    return payload


def build_teaching_load_summary(
    teaching_load: Dict[str, Any],
    *,
    load_kind: str = "staff",
) -> Dict[str, Any]:
    semesters = [
        int(sem_num)
        for sem_num in (teaching_load or {}).get("semesters") or []
        if str(sem_num).strip().isdigit()
    ]
    load_context = ((teaching_load or {}).get(load_kind) or {})
    distributed_totals = {
        sem_num: _empty_workload_totals()
        for sem_num in semesters
    }

    for scope_key, scope_totals in (load_context.get("totals_by_scope") or {}).items():
        scope = _scope_numbers_from_key(scope_key)
        if not scope:
            continue

        share = 1.0 / len(scope)
        for sem_num in scope:
            distributed_totals.setdefault(sem_num, _empty_workload_totals())
            for field_key in WORKLOAD_VALUE_FIELDS:
                distributed_totals[sem_num][field_key] += _to_num((scope_totals or {}).get(field_key)) * share

    return {
        "by_semester": {
            str(sem_num): _build_summary_payload(distributed_totals.get(sem_num) or {})
            for sem_num in semesters
        },
        "annual": _build_summary_payload(load_context.get("annual_totals") or {}),
    }


def _resolve_column_name(
    columns_cfg: Dict[str, Any],
    available_columns: set[str],
    field_key: str,
) -> Optional[str]:
    explicit_value = _normalize_text(columns_cfg.get(field_key))
    if explicit_value and explicit_value in available_columns:
        return explicit_value

    for candidate in DEFAULT_COLUMN_ALIASES.get(field_key, ()):
        if candidate in available_columns:
            return candidate

    return None


def _resolve_columns(
    excel_columns: List[Tuple[str, str]],
    settings_cfg: Dict[str, Any],
) -> Dict[str, Optional[str]]:
    columns_cfg = (settings_cfg or {}).get("columns") or {}
    available_columns = {col_name for col_name, _ in excel_columns}

    resolved: Dict[str, Optional[str]] = {}
    for field_key in DEFAULT_COLUMN_ALIASES.keys():
        resolved[field_key] = _resolve_column_name(columns_cfg, available_columns, field_key)

    return resolved


def _build_raw_row(row_data: Dict[str, Any], col_to_header: Dict[str, str]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for col_name, header_text in col_to_header.items():
        out[col_name] = row_data.get(header_text)
    return out


def _lookup_value(raw_row: Dict[str, Any], resolved_columns: Dict[str, Optional[str]], field_key: str) -> Any:
    col_name = resolved_columns.get(field_key)
    if not col_name:
        return None
    return raw_row.get(col_name)


def _match_teacher(value: Any, teacher_full_name: str) -> bool:
    teacher_norm = _normalize_text_lower(teacher_full_name)
    value_norm = _normalize_text_lower(value)
    return bool(teacher_norm and value_norm and teacher_norm in value_norm)


def _scope_from_row(
    *,
    semester_map: Dict[str, str],
    raw_row: Dict[str, Any],
) -> Tuple[Tuple[int, ...], Dict[int, Any]]:
    active_semesters: List[int] = []
    semester_values: Dict[int, Any] = {}

    for sem_key, col_name in (semester_map or {}).items():
        try:
            sem_num = int(str(sem_key).replace("sem", ""))
        except Exception:
            continue
        value = raw_row.get(col_name)
        if not _not_empty(value):
            continue
        active_semesters.append(sem_num)
        semester_values[sem_num] = value

    all_semesters = sorted(
        int(str(key).replace("sem", ""))
        for key in semester_map.keys()
        if str(key).startswith("sem")
    )

    if len(active_semesters) == 1:
        return (tuple(active_semesters), semester_values)

    if len(active_semesters) > 1:
        return (tuple(sorted(active_semesters)), semester_values)

    return (tuple(all_semesters), semester_values)


def _split_tokens(value: Any) -> List[str]:
    text = _normalize_text(value)
    if not text:
        return []

    parts = re.split(r"[\n,;/]+", text)
    out = []
    for part in parts:
        cleaned = _normalize_text(part)
        if cleaned:
            out.append(cleaned)
    return out


def _join_unique_texts(values: Iterable[Any], separator: str = ", ") -> str:
    texts: List[str] = []
    for value in values:
        for token in _split_tokens(value):
            texts.append(token)
    return separator.join(_dedupe_preserve(texts))


def _parse_academic_year_start(academic_year: str) -> Optional[int]:
    match = re.match(r"^\s*(\d{4})\s*[-/]\s*(\d{4})\s*$", str(academic_year or "").strip())
    if not match:
        return None
    try:
        return int(match.group(1))
    except Exception:
        return None


def _derive_course_from_op(value: Any) -> str:
    text = _normalize_text(value)
    if not text:
        return ""
    matches = [int(x) for x in COURSE_IN_OP_RE.findall(text)]
    if not matches:
        return ""
    return str(max(matches))


def _derive_course_from_group(value: Any, academic_year: str) -> str:
    tokens = _split_tokens(value)
    if not tokens:
        return ""

    direct_courses: List[int] = []
    current_year = _parse_academic_year_start(academic_year)

    for token in tokens:
        direct_match = re.search(r"[A-Za-zА-Яа-я]+(\d)(?:[-_]|$)", token)
        if direct_match:
            try:
                direct_courses.append(int(direct_match.group(1)))
                continue
            except Exception:
                pass

        year_match = re.search(r"(\d{2})(?:[-_]|$)", token)
        if year_match and current_year is not None:
            try:
                admission_year = 2000 + int(year_match.group(1))
                course = current_year - admission_year + 1
                if course > 0:
                    direct_courses.append(course)
            except Exception:
                continue

    if not direct_courses:
        return ""

    return str(max(direct_courses))


def _derive_course(group_value: Any, op_value: Any, academic_year: str) -> str:
    from_group = _derive_course_from_group(group_value, academic_year)
    if from_group:
        return from_group
    return _derive_course_from_op(op_value)


def _matches_patterns(value: Any, patterns: List[str]) -> bool:
    text = _normalize_text_lower(value)
    if not text:
        return False
    return any(_normalize_text_lower(pattern) in text for pattern in (patterns or []))


def _detect_activity_group(value: Any, settings_cfg: Dict[str, Any]) -> str:
    activity_types_cfg = (settings_cfg or {}).get("activity_types") or {}
    ordered_groups = (
        ("lecture", activity_types_cfg.get("lecture") or DEFAULT_ACTIVITY_TYPES["lecture"]),
        ("lab_practice", activity_types_cfg.get("lab_practice") or DEFAULT_ACTIVITY_TYPES["lab_practice"]),
    )

    for group_key, patterns in ordered_groups:
        if _matches_patterns(value, list(patterns or [])):
            return group_key

    return ""


def _build_category_text(raw_row: Dict[str, Any], resolved_columns: Dict[str, Optional[str]]) -> str:
    parts = [
        _lookup_value(raw_row, resolved_columns, "discipline_col"),
        _lookup_value(raw_row, resolved_columns, "activity_type_col"),
        _lookup_value(raw_row, resolved_columns, "payment_form_col"),
        _lookup_value(raw_row, resolved_columns, "op_col"),
    ]
    return " | ".join(_normalize_text_lower(part) for part in parts if _normalize_text(part))


def _detect_special_bucket(raw_row: Dict[str, Any], resolved_columns: Dict[str, Optional[str]], settings_cfg: Dict[str, Any]) -> str:
    patterns_cfg = (settings_cfg or {}).get("special_workload_patterns") or {}
    category_text = _build_category_text(raw_row, resolved_columns)

    merged_patterns = {
        key: list(DEFAULT_SPECIAL_BUCKET_PATTERNS.get(key, [])) + list(patterns_cfg.get(key, []))
        for key in DEFAULT_SPECIAL_BUCKET_PATTERNS.keys()
    }

    bucket_tiebreakers = {
        "research_work": 4,
        "diploma_supervision": 3,
        "practika": 2,
        "other_work": 1,
    }
    best_bucket = "other_work"
    best_score = (0, 0, 0)

    for bucket, patterns in merged_patterns.items():
        matched_patterns = {
            normalized_pattern
            for pattern in (patterns or [])
            for normalized_pattern in [_normalize_text_lower(pattern)]
            if normalized_pattern and normalized_pattern in category_text
        }
        if not matched_patterns:
            continue

        score = (
            len(matched_patterns),
            max(len(pattern) for pattern in matched_patterns),
            bucket_tiebreakers.get(bucket, 0),
        )
        if score > best_score:
            best_score = score
            best_bucket = bucket

    if best_score[0] > 0:
        return best_bucket

    return "other_work"


def _coalesce(*values: Any) -> Any:
    for value in values:
        if _not_empty(value):
            return value
    return ""


def _compute_credits(
    raw_row: Dict[str, Any],
    resolved_columns: Dict[str, Optional[str]],
    scope: Tuple[int, ...],
    semester_values: Dict[int, Any],
) -> Any:
    explicit_credits = _lookup_value(raw_row, resolved_columns, "credits_col")
    if _not_empty(explicit_credits):
        return explicit_credits

    if len(scope) == 1:
        return semester_values.get(scope[0], "")

    return ""


def _compute_academic_period(
    raw_row: Dict[str, Any],
    resolved_columns: Dict[str, Optional[str]],
    scope: Tuple[int, ...],
) -> Any:
    explicit_period = _lookup_value(raw_row, resolved_columns, "academic_period_col")
    if _not_empty(explicit_period):
        return explicit_period

    if len(scope) == 1:
        return scope[0]

    return ""


def _assign_direct_hours(out: Dict[str, float], raw_row: Dict[str, Any], resolved_columns: Dict[str, Optional[str]]) -> None:
    out["l"] = _to_num(_lookup_value(raw_row, resolved_columns, "lecture_hours_col"))
    out["spz"] = _to_num(_lookup_value(raw_row, resolved_columns, "practice_hours_col"))
    out["lz"] = _to_num(_lookup_value(raw_row, resolved_columns, "lab_hours_col"))
    out["srsp"] = _to_num(_lookup_value(raw_row, resolved_columns, "srsp_hours_col"))
    out["rk_1_2"] = _to_num(_lookup_value(raw_row, resolved_columns, "rk_hours_col"))
    out["ekzameny"] = _to_num(_lookup_value(raw_row, resolved_columns, "exam_hours_col"))
    out["practika"] = _to_num(_lookup_value(raw_row, resolved_columns, "practice_load_col"))
    out["diploma_supervision"] = _to_num(_lookup_value(raw_row, resolved_columns, "diploma_load_col"))
    out["research_work"] = _to_num(_lookup_value(raw_row, resolved_columns, "research_load_col"))
    out["other_work"] = _to_num(_lookup_value(raw_row, resolved_columns, "other_load_col"))


def _build_normalized_row(
    *,
    raw_row: Dict[str, Any],
    row_order: int,
    resolved_columns: Dict[str, Optional[str]],
    settings_cfg: Dict[str, Any],
    scope: Tuple[int, ...],
    semester_values: Dict[int, Any],
    load_kind: str,
    academic_year: str,
) -> Dict[str, Any]:
    activity_value = _lookup_value(raw_row, resolved_columns, "activity_type_col")
    activity_group = _detect_activity_group(activity_value, settings_cfg)
    group_value = _lookup_value(raw_row, resolved_columns, "group_col")
    op_value = _lookup_value(raw_row, resolved_columns, "op_col")
    total_candidate = max(
        _to_num(_lookup_value(raw_row, resolved_columns, "total_col")),
        _to_num(_lookup_value(raw_row, resolved_columns, "normative_col")),
    )
    special_bucket = _detect_special_bucket(raw_row, resolved_columns, settings_cfg)

    out: Dict[str, Any] = {
        "_raw": raw_row,
        "_row_order": row_order,
        "_scope": scope,
        "_scope_key": _scope_key(scope),
        "_load_kind": load_kind,
        "_activity_group": activity_group,
        "_special_bucket": special_bucket,
        "discipline": _coalesce(_lookup_value(raw_row, resolved_columns, "discipline_col")),
        "op": _coalesce(op_value),
        "group": _coalesce(group_value),
        "course": "",
        "academic_period": "",
        "credits": "",
        "student_count": "",
        "activity_type": _coalesce(activity_value),
        "payment_form": _coalesce(_lookup_value(raw_row, resolved_columns, "payment_form_col")),
    }

    numeric_values = {
        "l": 0.0,
        "spz": 0.0,
        "lz": 0.0,
        "srsp": 0.0,
        "rk_1_2": 0.0,
        "ekzameny": 0.0,
        "practika": 0.0,
        "diploma_supervision": 0.0,
        "research_work": 0.0,
        "other_work": 0.0,
    }
    _assign_direct_hours(numeric_values, raw_row, resolved_columns)

    has_direct_workload = any(value > 0 for value in numeric_values.values())

    if not has_direct_workload:
        if activity_group in ("lecture", "lab_practice"):
            pass
        elif total_candidate > 0:
            numeric_values[special_bucket] = total_candidate

    has_class_workload = any(
        numeric_values[field_key] > 0
        for field_key in ("l", "spz", "lz", "srsp", "rk_1_2", "ekzameny")
    )
    preserve_study_attrs = has_class_workload or activity_group in ("lecture", "lab_practice")

    if preserve_study_attrs:
        out["course"] = _coalesce(
            _lookup_value(raw_row, resolved_columns, "course_col"),
            _derive_course(group_value, op_value, academic_year),
        )
        out["academic_period"] = _compute_academic_period(raw_row, resolved_columns, scope)
        out["credits"] = _compute_credits(raw_row, resolved_columns, scope, semester_values)
        out["student_count"] = _coalesce(_lookup_value(raw_row, resolved_columns, "student_count_col"))

    out.update(numeric_values)
    out["itogo"] = sum(
        numeric_values[field_key]
        for field_key in numeric_values.keys()
    )

    return out


def _row_merge_value(row: Dict[str, Any], key: str) -> Any:
    if key in row:
        return row.get(key)
    raw_row = row.get("_raw") or {}
    return raw_row.get(key)


def _first_non_empty(rows: List[Dict[str, Any]], key: str, default: Any = "") -> Any:
    for row in rows:
        value = _row_merge_value(row, key)
        if _not_empty(value):
            return value
    return default


def _max_numeric(rows: List[Dict[str, Any]], key: str) -> Any:
    best_value = 0.0
    found = False
    for row in rows:
        value = _row_merge_value(row, key)
        if not _not_empty(value):
            continue
        numeric = _to_num(value)
        if numeric >= best_value:
            best_value = numeric
            found = True
    if not found:
        return ""
    return best_value


def _merge_workload_rows(rows: List[Dict[str, Any]], settings_cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    merge_rules = (settings_cfg or {}).get("merge_rules") or {}
    key_cols = merge_rules.get("key_cols") or ["discipline", "op", "credits"]
    sum_cols_by_type = merge_rules.get("sum_cols_by_type") or DEFAULT_SUM_COLS_BY_TYPE
    group_priority_type = _normalize_text(merge_rules.get("group_priority_type"))
    group_join = merge_rules.get("group_join") or ", "
    first_non_empty_cols = merge_rules.get("first_non_empty_cols") or []

    field_to_activity_groups: Dict[str, List[str]] = defaultdict(list)
    for activity_group, fields in (sum_cols_by_type or {}).items():
        normalized_group = _normalize_text(activity_group)
        if not normalized_group:
            continue
        for field in fields or []:
            normalized_field = _normalize_text(field)
            if not normalized_field:
                continue
            field_to_activity_groups[normalized_field].append(normalized_group)

    grouped: Dict[Tuple[str, ...], List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = tuple(_normalize_text_lower(_row_merge_value(row, key_col)) for key_col in key_cols)
        grouped[key].append(row)

    merged_rows: List[Dict[str, Any]] = []
    for group_rows in grouped.values():
        group_rows = sorted(group_rows, key=lambda item: item.get("_row_order") or 0)
        merged: Dict[str, Any] = {
            "_row_order": min(int(row.get("_row_order") or 0) for row in group_rows),
            "_scope_key": group_rows[0].get("_scope_key"),
            "discipline": _first_non_empty(group_rows, "discipline"),
            "op": _first_non_empty(group_rows, "op"),
            "course": _first_non_empty(group_rows, "course"),
            "academic_period": _first_non_empty(group_rows, "academic_period"),
            "credits": _first_non_empty(group_rows, "credits"),
            "student_count": _max_numeric(group_rows, "student_count"),
        }

        preferred_group_rows = [
            row
            for row in group_rows
            if group_priority_type and _normalize_text(row.get("_activity_group")) == group_priority_type
        ]
        merged["group"] = _join_unique_texts(
            (_row_merge_value(row, "group") for row in (preferred_group_rows or group_rows)),
            separator=group_join,
        )
        if not merged["group"] and preferred_group_rows:
            merged["group"] = _join_unique_texts(
                (_row_merge_value(row, "group") for row in group_rows),
                separator=group_join,
            )

        for field_key in first_non_empty_cols:
            if field_key in merged:
                continue
            merged[field_key] = _first_non_empty(group_rows, field_key)

        for field_key in ("l", "spz", "lz", "srsp", "rk_1_2", "ekzameny", "practika", "diploma_supervision", "research_work", "other_work"):
            activity_groups = field_to_activity_groups.get(field_key) or []
            if activity_groups:
                merged[field_key] = sum(
                    _to_num(row.get(field_key))
                    for row in group_rows
                    if _normalize_text(row.get("_activity_group")) in activity_groups
                )
            else:
                merged[field_key] = sum(_to_num(row.get(field_key)) for row in group_rows)

        merged["itogo"] = sum(
            _to_num(merged.get(field_key))
            for field_key in ("l", "spz", "lz", "srsp", "rk_1_2", "ekzameny", "practika", "diploma_supervision", "research_work", "other_work")
        )
        merged_rows.append(merged)

    merged_rows.sort(key=lambda item: item.get("_row_order") or 0)
    return merged_rows


def _sum_scope_rows(rows: List[Dict[str, Any]]) -> Dict[str, float]:
    totals = {field_key: 0.0 for field_key in WORKLOAD_VALUE_FIELDS}
    for row in rows:
        for field_key in WORKLOAD_VALUE_FIELDS:
            totals[field_key] += _to_num(row.get(field_key))
    return totals


def build_teaching_load_context(
    *,
    teacher: Dict[str, Any],
    excel_columns: List[Tuple[str, str]],
    excel_rows: List[Dict[str, Any]],
    settings_cfg: Dict[str, Any],
    academic_year: str,
) -> Dict[str, Any]:
    col_to_header = {col_name: header_text for col_name, header_text in excel_columns}
    resolved_columns = _resolve_columns(excel_columns, settings_cfg)

    teacher_col = resolved_columns.get("teacher_col")
    staff_hours_col = resolved_columns.get("staff_hours_col")

    if not teacher_col or not staff_hours_col:
        raise Exception("Настройки неполные: columns.teacher_col и columns.staff_hours_col обязательны")

    semester_map = detect_semester_columns(excel_columns)
    if not semester_map:
        raise Exception("Не найдены колонки семестров в Excel")

    semester_numbers = sorted(int(str(key).replace("sem", "")) for key in semester_map.keys())
    primary_common_scope_key = _scope_key(tuple(semester_numbers))

    rows_by_load_scope: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
        "staff": defaultdict(list),
        "hourly": defaultdict(list),
    }

    for row_order, row_data in enumerate(excel_rows, start=1):
        raw_row = _build_raw_row(row_data, col_to_header)

        if not _match_teacher(raw_row.get(teacher_col), teacher["full_name"]):
            continue

        staff_total = _to_num(raw_row.get(resolved_columns.get("staff_hours_col") or ""))
        hourly_col = resolved_columns.get("hourly_hours_col")
        hourly_total = _to_num(raw_row.get(hourly_col or "")) if hourly_col else 0.0

        load_kinds: List[str] = []
        if staff_total > 0:
            load_kinds.append("staff")
        if hourly_total > 0:
            load_kinds.append("hourly")
        if not load_kinds:
            continue

        scope, semester_values = _scope_from_row(semester_map=semester_map, raw_row=raw_row)
        if not scope:
            continue

        for load_kind in load_kinds:
            normalized = _build_normalized_row(
                raw_row=raw_row,
                row_order=row_order,
                resolved_columns=resolved_columns,
                settings_cfg=settings_cfg,
                scope=scope,
                semester_values=semester_values,
                load_kind=load_kind,
                academic_year=academic_year,
            )
            rows_by_load_scope[load_kind][normalized["_scope_key"]].append(normalized)

    teaching_load: Dict[str, Any] = {
        "semesters": semester_numbers,
        "primary_common_scope_key": primary_common_scope_key,
        "scope_order": [],
        "staff": {
            "rows_by_scope": {},
            "totals_by_scope": {},
            "annual_totals": {field_key: 0.0 for field_key in WORKLOAD_VALUE_FIELDS},
        },
        "hourly": {
            "rows_by_scope": {},
            "totals_by_scope": {},
            "annual_totals": {field_key: 0.0 for field_key in WORKLOAD_VALUE_FIELDS},
        },
        "resolved_columns": resolved_columns,
    }

    seen_scope_keys = set()
    for sem_num in semester_numbers:
        seen_scope_keys.add(str(sem_num))
    for load_kind in ("staff", "hourly"):
        seen_scope_keys.update(rows_by_load_scope[load_kind].keys())

    common_scope_keys = sorted(
        [scope_key for scope_key in seen_scope_keys if "," in scope_key],
        key=_scope_sort_key,
    )
    teaching_load["scope_order"] = [str(sem_num) for sem_num in semester_numbers] + common_scope_keys

    for load_kind in ("staff", "hourly"):
        annual_totals = {field_key: 0.0 for field_key in WORKLOAD_VALUE_FIELDS}
        for scope_key, raw_scope_rows in rows_by_load_scope[load_kind].items():
            merged_rows = _merge_workload_rows(raw_scope_rows, settings_cfg)
            scope_totals = _sum_scope_rows(merged_rows)
            teaching_load[load_kind]["rows_by_scope"][scope_key] = merged_rows
            teaching_load[load_kind]["totals_by_scope"][scope_key] = scope_totals
            for field_key in WORKLOAD_VALUE_FIELDS:
                annual_totals[field_key] += scope_totals[field_key]
        teaching_load[load_kind]["annual_totals"] = annual_totals

    return {
        "teacher": teacher,
        "teaching_load": teaching_load,
    }
