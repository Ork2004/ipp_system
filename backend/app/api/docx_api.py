from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import FileResponse

from backend.app.database import get_connection
from backend.app.utils.docx_store import store_docx_template
from backend.app.utils.validator import validate_docx_against_excel
from backend.app.utils.storage import save_upload_file, safe_resolve_in_dir
from backend.app.config import DOCX_DIR
from backend.app.api.auth_api import require_roles

router = APIRouter(prefix="/docx", tags=["DOCX"])


@router.post("/upload")
def upload_docx(
    department_id: int = Form(...),
    academic_year: str = Form(...),
    excel_template_id: int = Form(...),
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
            cur.execute("SELECT id, department_id FROM excel_templates WHERE id=%s;", (excel_template_id,))
            ex = cur.fetchone()
            if not ex:
                raise HTTPException(status_code=404, detail="Excel template не найден (excel_template_id)")
            if ex[1] != admin_dep:
                raise HTTPException(status_code=403, detail="Нельзя привязать DOCX к Excel другой кафедры")
    finally:
        conn.close()

    saved_path = save_upload_file(file, DOCX_DIR, allowed_exts={".docx"})

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
                SELECT id, academic_year, source_filename, current_file_path,
                       is_active, status, created_at, version, excel_template_id
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


@router.delete("/{docx_template_id}")
def delete_docx_template(
    docx_template_id: int,
    user=Depends(require_roles("admin"))
):
    admin_dep = user.get("department_id")
    if not admin_dep:
        raise HTTPException(status_code=403, detail="У админа нет department_id в токене")

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, department_id, current_file_path
                    FROM docx_templates
                    WHERE id=%s;
                """, (docx_template_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="DOCX template не найден")

                _, dep_id, path_str = row
                if dep_id != admin_dep:
                    raise HTTPException(status_code=403, detail="Нельзя удалять DOCX другой кафедры")

                deleted_file = False
                if path_str:
                    try:
                        p = safe_resolve_in_dir(path_str, DOCX_DIR)
                        if p.exists() and p.is_file():
                            p.unlink()
                            deleted_file = True
                    except Exception:
                        deleted_file = False

                cur.execute("DELETE FROM docx_templates WHERE id=%s;", (docx_template_id,))

        return {"status": "ok", "deleted_docx_template_id": docx_template_id, "deleted_file": deleted_file}

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

        path_str, src_name, version = row[0], row[1], row[2]
        file_path = safe_resolve_in_dir(path_str, DOCX_DIR)

        filename = src_name or f"template_{docx_template_id}_v{version}.docx"
        return FileResponse(
            str(file_path),
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
