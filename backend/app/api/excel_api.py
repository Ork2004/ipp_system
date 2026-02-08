from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from pathlib import Path

from backend.app.database import get_connection
from backend.app.utils.excel_parser import parse_excel
from backend.app.utils.storage import save_upload_file, safe_resolve_in_dir
from backend.app.config import EXCEL_DIR
from backend.app.api.auth_api import require_roles

router = APIRouter(prefix="/excel", tags=["Excel"])


@router.post("/upload")
def upload_excel(
    department_id: int = Form(...),
    academic_year: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(require_roles("admin"))
):
    saved_path = save_upload_file(file, EXCEL_DIR, allowed_exts={".xlsx", ".xls"})

    excel_template_id = parse_excel(
        saved_path,
        department_id,
        academic_year,
        source_filename=file.filename
    )

    return {
        "status": "ok",
        "type": "excel",
        "department_id": department_id,
        "academic_year": academic_year,
        "original_filename": file.filename,
        "saved_path": saved_path,
        "excel_template_id": excel_template_id
    }


@router.get("/templates")
def list_excel_templates(department_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, academic_year, source_filename, file_path, is_active, status, created_at
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
                "is_active": r[4],
                "status": r[5],
                "created_at": r[6],
            }
            for r in rows
        ]
    finally:
        conn.close()


@router.get("/{excel_template_id}/preview")
def preview_excel(excel_template_id: int, limit: int = 30, offset: int = 0):
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
def get_excel_columns(excel_template_id: int):
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


@router.delete("/{excel_template_id}")
def delete_excel_template(
    excel_template_id: int,
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
                    SELECT id, department_id, file_path
                    FROM excel_templates
                    WHERE id=%s;
                """, (excel_template_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Excel template не найден")

                _, dep_id, file_path = row
                if dep_id != admin_dep:
                    raise HTTPException(status_code=403, detail="Нельзя удалять Excel другой кафедры")

                deleted_file = False
                if file_path:
                    try:
                        p = safe_resolve_in_dir(file_path, EXCEL_DIR)
                        if p.exists() and p.is_file():
                            p.unlink()
                            deleted_file = True
                    except Exception:
                        deleted_file = False

                cur.execute("DELETE FROM excel_templates WHERE id=%s;", (excel_template_id,))

        return {"status": "ok", "deleted_excel_template_id": excel_template_id, "deleted_file": deleted_file}

    finally:
        conn.close()
