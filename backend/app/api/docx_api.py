import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse

from backend.app.database import get_connection
from backend.app.utils.docx_store import store_docx_template
from backend.app.utils.validator import validate_docx_against_excel

router = APIRouter(prefix="/docx", tags=["DOCX"])

BASE_DIR = Path(__file__).resolve().parent.parent
DOCX_DIR = BASE_DIR / "uploads" / "docx"
DOCX_DIR.mkdir(parents=True, exist_ok=True)


def _save_upload(upload_file: UploadFile) -> str:
    ext = Path(upload_file.filename).suffix.lower()
    file_id = uuid.uuid4().hex
    out_path = DOCX_DIR / f"{file_id}{ext}"
    with open(out_path, "wb") as f:
        f.write(upload_file.file.read())
    return str(out_path)


@router.post("/upload")
def upload_docx(
    department_id: int = Form(...),
    academic_year: str = Form(...),
    excel_template_id: int = Form(...),
    file: UploadFile = File(...)
):
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Нужен DOCX файл .docx")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM excel_templates WHERE id=%s;", (excel_template_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Excel template не найден (excel_template_id)")
    finally:
        conn.close()

    saved_path = _save_upload(file)

    docx_template_id = store_docx_template(
        file_path=saved_path,
        department_id=department_id,
        academic_year=academic_year,
        excel_template_id=excel_template_id,
        source_filename=file.filename
    )

    report = validate_docx_against_excel(docx_template_id)

    return {
        "status": "ok",
        "docx_template_id": docx_template_id,
        "excel_template_id": excel_template_id,
        "department_id": department_id,
        "academic_year": academic_year,
        "source_filename": file.filename,
        "saved_path": saved_path,
        "compatibility": report
    }


@router.get("/templates")
def list_docx_templates(department_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, academic_year, source_filename, current_file_path, is_active, status, created_at, version, excel_template_id
                FROM docx_templates
                WHERE department_id = %s
                ORDER BY academic_year DESC, created_at DESC;
            """, (department_id,))
            rows = cur.fetchall()

        return [
            {
                "id": r[0],
                "academic_year": r[1],
                "source_filename": r[2],
                "current_file_path": r[3],
                "is_active": r[4],
                "status": r[5],
                "created_at": r[6],
                "version": r[7],
                "excel_template_id": r[8],
            }
            for r in rows
        ]
    finally:
        conn.close()


@router.get("/{docx_template_id}/download")
def download_docx(docx_template_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT current_file_path, source_filename, version
                FROM docx_templates
                WHERE id = %s;
            """, (docx_template_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="DOCX template не найден")

        path, src_name, version = row[0], row[1], row[2]
        filename = src_name or f"template_{docx_template_id}_v{version}.docx"
        return FileResponse(
            path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=filename
        )
    finally:
        conn.close()


@router.get("/{docx_template_id}/placeholders")
def get_docx_placeholders(docx_template_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT placeholder_name, placeholder_type, extra_meta
                FROM docx_placeholders
                WHERE template_id=%s
                ORDER BY placeholder_type, placeholder_name;
            """, (docx_template_id,))
            rows = cur.fetchall()
        return [{"placeholder_name": r[0], "placeholder_type": r[1], "extra_meta": r[2]} for r in rows]
    finally:
        conn.close()


@router.get("/{docx_template_id}/validate")
def validate(docx_template_id: int):
    return validate_docx_against_excel(docx_template_id)
