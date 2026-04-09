from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from backend.app.database import get_connection
from backend.app.utils.form63_generator import (
    build_form63_rows_from_preview,
    export_form63_from_template,
    export_form63_simple_xlsx,
)

router = APIRouter(prefix="/form63", tags=["Form63"])


def _to_num(value):
    if value is None:
        return 0.0
    try:
        return float(value)
    except Exception:
        return 0.0


def _detect_semester(row_data: dict):
    sem1 = row_data.get("1 семестр")
    sem2 = row_data.get("2 семестр")

    if sem1 not in (None, "", 0):
        return 1
    if sem2 not in (None, "", 0):
        return 2
    return None


def _discipline_text(row_data: dict) -> str:
    return str(row_data.get("Дисциплина") or "").strip().lower()


def _activity_text(row_data: dict) -> str:
    return str(row_data.get("вид занятии") or "").strip().lower()


def _payment_text(row_data: dict) -> str:
    return str(row_data.get("Форма оплаты") or "").strip().lower()


def _classify_form63_row(row_data: dict) -> str:
    discipline = _discipline_text(row_data)
    activity = _activity_text(row_data)
    payment = _payment_text(row_data)

    staff_hours = _to_num(row_data.get("Штатная нагрузка"))
    hourly_hours = _to_num(row_data.get("Почасовая нагрузка"))

    if (
        "практика" in discipline
        or "научно-исследовательская" in discipline
        or "диссертац" in discipline
        or "диплом" in discipline
        or "руководство" in discipline
    ):
        return "staff_extraauditory"

    if "почас" in payment and activity in {"лек", "лаб/пра", "моок-0"}:
        return "hourly_auditory"

    if activity in {"лек", "лаб/пра", "моок-0"} and payment == "штат":
        return "staff_auditory"

    # МООК-0 с пустой оплатой и одинаковыми staff/hourly считаем как штатную аудиторную
    if (
        not payment
        and activity in {"лек", "лаб/пра", "моок-0"}
        and staff_hours > 0
        and hourly_hours > 0
        and staff_hours == hourly_hours
    ):
        return "staff_auditory"

    return "other"


def _build_form63_preview_rows(excel_template_id: int) -> list[dict]:
    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT row_number, row_data
            FROM excel_rows
            WHERE template_id = %s
            ORDER BY row_number
        """, (excel_template_id,))
        rows = cur.fetchall()

        grouped = {}

        for row in rows:
            row_number, row_data = row

            teacher_name = row_data.get("ФИО ППС")
            position = row_data.get("Должность")
            semester = _detect_semester(row_data)

            if not teacher_name or semester is None:
                continue

            key = (teacher_name, position, semester)

            if key not in grouped:
                grouped[key] = {
                    "teacher_name": teacher_name,
                    "position": position,
                    "semester": semester,
                    "teaching_auditory_hours": 0.0,
                    "teaching_extraauditory_hours": 0.0,
                    "methodical_hours": 0.0,
                    "research_hours": 0.0,
                    "organizational_methodical_hours": 0.0,
                    "educational_hours": 0.0,
                    "qualification_hours": 0.0,
                    "social_hours": 0.0,
                    "hourly_auditory_hours": 0.0,
                }

            category = _classify_form63_row(row_data)
            staff_hours = _to_num(row_data.get("Штатная нагрузка"))
            hourly_hours = _to_num(row_data.get("Почасовая нагрузка"))

            if category == "staff_auditory":
                grouped[key]["teaching_auditory_hours"] += staff_hours
            elif category == "staff_extraauditory":
                grouped[key]["teaching_extraauditory_hours"] += staff_hours
            elif category == "hourly_auditory":
                grouped[key]["hourly_auditory_hours"] += hourly_hours

        items = list(grouped.values())
        items.sort(key=lambda x: (x["teacher_name"], x["semester"]))

        for item in items:
            item["planned_total_hours"] = (
                item["teaching_auditory_hours"]
                + item["teaching_extraauditory_hours"]
                + item["methodical_hours"]
                + item["research_hours"]
                + item["organizational_methodical_hours"]
                + item["educational_hours"]
                + item["qualification_hours"]
                + item["social_hours"]
            )

        return items

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/preview")
def form63_preview(excel_template_id: int):
    try:
        items = _build_form63_preview_rows(excel_template_id)
        return {
            "status": "ok",
            "excel_template_id": excel_template_id,
            "count": len(items),
            "items": items,
        }
    except Exception as e:
        return {
            "status": "error",
            "detail": str(e),
        }


@router.get("/export-simple")
def form63_export_simple(excel_template_id: int):
    try:
        items = _build_form63_preview_rows(excel_template_id)
        form63_rows = build_form63_rows_from_preview(items)

        output_dir = Path("backend/generated/form63")
        output_dir.mkdir(parents=True, exist_ok=True)

        output_path = output_dir / f"form63_simple_template_{excel_template_id}.xlsx"
        export_form63_simple_xlsx(form63_rows, str(output_path))

        return FileResponse(
            path=str(output_path),
            filename=output_path.name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as e:
        return {
            "status": "error",
            "detail": str(e),
        }


@router.get("/export-template")
def form63_export_template(excel_template_id: int):
    try:
        items = _build_form63_preview_rows(excel_template_id)
        form63_rows = build_form63_rows_from_preview(items)

        template_path = "backend/app/templates/form63_template.xlsx"
        output_dir = Path("backend/generated/form63")
        output_dir.mkdir(parents=True, exist_ok=True)

        output_path = output_dir / f"form63_template_{excel_template_id}.xlsx"

        export_form63_from_template(
            rows=form63_rows,
            template_path=template_path,
            output_path=str(output_path),
        )

        return FileResponse(
            path=str(output_path),
            filename=output_path.name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as e:
        return {
            "status": "error",
            "detail": str(e),
        }