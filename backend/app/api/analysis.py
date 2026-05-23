from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.app.database import get_connection
from fastapi.responses import FileResponse

from backend.app.config import GENERATED_DIR
from backend.app.database import get_connection
from backend.app.utils.storage import safe_resolve_in_dir
from backend.app.utils.teacher_report_generator import generate_summary_report_docx, generate_teacher_report_docx

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


def _load_templates(cur, academic_year: Optional[str], department_id: Optional[int]):
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
    return cur.fetchall()


def _load_analysis_data(cur, academic_year: Optional[str], department_id: Optional[int]) -> tuple[list[dict], dict]:
    templates = _load_templates(cur, academic_year, department_id)
    all_teachers = {}
    rows_count = 0
    departments = set()
    template_years = set()

    for tmpl in templates:
        tmpl_id = tmpl[0]
        acad_year = tmpl[1]
        dept_name = tmpl[2] or ""

        if dept_name:
            departments.add(dept_name)
        if acad_year:
            template_years.add(acad_year)

        cur.execute(
            "SELECT id, row_data FROM excel_rows WHERE template_id = %s",
            (tmpl_id,)
        )
        rows = cur.fetchall()
        rows_count += len(rows)
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

    teachers = sorted(all_teachers.values(), key=lambda x: x["total"], reverse=True)
    meta = {
        "excel_templates_count": len(templates),
        "excel_rows_count": rows_count,
        "departments": sorted(departments),
        "template_years": sorted(template_years, reverse=True),
    }
    return teachers, meta


def _count_raw_templates(cur, academic_year: Optional[str], department_id: Optional[int]) -> int:
    q = "SELECT COUNT(*) FROM raw_docx_templates WHERE 1=1"
    params = []
    if academic_year:
        q += " AND academic_year = %s"
        params.append(academic_year)
    if department_id:
        q += " AND department_id = %s"
        params.append(department_id)

    cur.execute(q, params)
    return int(cur.fetchone()[0] or 0)


def _count_generated_files(cur, academic_year: Optional[str], department_id: Optional[int]) -> int:
    q = "SELECT COUNT(*) FROM generated_files WHERE 1=1"
    params = []
    if academic_year:
        q += " AND academic_year = %s"
        params.append(academic_year)
    if department_id:
        q += " AND department_id = %s"
        params.append(department_id)

    cur.execute(q, params)
    return int(cur.fetchone()[0] or 0)


def _round_hours(value: float) -> float:
    return round(float(value or 0), 2)


def _build_report_summary(teachers: list[dict], meta: dict, raw_templates_count: int, generated_files_count: int, academic_year: Optional[str], department_id: Optional[int]) -> dict:
    total_hours = _round_hours(sum(t.get("total") or 0 for t in teachers))
    scientific_hours = _round_hours(sum(t.get("scientific_hours") or 0 for t in teachers))
    teaching_hours = _round_hours(
        sum((t.get("teaching_auditory") or 0) + (t.get("teaching_extraauditory") or 0) for t in teachers)
    )
    other_hours = _round_hours(max(total_hours - scientific_hours - teaching_hours, 0))
    teachers_count = len(teachers)
    average_load = _round_hours(total_hours / teachers_count) if teachers_count else 0

    top_teachers = []
    for item in teachers[:5]:
        teaching = _round_hours((item.get("teaching_auditory") or 0) + (item.get("teaching_extraauditory") or 0))
        top_teachers.append({
            "teacher_name": item.get("teacher_name") or "",
            "department": item.get("department") or "",
            "total_hours": _round_hours(item.get("total") or 0),
            "teaching_hours": teaching,
            "scientific_hours": _round_hours(item.get("scientific_hours") or 0),
            "disciplines_count": int(item.get("disciplines_count") or 0),
        })

    return {
        "title": "Легкий сводный отчет по нагрузке",
        "academic_year": academic_year or "Все годы",
        "department_id": department_id,
        "departments": meta.get("departments") or [],
        "template_years": meta.get("template_years") or [],
        "teachers_count": teachers_count,
        "total_hours": total_hours,
        "teaching_hours": teaching_hours,
        "scientific_hours": scientific_hours,
        "other_hours": other_hours,
        "average_load": average_load,
        "excel_templates_count": int(meta.get("excel_templates_count") or 0),
        "excel_rows_count": int(meta.get("excel_rows_count") or 0),
        "raw_templates_count": raw_templates_count,
        "generated_files_count": generated_files_count,
        "top_teachers": top_teachers,
        "implementation": [
            "Report реализован как аналитическая сводка на основе загруженной Excel-нагрузки.",
            "Сводка использует текущие данные преподавателей, кафедры, учебного года и истории генерации.",
            "На этом этапе отчет показывает покрытие данными, распределение часов и топ преподавателей без полного DOCX годового отчета.",
        ],
        "development": [
            "Дальше report можно связать с нужной кафедральной формой.",
            "После привязки формы система сможет автоматически заполнять годовой отчет преподавателя и выгружать его в DOCX/PDF.",
        ],
    }


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
        teachers, _ = _load_analysis_data(cur, academic_year, department_id)

        cur.close()
        conn.close()

        return sorted(all_teachers.values(), key=lambda x: x["total"], reverse=True)
        return teachers

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/report-summary")
async def get_report_summary(
    academic_year: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
):
    try:
        conn = get_connection()
        cur = conn.cursor()

        teachers, meta = _load_analysis_data(cur, academic_year, department_id)
        raw_templates_count = _count_raw_templates(cur, academic_year, department_id)
        generated_files_count = _count_generated_files(cur, academic_year, department_id)

        cur.close()
        conn.close()

        return _build_report_summary(
            teachers=teachers,
            meta=meta,
            raw_templates_count=raw_templates_count,
            generated_files_count=generated_files_count,
            academic_year=academic_year,
            department_id=department_id,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/teacher-report/download")
async def download_teacher_report(
    teacher_name: str = Query(...),
    academic_year: str = Query(...),
    department_id: Optional[int] = Query(None),
):
    try:
        output_path = generate_teacher_report_docx(
            teacher_name=teacher_name,
            academic_year=academic_year,
            department_id=department_id,
        )
        file_path = safe_resolve_in_dir(output_path, GENERATED_DIR)
        return FileResponse(
            str(file_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=file_path.name,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/summary-report/download")
async def download_summary_report(
    academic_year: str = Query(...),
    department_id: Optional[int] = Query(None),
):
    try:
        output_path = generate_summary_report_docx(
            academic_year=academic_year,
            department_id=department_id,
        )
        file_path = safe_resolve_in_dir(output_path, GENERATED_DIR)
        return FileResponse(
            str(file_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=file_path.name,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))
