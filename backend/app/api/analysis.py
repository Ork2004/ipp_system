"""
backend/app/api/analysis.py

Эндпоинт для страницы "Анализ нагрузки".
Данные берём из excel_rows (row_data JSONB) + form63_templates (column_mapping).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db  # поправь если путь другой

router = APIRouter(prefix="/analysis", tags=["analysis"])


# ─────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────

class TeacherLoad(BaseModel):
    id: int
    teacher_name: str
    department: Optional[str] = None
    position: Optional[str] = None
    academic_year: Optional[str] = None

    scientific_hours: float = 0       # research (научные)
    teaching_auditory: float = 0      # teaching_auditory (аудиторные)
    teaching_extraauditory: float = 0 # teaching_extraauditory (внеаудиторные)

    methodical: float = 0
    organizational_methodical: float = 0
    educational: float = 0
    qualification: float = 0
    social: float = 0
    total: float = 0


class StatsResponse(BaseModel):
    total_teachers: int
    total_scientific: float
    total_teaching: float
    total_all: float
    departments_count: int


# ─────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────

def _safe_float(val) -> float:
    """Безопасно конвертируем любое значение в float."""
    try:
        return float(val or 0)
    except (TypeError, ValueError):
        return 0.0


def _extract_hours(row_data: dict, col_map: dict, key: str) -> float:
    """
    Вытаскиваем значение из row_data по букве колонки из column_mapping.
    row_data хранит данные по буквам Excel ({"D": "Иванов", "K": "120", ...})
    """
    col_letter = col_map.get(key)
    if not col_letter:
        return 0.0
    return _safe_float(row_data.get(col_letter))


# ─────────────────────────────────────────
# GET /analysis  — список преподавателей с нагрузкой
# ─────────────────────────────────────────

@router.get("", response_model=List[TeacherLoad])
async def get_analysis(
    academic_year: Optional[str] = Query(None, description="Фильтр по учебному году, напр. 2024-2025"),
    department_id: Optional[int] = Query(None, description="Фильтр по кафедре"),
    db: Session = Depends(get_db),
):
    """
    Возвращает нагрузку всех преподавателей.
    Читает excel_rows.row_data через column_mapping из form63_templates.
    """

    # Получаем все form63_templates (с фильтрами)
    tmpl_query = "SELECT id, department_id, academic_year, column_mapping FROM form63_templates WHERE status = 'parsed'"
    params = {}

    if academic_year:
        tmpl_query += " AND academic_year = :academic_year"
        params["academic_year"] = academic_year
    if department_id:
        tmpl_query += " AND department_id = :department_id"
        params["department_id"] = department_id

    templates = db.execute(text(tmpl_query), params).fetchall()

    if not templates:
        return []

    result: List[TeacherLoad] = []
    seen_ids = set()

    for tmpl in templates:
        col_map: dict = tmpl.column_mapping or {}

        # Колонка с именем преподавателя
        name_col = col_map.get("teacher_name", "D")

        # Получаем строки Excel для этого шаблона + имя кафедры
        rows = db.execute(text("""
            SELECT
                er.id,
                er.teacher_id,
                er.row_data,
                d.name AS department_name
            FROM excel_rows er
            JOIN excel_templates et ON et.id = er.template_id
            LEFT JOIN departments d ON d.id = et.department_id
            WHERE er.template_id IN (
                SELECT et2.id FROM excel_templates et2
                WHERE et2.department_id = :dept_id
                  AND et2.academic_year = :year
            )
        """), {
            "dept_id": tmpl.department_id,
            "year": tmpl.academic_year,
        }).fetchall()

        for row in rows:
            row_data: dict = row.row_data or {}

            teacher_name = str(row_data.get(name_col, "")).strip()
            if not teacher_name:
                continue

            # Уникальный ключ чтобы не дублировать
            uid = row.teacher_id or f"{tmpl.department_id}_{teacher_name}"
            if uid in seen_ids:
                continue
            seen_ids.add(uid)

            scientific   = _extract_hours(row_data, col_map, "research")
            auditory     = _extract_hours(row_data, col_map, "teaching_auditory")
            extraaud     = _extract_hours(row_data, col_map, "teaching_extraauditory")
            methodical   = _extract_hours(row_data, col_map, "methodical")
            org_meth     = _extract_hours(row_data, col_map, "organizational_methodical")
            educational  = _extract_hours(row_data, col_map, "educational")
            qualification= _extract_hours(row_data, col_map, "qualification")
            social       = _extract_hours(row_data, col_map, "social")
            total        = _extract_hours(row_data, col_map, "total")

            # Если total не записан — считаем сами
            if total == 0:
                total = scientific + auditory + extraaud + methodical + org_meth + educational + qualification + social

            result.append(TeacherLoad(
                id=row.id,
                teacher_name=teacher_name,
                department=row.department_name,
                academic_year=tmpl.academic_year,
                scientific_hours=scientific,
                teaching_auditory=auditory,
                teaching_extraauditory=extraaud,
                methodical=methodical,
                organizational_methodical=org_meth,
                educational=educational,
                qualification=qualification,
                social=social,
                total=total,
            ))

    # Сортируем по убыванию total
    result.sort(key=lambda x: x.total, reverse=True)
    return result


# ─────────────────────────────────────────
# GET /analysis/stats  — агрегированная статистика
# ─────────────────────────────────────────

@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    academic_year: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    teachers = await get_analysis(academic_year=academic_year, department_id=department_id, db=db)

    depts = {t.department for t in teachers if t.department}

    return StatsResponse(
        total_teachers=len(teachers),
        total_scientific=sum(t.scientific_hours for t in teachers),
        total_teaching=sum(t.teaching_auditory + t.teaching_extraauditory for t in teachers),
        total_all=sum(t.total for t in teachers),
        departments_count=len(depts),
    )


# ─────────────────────────────────────────
# GET /analysis/years  — список доступных учебных годов
# ─────────────────────────────────────────

@router.get("/years")
async def get_years(db: Session = Depends(get_db)):
    rows = db.execute(text(
        "SELECT DISTINCT academic_year FROM form63_templates WHERE status='parsed' ORDER BY academic_year DESC"
    )).fetchall()
    return [r.academic_year for r in rows]


# ─────────────────────────────────────────
# GET /analysis/departments  — список кафедр
# ─────────────────────────────────────────

@router.get("/departments")
async def get_departments(db: Session = Depends(get_db)):
    rows = db.execute(text(
        "SELECT id, name FROM departments ORDER BY name"
    )).fetchall()
    return [{"id": r.id, "name": r.name} for r in rows]