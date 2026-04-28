import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.app.api.auth_api import require_roles
from backend.app.config import FORM63_DIR
from backend.app.database import get_connection
from backend.app.utils.form63_generator import (
    build_form63_rows_from_preview,
    export_form63_from_template,
    export_form63_simple_xlsx,
)
from backend.app.utils.form63_template_parser import (
    REQUIRED_CATEGORIES,
    missing_required,
    parse_form63_template,
)
from backend.app.utils.storage import safe_resolve_in_dir, save_upload_file

router = APIRouter(prefix="/form63", tags=["Form63"])


# ---------- helpers ----------

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


def _load_form63_template(form63_template_id: int) -> dict:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, department_id, academic_year, file_path,
                       source_filename, column_mapping, data_start_row
                FROM form63_templates
                WHERE id = %s
            """, (form63_template_id,))
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Form 63 шаблон не найден")
        return {
            "id": row[0],
            "department_id": row[1],
            "academic_year": row[2],
            "file_path": row[3],
            "source_filename": row[4],
            "column_mapping": row[5],
            "data_start_row": row[6],
        }
    finally:
        conn.close()


# ---------- preview ----------

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


# ---------- form63 templates: upload / list / delete / mapping ----------

@router.post("/templates")
def upload_form63_template(
    department_id: int = Form(...),
    academic_year: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(require_roles("admin")),
):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(
            status_code=403,
            detail="department_id должен совпадать с кафедрой админа",
        )

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id FROM form63_templates
                WHERE department_id = %s AND academic_year = %s
            """, (department_id, academic_year))
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="На этот учебный год уже загружен шаблон Формы 63. "
                           "Удалите его в списке и загрузите новый.",
                )
    finally:
        conn.close()

    saved_path = save_upload_file(file, FORM63_DIR, allowed_exts={".xlsx"})

    try:
        parsed = parse_form63_template(saved_path)
    except Exception as e:
        Path(saved_path).unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=f"Не удалось распарсить шаблон: {e}",
        )

    column_mapping = parsed["column_mapping"]
    data_start_row = parsed["data_start_row"]
    detection_meta = parsed["detection_meta"]

    missing = missing_required(column_mapping)
    if missing:
        Path(saved_path).unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=(
                "Шаблон не похож на Форму 63: отсутствуют обязательные колонки "
                f"{missing}. Проверьте загруженный файл."
            ),
        )

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO form63_templates (
                        department_id, academic_year,
                        file_path, source_filename,
                        column_mapping, data_start_row,
                        detection_meta, status
                    )
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, 'parsed')
                    RETURNING id
                    """,
                    (
                        department_id,
                        academic_year,
                        saved_path,
                        file.filename,
                        json.dumps(column_mapping),
                        data_start_row,
                        json.dumps(detection_meta, ensure_ascii=False),
                    ),
                )
                form63_template_id = cur.fetchone()[0]
    finally:
        conn.close()

    return {
        "status": "ok",
        "id": form63_template_id,
        "department_id": department_id,
        "academic_year": academic_year,
        "source_filename": file.filename,
        "saved_path": saved_path,
        "column_mapping": column_mapping,
        "data_start_row": data_start_row,
        "detection_meta": detection_meta,
        "required_categories": list(REQUIRED_CATEGORIES),
    }


@router.get("/templates")
def list_form63_templates(department_id: int, user=Depends(require_roles("admin"))):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, academic_year, source_filename, file_path,
                       column_mapping, data_start_row, status, created_at
                FROM form63_templates
                WHERE department_id = %s
                ORDER BY academic_year DESC, created_at DESC
            """, (department_id,))
            rows = cur.fetchall()
        return [
            {
                "id": r[0],
                "academic_year": r[1],
                "source_filename": r[2],
                "file_path": r[3],
                "column_mapping": r[4],
                "data_start_row": r[5],
                "status": r[6],
                "created_at": r[7],
            }
            for r in rows
        ]
    finally:
        conn.close()


@router.get("/templates/{form63_template_id}")
def get_form63_template(
    form63_template_id: int,
    user=Depends(require_roles("admin")),
):
    admin_dep = user.get("department_id")
    tpl = _load_form63_template(form63_template_id)
    if not admin_dep or int(tpl["department_id"]) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")
    return tpl


@router.delete("/templates/{form63_template_id}")
def delete_form63_template(
    form63_template_id: int,
    user=Depends(require_roles("admin")),
):
    admin_dep = user.get("department_id")
    tpl = _load_form63_template(form63_template_id)
    if not admin_dep or int(tpl["department_id"]) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя удалять чужую кафедру")

    file_path = tpl["file_path"]
    deleted_file = False
    if file_path:
        try:
            p = safe_resolve_in_dir(file_path, FORM63_DIR)
            if p.exists() and p.is_file():
                p.unlink()
                deleted_file = True
        except Exception:
            deleted_file = False

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM form63_templates WHERE id = %s",
                    (form63_template_id,),
                )
    finally:
        conn.close()

    return {"status": "ok", "deleted_file": deleted_file}


@router.put("/templates/{form63_template_id}/mapping")
def update_form63_template_mapping(
    form63_template_id: int,
    payload: dict,
    user=Depends(require_roles("admin")),
):
    admin_dep = user.get("department_id")
    tpl = _load_form63_template(form63_template_id)
    if not admin_dep or int(tpl["department_id"]) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя править чужую кафедру")

    column_mapping = payload.get("column_mapping")
    data_start_row = payload.get("data_start_row")

    if not isinstance(column_mapping, dict) or not column_mapping:
        raise HTTPException(status_code=400, detail="column_mapping обязателен")
    if not isinstance(data_start_row, int) or data_start_row < 1:
        raise HTTPException(status_code=400, detail="data_start_row должен быть положительным")

    missing = missing_required(column_mapping)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"В маппинге не хватает обязательных колонок: {missing}",
        )

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE form63_templates
                    SET column_mapping = %s::jsonb,
                        data_start_row = %s
                    WHERE id = %s
                    """,
                    (
                        json.dumps(column_mapping),
                        data_start_row,
                        form63_template_id,
                    ),
                )
    finally:
        conn.close()

    return {"status": "ok"}


# ---------- export ----------

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
def form63_export_template(
    excel_template_id: int,
    form63_template_id: int,
):
    try:
        tpl = _load_form63_template(form63_template_id)
        items = _build_form63_preview_rows(excel_template_id)
        form63_rows = build_form63_rows_from_preview(items)

        output_dir = Path("backend/generated/form63")
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = (
            output_dir
            / f"form63_excel_{excel_template_id}_tpl_{form63_template_id}.xlsx"
        )

        export_form63_from_template(
            rows=form63_rows,
            template_path=tpl["file_path"],
            output_path=str(output_path),
            column_mapping=tpl["column_mapping"],
            data_start_row=tpl["data_start_row"],
        )

        return FileResponse(
            path=str(output_path),
            filename=output_path.name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except HTTPException:
        raise
    except Exception as e:
        return {
            "status": "error",
            "detail": str(e),
        }
