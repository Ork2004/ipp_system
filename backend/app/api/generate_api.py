from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse

from backend.app.utils.generator import generate_docx_for_teacher
from backend.app.database import get_connection
from backend.app.api.auth_api import get_current_user

router = APIRouter(prefix="/generate", tags=["Generate"])


def _check_teacher_access(user: dict, teacher_id: int):
    role = user.get("role")
    if role == "guest":
        raise HTTPException(status_code=403, detail="Гость не может генерировать")

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


@router.post("/teacher")
def generate_for_teacher(payload: dict, user=Depends(get_current_user)):
    teacher_id = payload.get("teacher_id")
    department_id = payload.get("department_id")
    academic_year = payload.get("academic_year")
    docx_template_id = payload.get("docx_template_id")

    if not teacher_id or not department_id or not academic_year:
        raise HTTPException(status_code=400, detail="teacher_id, department_id, academic_year обязательны")

    teacher_id = int(teacher_id)
    department_id = int(department_id)

    _check_teacher_access(user, teacher_id)

    if user.get("role") == "admin":
        _check_admin_teacher_in_department(user, teacher_id)
        if user.get("department_id") and department_id != user.get("department_id"):
            raise HTTPException(status_code=403, detail="department_id должен совпадать с кафедрой админа")

    try:
        out_path = generate_docx_for_teacher(
            teacher_id=teacher_id,
            department_id=department_id,
            academic_year=str(academic_year),
            docx_template_id=int(docx_template_id) if docx_template_id else None,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "ok",
        "output_path": out_path,
        "download_url": f"/generate/download?path={out_path}"
    }


@router.post("/for-teacher/{teacher_id}")
def generate_from_teacher_page(
    teacher_id: int,
    payload: dict,
    user=Depends(get_current_user)
):
    department_id = payload.get("department_id")
    academic_year = payload.get("academic_year")
    docx_template_id = payload.get("docx_template_id")

    if not department_id or not academic_year:
        raise HTTPException(status_code=400, detail="department_id и academic_year обязательны")

    department_id = int(department_id)

    _check_teacher_access(user, teacher_id)

    if user.get("role") == "admin":
        _check_admin_teacher_in_department(user, teacher_id)
        if user.get("department_id") and department_id != user.get("department_id"):
            raise HTTPException(status_code=403, detail="department_id должен совпадать с кафедрой админа")

    try:
        out_path = generate_docx_for_teacher(
            teacher_id=int(teacher_id),
            department_id=department_id,
            academic_year=str(academic_year),
            docx_template_id=int(docx_template_id) if docx_template_id else None,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "ok",
        "output_path": out_path,
        "download_url": f"/generate/download?path={out_path}"
    }


@router.get("/download")
def download_generated(path: str):
    if "backend/uploads/generated" not in path.replace("\\", "/"):
        raise HTTPException(status_code=400, detail="Недопустимый путь")

    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=path.split("/")[-1]
    )
