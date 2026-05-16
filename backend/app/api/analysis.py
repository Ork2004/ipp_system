from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.app.database import get_connection

router = APIRouter(prefix="/analysis", tags=["analysis"])

# ──────────────────────────────────────────────────────────
# Ключи в row_data (русские названия колонок из Excel)
# ──────────────────────────────────────────────────────────
KEY_TEACHER  = "ФИО ППС"
KEY_POSITION = "Должность"
KEY_KIND     = "вид занятии"
KEY_TOTAL    = "Итого"
KEY_DISC     = "Дисциплина"

LECTURE_KINDS  = {"лек", "лек."}
PRACTICE_KINDS = {"лаб/пра", "лаб", "пра", "практ", "практика"}
MOOC_KINDS     = {"моок", "моок-0", "моок-1"}


def _safe_float(val) -> float:
    try:
        return float(val or 0)
    except (TypeError, ValueError):
        return 0.0


def _parse_rows(rows, dept_name: str, academic_year: str) -> dict:
    buckets = defaultdict(lambda: {
        "total": 0.0, "lecture": 0.0, "practice": 0.0,
        "mooc": 0.0, "other": 0.0,
        "position": None, "disciplines": set(), "row_id": None,
    })

    for row in rows:
        row_id = row[0]
        rd     = row[1]  # dict с русскими ключами

        if not isinstance(rd, dict):
            continue

        name = str(rd.get(KEY_TEACHER) or "").strip()
        if not name:
            continue

        kind  = str(rd.get(KEY_KIND) or "").strip().lower()
        hours = _safe_float(rd.get(KEY_TOTAL))
        pos   = str(rd.get(KEY_POSITION) or "").strip() or None
        disc  = str(rd.get(KEY_DISC) or "").strip()

        b = buckets[name]
        b["total"]   += hours
        b["position"] = b["position"] or pos
        b["row_id"]   = b["row_id"] or row_id
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
            "scientific_hours": round(b["mooc"], 2),
            "teaching_auditory": round(b["lecture"], 2),
            "teaching_extraauditory": round(b["practice"], 2),
            "total": round(b["total"], 2),
            "disciplines_count": len(b["disciplines"]),
        }
    return result


@router.get("")
async def get_analysis(
    academic_year: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
):
    try:
        conn = get_connection()
        cur  = conn.cursor()

        q = """
            SELECT et.id, et.academic_year, d.name
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
            tmpl_id   = tmpl[0]
            acad_year = tmpl[1]
            dept_name = tmpl[2] or ""

            cur.execute(
                "SELECT id, row_data FROM excel_rows WHERE template_id = %s",
                (tmpl_id,)
            )
            rows = cur.fetchall()
            parsed = _parse_rows(rows, dept_name, acad_year)

            for name, t in parsed.items():
                if name in all_teachers:
                    ex = all_teachers[name]
                    for key in ["total_hours", "lecture_hours", "practice_hours",
                                "mooc_hours", "other_hours", "scientific_hours",
                                "teaching_auditory", "teaching_extraauditory",
                                "total", "disciplines_count"]:
                        ex[key] += t[key]
                else:
                    all_teachers[name] = t

        cur.close()
        conn.close()

        return sorted(all_teachers.values(), key=lambda x: x["total"], reverse=True)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/years")
async def get_years():
    try:
        conn = get_connection()
        cur  = conn.cursor()
        cur.execute(
            "SELECT DISTINCT academic_year FROM excel_templates WHERE status = 'parsed' ORDER BY academic_year DESC"
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [r[0] for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/departments")
async def get_departments():
    try:
        conn = get_connection()
        cur  = conn.cursor()
        cur.execute("SELECT id, name FROM departments ORDER BY name")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "name": r[1]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))