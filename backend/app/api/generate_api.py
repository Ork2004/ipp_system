from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.app.utils.generator import generate_docx_for_teacher

router = APIRouter(prefix="/generate", tags=["Generate"])


@router.post("/teacher")
def generate_for_teacher(payload: dict):
    teacher_id = payload.get("teacher_id")
    department_id = payload.get("department_id")
    academic_year = payload.get("academic_year")
    docx_template_id = payload.get("docx_template_id")

    if not teacher_id or not department_id or not academic_year:
        raise HTTPException(status_code=400, detail="teacher_id, department_id, academic_year обязательны")

    try:
        out_path = generate_docx_for_teacher(
            teacher_id=int(teacher_id),
            department_id=int(department_id),
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
