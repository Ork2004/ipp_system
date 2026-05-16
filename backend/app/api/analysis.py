from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from backend.app.database import get_connection

router = APIRouter(prefix="/analysis", tags=["analysis"])

# ──────────────────────────────────────────────────────────
# Индексы колонок Excel (строка 7 = заголовки, данные с 8)
# ──────────────────────────────────────────────────────────
COL_IDX = {
    "teacher_name": 24,  # ФИО ППС
    "position":     25,  # Должность
    "kind":          1,  # вид занятии
    "total":        16,  # Итого
    "discipline":    3,  # Дисциплина
}

LECTURE_KINDS  = {"лек", "лек."}
PRACTICE_KINDS = {"лаб/пра", "лаб", "пра", "практ", "практика"}
MOOC_KINDS     = {"моок", "моок-0", "моок-1"}


# ──────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────

def _safe_float(val) -> float:
    try:
        return float(val or 0)
    except (TypeError, ValueError):
        return 0.0


def _idx_to_col(n: int) -> str:
    """0→A, 1→B, 25→Z, 26→AA ..."""
    result = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        result = chr(65 + r) + result
    return result


def _get(rd: dict, idx: int):
    """Достаём значение из row_data по индексу колонки."""
    if idx in rd:
        return rd[idx]
    if str(idx) in rd:
        return rd[str(idx)]
    letter = _idx_to_col(idx)
    if letter in rd:
        return rd[letter]
    return None


def _parse_rows(rows, dept_name: str, academic_year: str) -> dict:
    buckets = defaultdict(lambda: {
        "total": 0.0, "lecture": 0.0, "practice": 0.0,
        "mooc": 0.0, "other": 0.0,
        "position": None, "disciplines": set(), "row_id": None,
    })

    for row in rows:
        rd = row["row_data"] or {}
        name = str(_get(rd, COL_IDX["teacher_name"]) or "").strip()
        if not name:
            continue

        kind  = str(_get(rd, COL_IDX["kind"]) or "").strip().lower()
        hours = _safe_float(_get(rd, COL_IDX["total"]))
        pos   = str(_get(rd, COL_IDX["position"]) or "").strip() or None
        disc  = str(_get(rd, COL_IDX["discipline"]) or "").strip()

        b = buckets[name]
        b["total"] += hours
        b["position"] = b["position"] or pos
        b["row_id"]   = b["row_id"] or row["id"]
        if disc:
            b["disciplines"].add(disc)

        if kind in LECTURE_KINDS:
            b["lecture"] += hours
        elif kind in PRACTICE_KINDS:
            b["practice"] += hours
        elif kind in MOOC_KINDS:
            b["mooc"] += hours
        else:
            b["other"] += hours

    result = {}
    for name, b in buckets.items():
        result[name] = {
            "id": b["row_id"] or 0,
            "teacher_name": name,
            "position": b["position"],
            "department": dept_name,
            "academic_year": academic_year,
            "total_hours": round(b["total"], 2),
            "lecture_hours": round(b["lecture"], 2),
            "practice_hours": round(b["practice"], 2),
            "mooc_hours": round(b["mooc"], 2),
            "other_hours": round(b["other"], 2),
            # алиасы для фронта (AnalysisPage.jsx)
            "scientific_hours": round(b["mooc"], 2),
            "teaching_auditory": round(b["lecture"], 2),
            "teaching_extraauditory": round(b["practice"], 2),
            "total": round(b["total"], 2),
            "disciplines_count": len(b["disciplines"]),
        }
    return result


# ──────────────────────────────────────────────────────────
# GET /analysis
# ──────────────────────────────────────────────────────────

@router.get("")
async def get_analysis(
    academic_year: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
):
    try:
        conn = get_connection()
        cur  = conn.cursor()

        # Получаем excel_templates
        q = """
            SELECT et.id, et.academic_year, d.name AS dept_name
            FROM excel_templates et
            LEFT JOIN departments d ON d.id = et.department_id
            WHERE et.status = 'parsed'
        """
        params = []
        if academic_year:
            q += " AND et.academic_year = %s"
            params.append(academic_year)
        if department_id:
            q += " AND et.department_id = %s"
            params.append(department_id)

        cur.execute(q, params)
        templates = cur.fetchall()

        all_teachers = {}

        for tmpl in templates:
            tmpl_id      = tmpl["id"]
            dept_name    = tmpl["dept_name"] or ""
            acad_year    = tmpl["academic_year"]

            cur.execute(
                "SELECT id, row_data FROM excel_rows WHERE template_id = %s",
                (tmpl_id,)
            )
            rows = cur.fetchall()

            parsed = _parse_rows(rows, dept_name, acad_year)

            for name, t in parsed.items():
                if name in all_teachers:
                    ex = all_teachers[name]
                    ex["total_hours"]           += t["total_hours"]
                    ex["lecture_hours"]          += t["lecture_hours"]
                    ex["practice_hours"]         += t["practice_hours"]
                    ex["mooc_hours"]             += t["mooc_hours"]
                    ex["other_hours"]            += t["other_hours"]
                    ex["scientific_hours"]       += t["scientific_hours"]
                    ex["teaching_auditory"]      += t["teaching_auditory"]
                    ex["teaching_extraauditory"] += t["teaching_extraauditory"]
                    ex["total"]                  += t["total"]
                    ex["disciplines_count"]      += t["disciplines_count"]
                else:
                    all_teachers[name] = t

        cur.close()
        conn.close()

        result = sorted(all_teachers.values(), key=lambda x: x["total"], reverse=True)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────
# GET /analysis/years
# ──────────────────────────────────────────────────────────

@router.get("/years")
async def get_years():
    try:
        conn = get_connection()
        cur  = conn.cursor()
        cur.execute(
            "SELECT DISTINCT academic_year FROM excel_templates WHERE status='parsed' ORDER BY academic_year DESC"
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [r["academic_year"] for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────
# GET /analysis/departments
# ──────────────────────────────────────────────────────────

@router.get("/departments")
async def get_departments():
    try:
        conn = get_connection()
        cur  = conn.cursor()
        cur.execute("SELECT id, name FROM departments ORDER BY name")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r["id"], "name": r["name"]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))