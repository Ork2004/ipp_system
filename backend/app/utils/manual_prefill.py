import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple


def _norm(x: Any) -> str:
    if x is None:
        return ""
    return re.sub(r"\s+", " ", str(x)).strip().lower()


def _sim(a: Any, b: Any) -> float:
    aa = _norm(a)
    bb = _norm(b)
    if not aa and not bb:
        return 1.0
    if not aa or not bb:
        return 0.0
    return SequenceMatcher(None, aa, bb).ratio()


def _parse_academic_year(year: str) -> Optional[Tuple[int, int]]:
    s = str(year or "").strip()
    m = re.match(r"^\s*(\d{4})\s*[-/]\s*(\d{4})\s*$", s)
    if not m:
        return None
    y1 = int(m.group(1))
    y2 = int(m.group(2))
    if y2 != y1 + 1:
        return None
    return y1, y2


def get_previous_academic_year(year: str) -> Optional[str]:
    parsed = _parse_academic_year(year)
    if not parsed:
        return None
    y1, y2 = parsed
    return f"{y1 - 1}-{y2 - 1}"


def _column_hints_overlap_score(current_hints: List[str], prev_hints: List[str]) -> float:
    c = [_norm(x) for x in (current_hints or []) if _norm(x)]
    p = [_norm(x) for x in (prev_hints or []) if _norm(x)]

    if not c or not p:
        return 0.0

    matched = 0
    used_prev = set()

    for cur_hint in c:
        best_idx = None
        best_score = 0.0

        for idx, prev_hint in enumerate(p):
            if idx in used_prev:
                continue
            s = _sim(cur_hint, prev_hint)
            if s > best_score:
                best_score = s
                best_idx = idx

        if best_idx is not None and best_score >= 0.82:
            used_prev.add(best_idx)
            matched += 1

    return matched / max(len(c), len(p), 1)


def calc_snapshot_match_score(current_table: Dict[str, Any], prev_snapshot: Dict[str, Any]) -> float:
    score = 0.0

    if _norm(current_table.get("table_fingerprint")) == _norm(prev_snapshot.get("table_fingerprint")):
        score += 100.0

    if _norm(current_table.get("table_type")) == _norm(prev_snapshot.get("table_type")):
        score += 20.0

    score += _sim(current_table.get("section_title"), prev_snapshot.get("section_title")) * 20.0
    score += _sim(current_table.get("header_signature"), prev_snapshot.get("header_signature")) * 35.0
    score += _column_hints_overlap_score(
        current_table.get("column_hints") or [],
        prev_snapshot.get("column_hints") or [],
    ) * 25.0

    return score


def _build_static_col_mapping(
    current_matrix: List[List[Dict[str, Any]]],
    prev_cells: List[Dict[str, Any]],
) -> Dict[Tuple[int, int], Dict[str, Any]]:

    prev_by_signature: Dict[Tuple[str, str], Dict[str, Any]] = {}
    prev_by_pos: Dict[Tuple[int, int], Dict[str, Any]] = {}

    for cell in prev_cells:
        row_sig = _norm(cell.get("row_signature"))
        col_hint = _norm(cell.get("column_hint_text"))
        if row_sig or col_hint:
            prev_by_signature[(row_sig, col_hint)] = cell
        prev_by_pos[(int(cell.get("row_index", 0)), int(cell.get("col_index", 0)))] = cell

    mapping: Dict[Tuple[int, int], Dict[str, Any]] = {}

    for row in current_matrix or []:
        for cell in row:
            if not cell.get("editable"):
                continue

            cur_row = int(cell.get("row_index", 0))
            cur_col = int(cell.get("col_index", 0))
            row_sig = _norm(cell.get("row_signature"))
            col_hint = _norm(cell.get("column_hint_text"))

            found = None

            if (row_sig, col_hint) in prev_by_signature:
                found = prev_by_signature[(row_sig, col_hint)]
            elif (cur_row, cur_col) in prev_by_pos:
                found = prev_by_pos[(cur_row, cur_col)]

            if found is not None:
                mapping[(cur_row, cur_col)] = found

    return mapping


def _build_loop_column_index_map(
    current_hints: List[str],
    prev_hints: List[str],
) -> Dict[int, int]:
    current_norm = [_norm(x) for x in (current_hints or [])]
    prev_norm = [_norm(x) for x in (prev_hints or [])]

    out: Dict[int, int] = {}
    used_prev = set()

    for cur_idx, cur_hint in enumerate(current_norm):
        best_prev_idx = None
        best_score = 0.0

        for prev_idx, prev_hint in enumerate(prev_norm):
            if prev_idx in used_prev:
                continue

            s = _sim(cur_hint, prev_hint)

            if s > best_score:
                best_score = s
                best_prev_idx = prev_idx

        if best_prev_idx is not None and best_score >= 0.78:
            used_prev.add(best_prev_idx)
            out[cur_idx] = best_prev_idx

    return out


def find_best_previous_snapshot(
    cur,
    *,
    teacher_id: int,
    academic_year: str,
    current_table: Dict[str, Any],
    min_score: float = 55.0,
) -> Optional[Dict[str, Any]]:
    prev_year = get_previous_academic_year(academic_year)
    if not prev_year:
        return None

    cur.execute(
        """
        SELECT
            id,
            teacher_id,
            academic_year,
            raw_template_id,
            raw_table_id,
            department_id,
            section_title,
            table_type,
            header_signature,
            column_hints,
            table_fingerprint,
            source_mode,
            prefilled_from_snapshot_id,
            created_at,
            updated_at
        FROM teacher_manual_table_snapshots
        WHERE teacher_id = %s
          AND academic_year = %s
        ORDER BY updated_at DESC, id DESC;
        """,
        (teacher_id, prev_year),
    )
    candidates = cur.fetchall() or []

    best = None
    best_score = -1.0

    for cand in candidates:
        score = calc_snapshot_match_score(current_table, cand)
        if score > best_score:
            best_score = score
            best = cand

    if not best or best_score < min_score:
        return None

    best = dict(best)
    best["_match_score"] = best_score
    return best


def load_previous_static_cells(cur, snapshot_id: int) -> List[Dict[str, Any]]:
    cur.execute(
        """
        SELECT
            id,
            snapshot_id,
            raw_cell_id,
            row_index,
            col_index,
            cell_key,
            semantic_key,
            row_signature,
            column_hint_text,
            value_text,
            created_at,
            updated_at
        FROM teacher_manual_static_cell_values
        WHERE snapshot_id = %s
        ORDER BY row_index, col_index, id;
        """,
        (snapshot_id,),
    )
    return cur.fetchall() or []


def load_previous_loop_rows(cur, snapshot_id: int) -> List[Dict[str, Any]]:
    cur.execute(
        """
        SELECT
            id,
            snapshot_id,
            row_order,
            created_at,
            updated_at
        FROM teacher_manual_loop_rows
        WHERE snapshot_id = %s
        ORDER BY row_order, id;
        """,
        (snapshot_id,),
    )
    rows = cur.fetchall() or []

    out: List[Dict[str, Any]] = []

    for row in rows:
        cur.execute(
            """
            SELECT
                id,
                loop_row_id,
                col_index,
                column_hint_text,
                semantic_key,
                value_text,
                created_at,
                updated_at
            FROM teacher_manual_loop_cell_values
            WHERE loop_row_id = %s
            ORDER BY col_index, id;
            """,
            (row["id"],),
        )
        cells = cur.fetchall() or []

        out.append({
            "id": row["id"],
            "row_order": row["row_order"],
            "cells": cells,
        })

    return out


def build_prefill_for_static_table(
    *,
    current_table: Dict[str, Any],
    prev_snapshot: Dict[str, Any],
    current_matrix: List[List[Dict[str, Any]]],
    prev_cells: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    mapping = _build_static_col_mapping(current_matrix, prev_cells)

    out: List[Dict[str, Any]] = []

    for row in current_matrix or []:
        for cell in row:
            if not cell.get("editable"):
                continue

            cur_row = int(cell.get("row_index", 0))
            cur_col = int(cell.get("col_index", 0))

            matched_prev = mapping.get((cur_row, cur_col))
            if not matched_prev:
                continue

            out.append({
                "row_index": cur_row,
                "col_index": cur_col,
                "cell_key": cell.get("cell_key"),
                "semantic_key": cell.get("semantic_key"),
                "row_signature": cell.get("row_signature"),
                "column_hint_text": cell.get("column_hint_text"),
                "value": matched_prev.get("value_text", "") or "",
                "from_previous_year": True,
                "match_score": prev_snapshot.get("_match_score"),
            })

    return out


def build_prefill_for_loop_table(
    *,
    current_table: Dict[str, Any],
    prev_snapshot: Dict[str, Any],
    prev_rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    current_hints = current_table.get("column_hints") or []
    prev_hints = prev_snapshot.get("column_hints") or []

    col_map = _build_loop_column_index_map(current_hints, prev_hints)

    if not col_map:
        return []

    out_rows: List[Dict[str, Any]] = []

    for prev_row in prev_rows:
        prev_cells = prev_row.get("cells") or []
        prev_by_col = {
            int(c.get("col_index", 0)): c.get("value_text", "") or ""
            for c in prev_cells
        }

        new_cells: List[Dict[str, Any]] = []

        for current_col_index, prev_col_index in col_map.items():
            new_cells.append({
                "col_index": current_col_index,
                "column_hint_text": (
                    current_hints[current_col_index]
                    if current_col_index < len(current_hints)
                    else f"Колонка {current_col_index + 1}"
                ),
                "value": prev_by_col.get(prev_col_index, ""),
            })

        out_rows.append({
            "row_order": prev_row.get("row_order"),
            "cells": sorted(new_cells, key=lambda x: x["col_index"]),
            "from_previous_year": True,
            "match_score": prev_snapshot.get("_match_score"),
        })

    return out_rows


def build_prefill_payload(
    cur,
    *,
    teacher_id: int,
    academic_year: str,
    current_table: Dict[str, Any],
    current_matrix: List[List[Dict[str, Any]]],
) -> Dict[str, Any]:
    prev_snapshot = find_best_previous_snapshot(
        cur,
        teacher_id=teacher_id,
        academic_year=academic_year,
        current_table=current_table,
    )

    if not prev_snapshot:
        return {
            "found": False,
            "source_snapshot_id": None,
            "source_academic_year": None,
            "table_type": current_table.get("table_type"),
            "static_values": [],
            "loop_rows": [],
        }

    if current_table.get("table_type") == "static":
        prev_cells = load_previous_static_cells(cur, prev_snapshot["id"])
        static_values = build_prefill_for_static_table(
            current_table=current_table,
            prev_snapshot=prev_snapshot,
            current_matrix=current_matrix,
            prev_cells=prev_cells,
        )
        return {
            "found": len(static_values) > 0,
            "source_snapshot_id": prev_snapshot["id"],
            "source_academic_year": prev_snapshot["academic_year"],
            "table_type": "static",
            "static_values": static_values,
            "loop_rows": [],
        }

    prev_rows = load_previous_loop_rows(cur, prev_snapshot["id"])
    loop_rows = build_prefill_for_loop_table(
        current_table=current_table,
        prev_snapshot=prev_snapshot,
        prev_rows=prev_rows,
    )
    return {
        "found": len(loop_rows) > 0,
        "source_snapshot_id": prev_snapshot["id"],
        "source_academic_year": prev_snapshot["academic_year"],
        "table_type": "loop",
        "static_values": [],
        "loop_rows": loop_rows,
    }