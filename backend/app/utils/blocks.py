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


def build_available_block_keys(semester_map: Dict[str, str], has_hourly: bool) -> List[dict]:
    blocks = []
    for sem_key in semester_map.keys():
        blocks.append({
            "key": f"blocks.teaching_load.staff.{sem_key}",
            "title": f"Учебная нагрузка (штатная) — {sem_key}",
            "type": "loop",
        })
        if has_hourly:
            blocks.append({
                "key": f"blocks.teaching_load.hourly.{sem_key}",
                "title": f"Учебная нагрузка (почасовая) — {sem_key}",
                "type": "loop",
            })
    return blocks


def build_block_snippet(loop_key: str, loop_var: str = "row") -> str:
    return (
        "{%tr for " + loop_var + " in " + loop_key + " %}\n"
        "  {{ " + loop_var + ".distsiplina }}\n"
        "{%tr endfor %}"
    )


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

    out: List[dict] = []

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

        out.append(build_row_object(rd, col_to_header))

    return out
