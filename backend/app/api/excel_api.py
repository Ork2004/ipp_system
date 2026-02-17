from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import FileResponse
from psycopg2 import errors

from backend.app.database import get_connection
from backend.app.utils.excel_parser import parse_excel
from backend.app.utils.storage import save_upload_file, safe_resolve_in_dir
from backend.app.config import EXCEL_DIR, DOCX_DIR
from backend.app.api.auth_api import require_roles

router = APIRouter(prefix="/excel", tags=["Excel"])


@router.post("/upload")
def upload_excel(
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
                SELECT id FROM excel_templates
                WHERE department_id=%s AND academic_year=%s;
            """, (department_id, academic_year))
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="На этот учебный год уже загружен Excel. Удали его в списке и загрузи новый."
                )
    finally:
        conn.close()

    saved_path = save_upload_file(file, EXCEL_DIR, allowed_exts={".xlsx", ".xls"})

    try:
        excel_template_id = parse_excel(
            saved_path,
            department_id,
            academic_year,
            source_filename=file.filename
        )
    except errors.UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="На этот учебный год уже загружен Excel. Удали его и загрузи новый."
        )

    return {
        "status": "ok",
        "department_id": department_id,
        "academic_year": academic_year,
        "original_filename": file.filename,
        "saved_path": saved_path,
        "excel_template_id": excel_template_id
    }


@router.get("/templates")
def list_excel_templates(department_id: int, user=Depends(require_roles("admin"))):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, academic_year, source_filename, file_path, status, created_at
                FROM excel_templates
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
            }
            for r in rows
        ]
    finally:
        conn.close()


@router.get("/by-year/download")
def download_excel_by_year(department_id: int, academic_year: str, user=Depends(require_roles("admin"))):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT file_path, source_filename
                FROM excel_templates
                WHERE department_id=%s AND academic_year=%s;
            """, (department_id, academic_year))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Excel для этого года не найден")

        path_str, src_name = row[0], row[1]
        file_path = safe_resolve_in_dir(path_str, EXCEL_DIR)
        filename = src_name or f"excel_{academic_year}.xlsx"

        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if filename.lower().endswith(".xls"):
            media = "application/vnd.ms-excel"

        return FileResponse(
            str(file_path),
            media_type=media,
            filename=filename
        )
    finally:
        conn.close()


@router.get("/{excel_template_id}/preview")
def preview_excel(excel_template_id: int, limit: int = 30, offset: int = 0, user=Depends(require_roles("admin"))):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM excel_templates WHERE id = %s;", (excel_template_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Excel template не найден")

            cur.execute("""
                SELECT header_text
                FROM excel_columns
                WHERE template_id = %s
                ORDER BY position_index;
            """, (excel_template_id,))
            headers = [r[0] for r in cur.fetchall()]

            cur.execute("""
                SELECT row_number, row_data
                FROM excel_rows
                WHERE template_id = %s
                ORDER BY row_number
                LIMIT %s OFFSET %s;
            """, (excel_template_id, limit, offset))
            rows = cur.fetchall()

        return {
            "excel_template_id": excel_template_id,
            "headers": headers,
            "rows": [{"row_number": rn, "row_data": rd} for (rn, rd) in rows],
            "limit": limit,
            "offset": offset
        }
    finally:
        conn.close()


@router.get("/{excel_template_id}/columns")
def get_excel_columns(excel_template_id: int, user=Depends(require_roles("admin"))):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, column_name, header_text, position_index
                FROM excel_columns
                WHERE template_id=%s
                ORDER BY position_index;
            """, (excel_template_id,))
            rows = cur.fetchall()
        return [
            {
                "id": r[0],
                "column_name": r[1],
                "header_text": r[2],
                "position_index": r[3],
                "placeholder": f"row.{r[1]}",
                "example": f"{{{{ row.{r[1]} }}}}",
            }
            for r in rows
        ]
    finally:
        conn.close()


@router.delete("/by-year")
def delete_excel_by_year(
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
                    FROM excel_templates
                    WHERE department_id=%s AND academic_year=%s;
                """, (department_id, academic_year))
                ex = cur.fetchone()
                if not ex:
                    raise HTTPException(status_code=404, detail="Excel для этого года не найден")

                excel_id, excel_path = ex

                cur.execute("""
                    SELECT file_path
                    FROM docx_templates
                    WHERE department_id=%s AND academic_year=%s;
                """, (department_id, academic_year))
                dx = cur.fetchone()
                docx_path = dx[0] if dx else None

                deleted_excel_file = False
                deleted_docx_file = False

                if excel_path:
                    try:
                        p = safe_resolve_in_dir(excel_path, EXCEL_DIR)
                        if p.exists() and p.is_file():
                            p.unlink()
                            deleted_excel_file = True
                    except Exception:
                        deleted_excel_file = False

                if docx_path:
                    try:
                        p = safe_resolve_in_dir(docx_path, DOCX_DIR)
                        if p.exists() and p.is_file():
                            p.unlink()
                            deleted_docx_file = True
                    except Exception:
                        deleted_docx_file = False

                cur.execute("DELETE FROM excel_templates WHERE id=%s;", (excel_id,))

        return {
            "status": "ok",
            "deleted_year": academic_year,
            "deleted_excel_file": deleted_excel_file,
            "deleted_docx_file": deleted_docx_file
        }
    finally:
        conn.close()
