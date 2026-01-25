from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse

from backend.app.utils.generator import generate_docx_for_teacher
from backend.app.database import get_connection
from backend.app.api.auth_api import get_current_user
from backend.app.utils.generation_history import insert_generation_history

router = APIRouter(prefix="/generate", tags=["Generate"])


def _role_guard(user: dict):
    if user.get("role") not in ("admin", "teacher"):
        raise HTTPException(status_code=403, detail="Генерация доступна только admin и teacher")


def _check_teacher_access(user: dict, teacher_id: int):
    role = user.get("role")
    if role == "teacher":
        if int(user.get("teacher_id") or -1) != int(teacher_id):
            raise HTTPException(status_code=403, detail="Преподаватель может генерировать только для себя")


def _check_admin_teacher_in_department(admin_user: dict, teacher_id: int):
    dep = admin_user.get("department_id")
    if not dep:
        raise HTTPException(status_code=403, detail="У админа нет department_id в токене")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT department_id FROM teachers WHERE id=%s;", (teacher_id,))
            r = cur.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Преподаватель не найден")
            teacher_dep = r[0]
            if teacher_dep != dep:
                raise HTTPException(status_code=403, detail="Нельзя генерировать для другой кафедры")
    finally:
        conn.close()


def _get_excel_docx_ids_for_history(docx_template_id: int | None, department_id: int, academic_year: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if not docx_template_id:
                cur.execute("""
                    SELECT id, excel_template_id
                    FROM docx_templates
                    WHERE department_id=%s AND academic_year=%s AND is_active=TRUE
                    ORDER BY created_at DESC
                    LIMIT 1;
                """, (department_id, academic_year))
                r = cur.fetchone()
                if not r:
                    return None, None
                return r[1], r[0]

            cur.execute("""
                SELECT excel_template_id
                FROM docx_templates
                WHERE id=%s;
            """, (docx_template_id,))
            r = cur.fetchone()
            return (r[0] if r else None), docx_template_id
    finally:
        conn.close()


@router.post("/teacher")
def generate_for_teacher(payload: dict, user=Depends(get_current_user)):
    _role_guard(user)

    teacher_id = payload.get("teacher_id")
    department_id = payload.get("department_id")
    academic_year = payload.get("academic_year")
    docx_template_id = payload.get("docx_template_id")

    if not teacher_id or not department_id or not academic_year:
        raise HTTPException(status_code=400, detail="teacher_id, department_id, academic_year обязательны")

    teacher_id = int(teacher_id)
    department_id = int(department_id)
    academic_year = str(academic_year)

    _check_teacher_access(user, teacher_id)
    if user.get("role") == "admin":
        _check_admin_teacher_in_department(user, teacher_id)
        if user.get("department_id") and department_id != user.get("department_id"):
            raise HTTPException(status_code=403, detail="department_id должен совпадать с кафедрой админа")

    excel_template_id_hist, docx_template_id_hist = _get_excel_docx_ids_for_history(
        int(docx_template_id) if docx_template_id else None,
        department_id,
        academic_year
    )

    try:
        out_path = generate_docx_for_teacher(
            teacher_id=teacher_id,
            department_id=department_id,
            academic_year=academic_year,
            docx_template_id=int(docx_template_id) if docx_template_id else None,
        )

        hist_id = insert_generation_history(
            generated_by_user_id=int(user.get("sub")),
            generated_by_role=user.get("role"),
            generated_for_teacher_id=teacher_id,
            department_id=department_id,
            academic_year=academic_year,
            excel_template_id=excel_template_id_hist,
            docx_template_id=docx_template_id_hist,
            output_path=out_path,
            status="success",
            error_text=None
        )

        return {
            "status": "ok",
            "history_id": hist_id,
            "output_path": out_path,
            "download_url": f"/generate/download?path={out_path}"
        }

    except Exception as e:
        hist_id = insert_generation_history(
            generated_by_user_id=int(user.get("sub")),
            generated_by_role=user.get("role"),
            generated_for_teacher_id=teacher_id,
            department_id=department_id,
            academic_year=academic_year,
            excel_template_id=excel_template_id_hist,
            docx_template_id=docx_template_id_hist,
            output_path=None,
            status="error",
            error_text=str(e)
        )
        raise HTTPException(status_code=400, detail=f"{str(e)} (history_id={hist_id})")


@router.get("/download")
def download_generated(path: str):
    if "backend/uploads/generated" not in path.replace("\\", "/"):
        raise HTTPException(status_code=400, detail="Недопустимый путь")

    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=path.split("/")[-1]
    )
