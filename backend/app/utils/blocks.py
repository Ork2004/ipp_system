import re
from typing import Dict, Any, List, Tuple, Optional


SEM_RE = re.compile(r"(?:(\d+)\s*(?:сем|semestr|semester))", re.IGNORECASE)


def detect_semester_columns(columns: List[Tuple[str, str]]) -> Dict[str, str]:
    found: Dict[int, str] = {}

    for col_name, header_text in columns:
        if not header_text:
            continue
        m = SEM_RE.search(str(header_text))
        if not m:
            continue
        try:
            sem_num = int(m.group(1))
        except Exception:
            continue
        if sem_num <= 0:
            continue
        if sem_num not in found:
            found[sem_num] = col_name

    out: Dict[str, str] = {}
    for sem_num in sorted(found.keys()):
        out[f"sem{sem_num}"] = found[sem_num]
    return out


def match_teacher(value: Any, teacher_full_name: str) -> bool:
    if value is None:
        return False
    if not isinstance(value, str):
        value = str(value)
    return teacher_full_name.lower() in value.lower()


def to_num(x: Any) -> float:
    if x is None:
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    try:
        return float(str(x).replace(",", ".").strip())
    except Exception:
        return 0.0


def not_empty(x: Any) -> bool:
    if x is None:
        return False
    return str(x).strip() != ""


def build_row_object(row_data: dict, col_to_header: dict) -> dict:
    out = {}
    for col_name, header_text in col_to_header.items():
        out[col_name] = row_data.get(header_text)
    return out

def _match_activity_type(value: Any, patterns: List[str]) -> bool:
    if value is None:
        return False
    s = str(value).lower()
    for p in patterns:
        if p.lower() in s:
            return True
    return False


def _normalize_str(x: Any) -> str:
    if x is None:
        return ""
    return re.sub(r"\s+", " ", str(x)).strip()


def merge_rows_dynamic(
    rows: List[dict],
    settings_cfg: dict,
) -> List[dict]:

    if not rows:
        return []

    columns_cfg = settings_cfg.get("columns", {})
    merge_rules = settings_cfg.get("merge_rules", {})
    activity_types = settings_cfg.get("activity_types", {})

    discipline_col = columns_cfg.get("discipline_col")
    activity_col = columns_cfg.get("activity_type_col")
    group_col = columns_cfg.get("group_col")

    key_cols = merge_rules.get("key_cols", [])
    sum_cols_by_type = merge_rules.get("sum_cols_by_type", {})
    first_non_empty_cols = merge_rules.get("first_non_empty_cols", [])
    group_priority_type = merge_rules.get("group_priority_type", "lecture")
    group_join = merge_rules.get("group_join", ", ")

    lecture_patterns = activity_types.get("lecture", [])
    lab_patterns = activity_types.get("lab_practice", [])

    grouped: Dict[Tuple, List[dict]] = {}

    for r in rows:
        key = []
        for kc in key_cols:
            key.append(_normalize_str(r.get(kc)))
        grouped.setdefault(tuple(key), []).append(r)

    merged_rows: List[dict] = []

    for key, group_rows in grouped.items():

        merged: Dict[str, Any] = {}

        lecture_rows = []
        lab_rows = []

        for r in group_rows:
            activity_val = r.get(activity_col)
            if _match_activity_type(activity_val, lecture_patterns):
                lecture_rows.append(r)
            elif _match_activity_type(activity_val, lab_patterns):
                lab_rows.append(r)
            else:
                lecture_rows.append(r)

        for idx, kc in enumerate(key_cols):
            merged[kc] = key[idx]

        if group_col:
            if lecture_rows and group_priority_type == "lecture":
                merged[group_col] = lecture_rows[0].get(group_col)
            else:
                all_groups = set()
                for r in group_rows:
                    g = _normalize_str(r.get(group_col))
                    if g:
                        all_groups.add(g)
                merged[group_col] = group_join.join(sorted(all_groups))

        for col in first_non_empty_cols:
            val = None
            for r in group_rows:
                if not_empty(r.get(col)):
                    val = r.get(col)
                    break
            merged[col] = val

        total_sum = 0.0

        for col in sum_cols_by_type.get("lecture", []):
            s = sum(to_num(r.get(col)) for r in lecture_rows)
            merged[col] = s
            total_sum += s

        for col in sum_cols_by_type.get("lab_practice", []):
            s = sum(to_num(r.get(col)) for r in lab_rows)
            merged[col] = s
            total_sum += s

        if "itogo" in merged:
            merged["itogo"] = total_sum

        merged_rows.append(merged)

    return merged_rows

def build_block_rows(
    *,
    loop_key: str,
    excel_rows: List[dict],
    col_to_header: Dict[str, str],
    teacher_full_name: str,
    teacher_col: str,
    semester_map: Dict[str, str],
    staff_hours_col: str,
    hourly_hours_col: Optional[str],
    settings_cfg: dict,
) -> List[dict]:

    parts = loop_key.split(".")
    if len(parts) != 4:
        return []
    if parts[0] != "blocks" or parts[1] != "teaching_load":
        return []

    load_kind = parts[2]
    sem_key = parts[3]

    if load_kind not in ("staff", "hourly"):
        return []

    sem_col = semester_map.get(sem_key)
    if not sem_col:
        return []

    def get_val(row_data: dict, col_name: str):
        ht = col_to_header.get(col_name)
        return None if not ht else row_data.get(ht)

    raw_rows: List[dict] = []

    for rd in excel_rows:

        if not match_teacher(get_val(rd, teacher_col), teacher_full_name):
            continue

        if not not_empty(get_val(rd, sem_col)):
            continue

        s_val = to_num(get_val(rd, staff_hours_col))
        h_val = to_num(get_val(rd, hourly_hours_col)) if hourly_hours_col else 0.0

        if load_kind == "staff" and s_val <= 0:
            continue
        if load_kind == "hourly" and h_val <= 0:
            continue

        raw_rows.append(build_row_object(rd, col_to_header))

    merged = merge_rows_dynamic(raw_rows, settings_cfg)

    return merged