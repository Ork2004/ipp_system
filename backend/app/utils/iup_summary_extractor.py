"""
Extract Form 63 hours from the IUP (ИУП docx) summary table.

The IUP ends with a static summary table of the shape

    | № | Виды работ                              | 1 семестр       | 2 семестр       | За уч. год |
    |   |                                         | План | Орынд.   | План | Орынд.   | ...        |
    | 1 | Учебная работа        — Аудиторная       | ...  | ...      | ...  | ...      | ...        |
    | 1 | Учебная работа        — Внеаудиторная    | ...  | ...      | ...  | ...      | ...        |
    | 2 | Учебно-методическая                     | ...  | ...      | ...  | ...      | ...        |
    | 3 | Научная                                 | ...  | ...      | ...  | ...      | ...        |
    | 4 | Организационно-методическая             | ...  | ...      | ...  | ...      | ...        |
    | 5 | Воспитательная                          | ...  | ...      | ...  | ...      | ...        |
    | 6 | Повышение квалификации                  | ...  | ...      | ...  | ...      | ...        |
    | 7 | Общественная                            | ...  | ...      | ...  | ...      | ...        |
    | Итого                                                                                       |

The teacher fills the План columns. Form 63 K..R columns are exactly these
values. This module finds that table and reads the planned hours per category
per semester.

The extractor is structure-driven:
- The summary table is identified by its header (must contain "1 семестр" and
  "2 семестр") rather than by section_title or fingerprint, so the IUP
  template can change between years and still work.
- Plan columns are identified by scanning header rows (row 0 = "1 семестр" /
  "2 семестр", row 1 = "План" / "Жоспар" / "Plan").
- Row labels are matched by Russian/Kazakh keyword fragments — column 1 and
  column 2 are concatenated to handle horizontally-merged cells.
"""

from typing import Optional


SUMMARY_REQUIRED_HEADER_KEYWORDS = ("1 семестр", "2 семестр")


CATEGORY_FIELDS = {
    "teaching_auditory": "teaching_auditory_hours",
    "teaching_extraauditory": "teaching_extraauditory_hours",
    "methodical": "methodical_hours",
    "research": "research_hours",
    "organizational_methodical": "organizational_methodical_hours",
    "educational": "educational_hours",
    "qualification": "qualification_hours",
    "social": "social_hours",
}


def _norm(text) -> str:
    if text is None:
        return ""
    return " ".join(str(text).split()).strip().lower()


def _to_float(value) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(str(value).strip().replace(",", "."))
    except Exception:
        return 0.0


def is_summary_table(matrix) -> bool:
    """True if this table is the IUP planning summary."""
    if not matrix or len(matrix) < 2:
        return False
    header_blob = " | ".join(
        _norm(cell.get("text"))
        for row in matrix[:2]
        for cell in row
    )
    return all(kw in header_blob for kw in SUMMARY_REQUIRED_HEADER_KEYWORDS)


def find_plan_columns(matrix) -> tuple[Optional[int], Optional[int]]:
    """
    Return (col_1sem_plan, col_2sem_plan).

    A plan column is one whose row-0 cell contains "1 семестр" / "2 семестр"
    AND whose row-1 cell contains "план" / "жоспар" / "plan".
    """
    if len(matrix) < 2:
        return (None, None)

    row0 = matrix[0]
    row1 = matrix[1]
    width = min(len(row0), len(row1))

    col_1 = None
    col_2 = None
    for i in range(width):
        r0 = _norm(row0[i].get("text"))
        r1 = _norm(row1[i].get("text"))
        is_plan = ("план" in r1) or ("жоспар" in r1) or ("plan" in r1)
        if not is_plan:
            continue
        if "1 семестр" in r0 and col_1 is None:
            col_1 = i
        elif "2 семестр" in r0 and col_2 is None:
            col_2 = i

    return (col_1, col_2)


def classify_summary_row(label_text: str) -> Optional[str]:
    """
    Map a row's label text to a Form 63 category.

    Order matters — 'внеаудиторная' must be checked before 'аудиторная',
    otherwise the substring will match.
    """
    text = _norm(label_text)
    if not text:
        return None

    if "внеаудиторная" in text:
        return "teaching_extraauditory"
    if "аудиторная" in text:
        return "teaching_auditory"
    if "учебно-методическ" in text or "оқу-әдістемелік" in text:
        return "methodical"
    if "научная" in text or "научно-исследов" in text or "ғылыми" in text:
        return "research"
    if "организационно" in text or "әдістеме-ұйымдастыру" in text:
        return "organizational_methodical"
    if "воспитательная" in text or "тәрбие" in text:
        return "educational"
    if "повышение квалификации" in text or "біліктілігін көтеру" in text:
        return "qualification"
    if "общественная" in text or "қоғамдық" in text:
        return "social"
    return None


def _is_total_row(label_text: str) -> bool:
    text = _norm(label_text)
    return any(kw in text for kw in ("итого", "барлығы", "всего", "total"))


def extract_summary_from_matrix(matrix) -> dict[str, dict[str, float]]:
    """
    Read planned hours per category per semester out of an IUP summary
    matrix. Returns a dict like

        {
            "teaching_auditory":          {"sem1": 125.0, "sem2": 102.0},
            "teaching_extraauditory":     {"sem1": 382.5, "sem2": 382.5},
            "methodical":                 {"sem1": 125.5, "sem2": 144.9},
            "research":                   {"sem1": 450.0, "sem2": 450.0},
            "organizational_methodical":  {"sem1": 85.0,  "sem2": 85.0},
            "educational":                {"sem1": 0.0,   "sem2": 0.0},
            "qualification":              {"sem1": 50.0,  "sem2": 72.0},
            "social":                     {"sem1": 25.0,  "sem2": 25.0},
        }

    Categories that aren't found stay absent.
    """
    result: dict[str, dict[str, float]] = {}

    col_1sem, col_2sem = find_plan_columns(matrix)
    if col_1sem is None and col_2sem is None:
        return result

    # Take label text from the cells before the first plan column.
    label_end = min(c for c in (col_1sem, col_2sem) if c is not None)

    for row in matrix[2:]:
        if not row:
            continue

        label_parts = []
        for cell in row[:label_end]:
            t = _norm(cell.get("text"))
            if t:
                label_parts.append(t)
        # de-dup adjacent identical parts (horizontal merges return same text twice)
        deduped: list[str] = []
        for p in label_parts:
            if not deduped or deduped[-1] != p:
                deduped.append(p)
        label = " ".join(deduped)

        if not label or _is_total_row(label):
            continue

        category = classify_summary_row(label)
        if not category:
            continue

        sem1_val = 0.0
        sem2_val = 0.0
        if col_1sem is not None and col_1sem < len(row):
            sem1_val = _to_float(row[col_1sem].get("text"))
        if col_2sem is not None and col_2sem < len(row):
            sem2_val = _to_float(row[col_2sem].get("text"))

        prev = result.get(category, {"sem1": 0.0, "sem2": 0.0})
        result[category] = {
            "sem1": prev["sem1"] + sem1_val,
            "sem2": prev["sem2"] + sem2_val,
        }

    return result


# ---- DB-backed lookup ----

def _build_matrix_from_db_cells(rows) -> list[list[dict]]:
    """
    rows: iterable of (row_index, col_index, text) tuples.
    Returns a dense 2D matrix of cell-dicts compatible with the rest of this module.
    """
    rows = list(rows)
    if not rows:
        return []

    max_row = max(r for r, _, _ in rows)
    max_col = max(c for _, c, _ in rows)

    matrix: list[list[dict]] = [
        [
            {"row_index": r, "col_index": c, "text": ""}
            for c in range(max_col + 1)
        ]
        for r in range(max_row + 1)
    ]
    for r, c, t in rows:
        if r <= max_row and c <= max_col:
            matrix[r][c]["text"] = t or ""
    return matrix


def _merge_matrices(base: list[list[dict]], overlay_rows) -> list[list[dict]]:
    """Apply manual values on top of raw template cells."""
    if not overlay_rows:
        return base
    for r, c, t in overlay_rows:
        if r >= len(base):
            continue
        if c >= len(base[r]):
            continue
        if t is not None and str(t).strip() != "":
            base[r][c]["text"] = t
    return base


def extract_summary_for_teacher(
    conn,
    teacher_id: int,
    academic_year: str,
) -> dict[str, dict[str, float]]:
    """
    Look up this teacher's IUP snapshot for the given year, find the summary
    table inside it, and return planned hours per Form 63 category per semester.
    Returns {} if no snapshot exists or no summary table is found.
    """
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT s.id, s.raw_table_id
            FROM teacher_manual_table_snapshots s
            JOIN raw_docx_tables t ON t.id = s.raw_table_id
            WHERE s.teacher_id = %s
              AND s.academic_year = %s
              AND t.table_type = 'static'
            """,
            (teacher_id, academic_year),
        )
        candidates = cur.fetchall()

        for snapshot_id, raw_table_id in candidates:
            cur.execute(
                """
                SELECT row_index, col_index, original_text
                FROM raw_docx_cells
                WHERE table_id = %s
                ORDER BY row_index, col_index
                """,
                (raw_table_id,),
            )
            raw_rows = cur.fetchall()
            base_matrix = _build_matrix_from_db_cells(raw_rows)
            if not is_summary_table(base_matrix):
                continue

            cur.execute(
                """
                SELECT row_index, col_index, value_text
                FROM teacher_manual_static_cell_values
                WHERE snapshot_id = %s
                """,
                (snapshot_id,),
            )
            manual_rows = cur.fetchall()
            merged = _merge_matrices(base_matrix, manual_rows)
            return extract_summary_from_matrix(merged)

        return {}
    finally:
        cur.close()


# ---- Direct docx extraction (for testing without DB) ----

def extract_summary_from_docx(file_path: str) -> dict[str, dict[str, float]]:
    """
    Open an IUP docx, find the summary table, return planned hours.
    Useful for offline tests on a sample file.
    """
    from backend.app.utils.raw_docx_parser import scan_raw_docx

    parsed = scan_raw_docx(file_path)
    for table in parsed.get("tables", []):
        matrix = table.get("matrix") or []
        if is_summary_table(matrix):
            return extract_summary_from_matrix(matrix)
    return {}
