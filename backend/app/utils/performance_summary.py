import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

from backend.app.utils.teaching_load import build_teaching_load_summary

TOTAL_TEXT_VARIANTS = ("итого", "итог", "total", "всего", "барлығы")
CLASS_TOTAL_FIELDS = (
    "l",
    "spz",
    "lz",
    "srsp",
    "rk_1_2",
    "ekzameny",
)
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


def _to_num(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", ".").strip())
    except Exception:
        return 0.0


def _to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return f"{value:.2f}".rstrip("0").rstrip(".")
    return str(value)


def _safe_get_cell(table, row_index: int, col_index: int):
    try:
        return table.rows[row_index].cells[col_index]
    except Exception:
        return None


def _set_cell_text(cell, value: Any):
    if cell is None:
        return
    cell.text = _to_str(value)


def _display_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, (int, float)) and abs(float(value)) < 1e-9:
        return ""
    return value


def _is_total_text(text: str) -> bool:
    return any(variant in text for variant in TOTAL_TEXT_VARIANTS)


def _parse_scope_from_text(text: str) -> tuple[int, ...]:
    norm = _normalize_text(text).lower()
    if not norm:
        return ()
    if "\u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c" in norm and not _is_total_text(norm):
        return ()

    match = re.match(r"^\s*(\d+(?:\s*,\s*\d+)*)", norm)
    if not match:
        return ()

    if "\u0441\u0435\u043c" not in norm and "sem" not in norm and not re.fullmatch(r"\d+(?:\s*,\s*\d+)*", norm):
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


def _find_performance_overview_item(
    table_items: List[Dict[str, Any]],
    target_table_index: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    if target_table_index is not None:
        for item in table_items:
            if int(item["table_index"]) == int(target_table_index):
                return item
        return None

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


def render_final_performance_summary(
    doc: Document,
    context: Dict[str, Any],
    target_table_index: Optional[int] = None,
) -> None:
    table_items = _iter_doc_tables_with_context(doc)
    overview_item = _find_performance_overview_item(table_items, target_table_index)
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


