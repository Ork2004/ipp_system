"""
backend/app/api/analysis.py

Страница "Анализ нагрузки".

Структура Excel (строка 7 — заголовки, данные с строки 8):
  [24] ФИО ППС
  [25] Должность
  [16] Итого          — часы по строке (суммируем по преподавателю)
  [29] Штатная нагрузка
  [30] Почасовая нагрузка
  [1]  вид занятии    — лек / лаб/пра / МООК-0 / ...

Данные хранятся в excel_rows.row_data как JSONB.
Ключи в row_data — это буквы колонок Excel (A, B, C...) или
порядковые индексы в зависимости от того, как парсит ваш excel_api.

Мы читаем напрямую через column_schema из excel_templates,
либо fallback — по позиционным ключам.
"""

from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db  # поправь путь если нужно

router = APIRouter(prefix="/analysis", tags=["analysis"])

# ──────────────────────────────────────────────────────────
# Индексы колонок в Excel (строка 7 = заголовки)
# Используем как fallback если column_schema не задана
# ──────────────────────────────────────────────────────────
COL_IDX = {
    "teacher_name": 24,   # ФИО ППС
    "position":     25,   # Должность
    "kind":          1,   # вид занятии
    "total":        16,   # Итого
    "staff_hours":  29,   # Штатная нагрузка
    "hourly":       30,   # Почасовая нагрузка
    "sem1":         12,   # 1 семестр
    "sem2":         13,   # 2 семестр
}

# Виды занятий → категории
LECTURE_KINDS  = {"лек", "лек."}
PRACTICE_KINDS = {"лаб/пра", "лаб", "пра", "практ", "практика"}
MOOC_KINDS     = {"моок", "моок-0", "моок-1"}


# ──────────────────────────────────────────────────────────
# Pydantic schemas
# ──────────────────────────────────────────────────────────

class TeacherLoad(BaseModel):
    id: int
    teacher_name: str
    position: Optional[str] = None
    department: Optional[str] = None
    academic_year: Optional[str] = None

    # основные часы
    total_hours: float = 0          # сумма "Итого" по всем строкам
    lecture_hours: float = 0        # лекции
    practice_hours: float = 0       # лаб/пра
    mooc_hours: float = 0           # МООК
    other_hours: float = 0          # прочее

    # для совместимости с уже готовым фронтом
    scientific_hours: float = 0       # = mooc_hours (условно)
    teaching_auditory: float = 0      # = lecture_hours
    teaching_extraauditory: float = 0 # = practice_hours
    total: float = 0                  # = total_hours

    disciplines_count: int = 0


# ──────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────

def _safe_float(val) -> float:
    try:
        return float(val or 0)
    except (TypeError, ValueError):
        return 0.0


def _get_by_idx(row_data: dict, idx: int):
    """
    row_data может хранить ключи как:
      - строковые буквы Excel:  {"A": ..., "Y": ...}
      - строковые числа:        {"0": ..., "24": ...}
      - целые числа:            {0: ..., 24: ...}
    Пробуем все варианты.
    """
    # попытка по целому
    if idx in row_data:
        return row_data[idx]
    # попытка по строке
    if str(idx) in row_data:
        return row_data[str(idx)]
    # попытка по букве Excel (A=0, B=1 ... Z=25, AA=26 ...)
    letter = _idx_to_col(idx)
    if letter in row_data:
        return row_data[letter]
    return None


def _idx_to_col(n: int) -> str:
    """0→A, 1→B, 25→Z, 26→AA, ..."""
    result = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        result = chr(65 + r) + result
    return result


def _parse_teachers(rows, department_name: str, academic_year: str) -> dict:
    """
    Группируем строки по ФИО, суммируем часы.
    Возвращает dict: teacher_name → TeacherLoad
    """
    buckets: dict[str, dict] = defaultdict(lambda: {
        "total": 0.0,
        "lecture": 0.0,
        "practice": 0.0,
        "mooc": 0.0,
        "other": 0.0,
        "position": None,
        "disciplines": set(),
        "row_id": None,
    })

    for row in rows:
        rd: dict = row.row_data or {}

        name = str(_get_by_idx(rd, COL_IDX["teacher_name"]) or "").strip()
        if not name:
            continue

        kind_raw = str(_get_by_idx(rd, COL_IDX["kind"]) or "").strip().lower()
        hours     = _safe_float(_get_by_idx(rd, COL_IDX["total"]))
        position  = str(_get_by_idx(rd, COL_IDX["position"]) or "").strip() or None
        # дисциплина — индекс 3
        discipline = str(_get_by_idx(rd, 3) or "").strip()

        b = buckets[name]
        b["total"] += hours
        b["position"] = b["position"] or position
        if discipline:
            b["disciplines"].add(discipline)
        if b["row_id"] is None:
            b["row_id"] = row.id

        if kind_raw in LECTURE_KINDS:
            b["lecture"] += hours
        elif kind_raw in PRACTICE_KINDS:
            b["practice"] += hours
        elif kind_raw in MOOC_KINDS:
            b["mooc"] += hours
        else:
            b["other"] += hours

    result = {}
    for name, b in buckets.items():
        result[name] = TeacherLoad(
            id=b["row_id"] or 0,
            teacher_name=name,
            position=b["position"],
            department=department_name,
            academic_year=academic_year,
            total_hours=round(b["total"], 2),
            lecture_hours=round(b["lecture"], 2),
            practice_hours=round(b["practice"], 2),
            mooc_hours=round(b["mooc"], 2),
            other_hours=round(b["other"], 2),
            # алиасы для фронта
            scientific_hours=round(b["mooc"], 2),
            teaching_auditory=round(b["lecture"], 2),
            teaching_extraauditory=round(b["practice"], 2),
            total=round(b["total"], 2),
            disciplines_count=len(b["disciplines"]),
        )
    return result


# ──────────────────────────────────────────────────────────
# GET /analysis
# ──────────────────────────────────────────────────────────

@router.get("", response_model=List[TeacherLoad])
async def get_analysis(
    academic_year: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Список преподавателей с суммарной нагрузкой.
    Читает excel_rows.row_data, группирует по ФИО ППС.
    """
    # Получаем excel_templates
    tmpl_q = """
        SELECT et.id, et.academic_year, et.department_id, d.name AS dept_name
        FROM excel_templates et
        LEFT JOIN departments d ON d.id = et.department_id
        WHERE et.status = 'parsed'
    """
    params = {}
    if academic_year:
        tmpl_q += " AND et.academic_year = :academic_year"
        params["academic_year"] = academic_year
    if department_id:
        tmpl_q += " AND et.department_id = :department_id"
        params["department_id"] = department_id

    templates = db.execute(text(tmpl_q), params).fetchall()
    if not templates:
        return []

    all_teachers: dict[str, TeacherLoad] = {}

    for tmpl in templates:
        rows = db.execute(
            text("SELECT id, row_data FROM excel_rows WHERE template_id = :tid"),
            {"tid": tmpl.id},
        ).fetchall()

        parsed = _parse_teachers(rows, tmpl.dept_name, tmpl.academic_year)

        for name, t in parsed.items():
            if name in all_teachers:
                # суммируем если один препод в нескольких шаблонах
                existing = all_teachers[name]
                all_teachers[name] = TeacherLoad(
                    id=existing.id,
                    teacher_name=name,
                    position=existing.position or t.position,
                    department=existing.department or t.department,
                    academic_year=existing.academic_year,
                    total_hours=existing.total_hours + t.total_hours,
                    lecture_hours=existing.lecture_hours + t.lecture_hours,
                    practice_hours=existing.practice_hours + t.practice_hours,
                    mooc_hours=existing.mooc_hours + t.mooc_hours,
                    other_hours=existing.other_hours + t.other_hours,
                    scientific_hours=existing.scientific_hours + t.scientific_hours,
                    teaching_auditory=existing.teaching_auditory + t.teaching_auditory,
                    teaching_extraauditory=existing.teaching_extraauditory + t.teaching_extraauditory,
                    total=existing.total + t.total,
                    disciplines_count=existing.disciplines_count + t.disciplines_count,
                )
            else:
                all_teachers[name] = t

    result = sorted(all_teachers.values(), key=lambda x: x.total, reverse=True)
    return result


# ──────────────────────────────────────────────────────────
# GET /analysis/stats
# ──────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    academic_year: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    teachers = await get_analysis(academic_year=academic_year, department_id=department_id, db=db)
    depts = {t.department for t in teachers if t.department}

    return {
        "total_teachers": len(teachers),
        "total_scientific": sum(t.scientific_hours for t in teachers),
        "total_teaching": sum(t.teaching_auditory + t.teaching_extraauditory for t in teachers),
        "total_all": sum(t.total for t in teachers),
        "departments_count": len(depts),
    }


# ──────────────────────────────────────────────────────────
# GET /analysis/years
# ──────────────────────────────────────────────────────────

@router.get("/years")
async def get_years(db: Session = Depends(get_db)):
    rows = db.execute(text(
        "SELECT DISTINCT academic_year FROM excel_templates WHERE status='parsed' ORDER BY academic_year DESC"
    )).fetchall()
    return [r.academic_year for r in rows]


# ──────────────────────────────────────────────────────────
# GET /analysis/departments
# ──────────────────────────────────────────────────────────

@router.get("/departments")
async def get_departments(db: Session = Depends(get_db)):
    rows = db.execute(text(
        "SELECT id, name FROM departments ORDER BY name"
    )).fetchall()
    return [{"id": r.id, "name": r.name} for r in rows]