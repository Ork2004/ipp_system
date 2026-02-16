from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import FileResponse
from psycopg2 import errors

from backend.app.database import get_connection
from backend.app.utils.docx_store import store_docx_template
from backend.app.utils.validator import validate_docx_against_excel
from backend.app.utils.storage import save_upload_file, safe_resolve_in_dir
from backend.app.config import DOCX_DIR
from backend.app.api.auth_api import require_roles

router = APIRouter(prefix="/docx", tags=["DOCX"])


def _get_excel_id_by_year(cur, department_id: int, academic_year: str) -> int:
    cur.execute("""
        SELECT id
        FROM excel_templates
        WHERE department_id=%s AND academic_year=%s;
    """, (department_id, academic_year))
    r = cur.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Excel для этого года не найден. Сначала загрузи Excel.")
    return int(r[0])


@router.post("/upload")
def upload_docx(
    department_id: int = Form(...),
    academic_year: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(require_roles("admin"))
):
    admin_dep = user.get("department_id")
    if not admin_dep:
        raise HTTPException(status_code=403, detail="У админа нет department_id в токене")
    if int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="department_id должен совпадать с кафедрой админа")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id
                FROM docx_templates
                WHERE department_id=%s AND academic_year=%s;
            """, (department_id, academic_year))
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="На этот учебный год уже загружен DOCX. Удали его и загрузи новый."
                )

            excel_template_id = _get_excel_id_by_year(cur, department_id, academic_year)
    finally:
        conn.close()

    saved_path = save_upload_file(file, DOCX_DIR, allowed_exts={".docx"})

    try:
        docx_template_id = store_docx_template(
            file_path=saved_path,
            department_id=department_id,
            academic_year=academic_year,
            excel_template_id=excel_template_id,
            source_filename=file.filename
        )
    except errors.UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="На этот учебный год уже загружен DOCX. Удали его и загрузи новый."
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
def list_docx_templates(department_id: int, user=Depends(require_roles("admin"))):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, academic_year, source_filename, file_path, status, created_at, excel_template_id
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
                "file_path": r[3],
                "status": r[4],
                "created_at": r[5],
                "excel_template_id": r[6],
            }
            for r in rows
        ]
    finally:
        conn.close()


@router.delete("/by-year")
def delete_docx_by_year(
    department_id: int,
    academic_year: str,
    user=Depends(require_roles("admin"))
):
    admin_dep = user.get("department_id")
    if not admin_dep:
        raise HTTPException(status_code=403, detail="У админа нет department_id в токене")
    if int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="department_id должен совпадать с кафедрой админа")

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, file_path
                    FROM docx_templates
                    WHERE department_id=%s AND academic_year=%s;
                """, (department_id, academic_year))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="DOCX для этого года не найден")

                docx_id, path_str = row

                deleted_file = False
                if path_str:
                    try:
                        p = safe_resolve_in_dir(path_str, DOCX_DIR)
                        if p.exists() and p.is_file():
                            p.unlink()
                            deleted_file = True
                    except Exception:
                        deleted_file = False

                cur.execute("DELETE FROM docx_templates WHERE id=%s;", (docx_id,))

        return {"status": "ok", "deleted_year": academic_year, "deleted_file": deleted_file}

    finally:
        conn.close()


@router.get("/by-year/download")
def download_docx_by_year(department_id: int, academic_year: str, user=Depends(require_roles("admin"))):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT file_path, source_filename
                FROM docx_templates
                WHERE department_id=%s AND academic_year=%s;
            """, (department_id, academic_year))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="DOCX для этого года не найден")

        path_str, src_name = row[0], row[1]
        file_path = safe_resolve_in_dir(path_str, DOCX_DIR)
        filename = src_name or f"template_{academic_year}.docx"

        return FileResponse(
            str(file_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=filename
        )
    finally:
        conn.close()


@router.get("/{docx_template_id}/placeholders")
def get_docx_placeholders(docx_template_id: int, user=Depends(require_roles("admin"))):
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
def validate(docx_template_id: int, user=Depends(require_roles("admin"))):
    return validate_docx_against_excel(docx_template_id)
