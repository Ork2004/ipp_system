from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import FileResponse
from psycopg2 import errors

from backend.app.database import get_connection
from backend.app.config import DOCX_DIR
from backend.app.api.auth_api import require_roles
from backend.app.utils.storage import save_upload_file, safe_resolve_in_dir
from backend.app.utils.raw_template_store import store_raw_docx_template

router = APIRouter(prefix="/raw-template", tags=["Raw Template"])


def _get_raw_template_by_year(cur, department_id: int, academic_year: str):
    cur.execute(
        """
        SELECT id, file_path, source_filename, tables_count, status, created_at
        FROM raw_docx_templates
        WHERE department_id=%s AND academic_year=%s
        LIMIT 1;
        """,
        (department_id, academic_year),
    )
    return cur.fetchone()


@router.post("/upload")
def upload_raw_template(
    department_id: int = Form(...),
    academic_year: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(require_roles("admin")),
):
    admin_dep = user.get("department_id")
    if not admin_dep:
        raise HTTPException(status_code=403, detail="У админа нет department_id в токене")
    if int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="department_id должен совпадать с кафедрой админа")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            exists = _get_raw_template_by_year(cur, int(department_id), str(academic_year))
            if exists:
                raise HTTPException(
                    status_code=409,
                    detail="Raw шаблон для этого учебного года уже загружен. Удали его и загрузи новый."
                )
    finally:
        conn.close()

    saved_path = save_upload_file(file, DOCX_DIR, allowed_exts={".docx"})

    try:
        result = store_raw_docx_template(
            file_path=saved_path,
            department_id=int(department_id),
            academic_year=str(academic_year),
            source_filename=file.filename,
        )
    except errors.UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="Raw шаблон для этого учебного года уже загружен. Удали его и загрузи новый."
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "ok",
        "department_id": int(department_id),
        "academic_year": str(academic_year),
        "source_filename": file.filename,
        "saved_path": saved_path,
        "raw_template_id": result["raw_template_id"],
        "tables_count": result["tables_count"],
        "cells_count": result["cells_count"],
    }


@router.get("/templates")
def list_raw_templates(
    department_id: int,
    user=Depends(require_roles("admin")),
):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, academic_year, source_filename, file_path, tables_count, status, created_at
                FROM raw_docx_templates
                WHERE department_id=%s
                ORDER BY academic_year DESC, created_at DESC;
                """,
                (department_id,),
            )
            rows = cur.fetchall()

        return [
            {
                "id": r[0],
                "academic_year": r[1],
                "source_filename": r[2],
                "file_path": r[3],
                "tables_count": r[4],
                "status": r[5],
                "created_at": r[6],
            }
            for r in rows
        ]
    finally:
        conn.close()


@router.get("/by-year")
def get_raw_template_by_year(
    department_id: int,
    academic_year: str,
    user=Depends(require_roles("admin")),
):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            row = _get_raw_template_by_year(cur, int(department_id), str(academic_year))
            if not row:
                raise HTTPException(status_code=404, detail="Raw шаблон для этого года не найден")

        return {
            "id": row[0],
            "file_path": row[1],
            "source_filename": row[2],
            "tables_count": row[3],
            "status": row[4],
            "created_at": row[5],
        }
    finally:
        conn.close()


@router.get("/by-year/download")
def download_raw_template_by_year(
    department_id: int,
    academic_year: str,
    user=Depends(require_roles("admin")),
):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            row = _get_raw_template_by_year(cur, int(department_id), str(academic_year))
            if not row:
                raise HTTPException(status_code=404, detail="Raw шаблон для этого года не найден")

        path_str = row[1]
        source_filename = row[2] or f"raw_template_{academic_year}.docx"
        file_path = safe_resolve_in_dir(path_str, DOCX_DIR)

        return FileResponse(
            str(file_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=source_filename,
        )
    finally:
        conn.close()


@router.delete("/by-year")
def delete_raw_template_by_year(
    department_id: int,
    academic_year: str,
    user=Depends(require_roles("admin")),
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
                row = _get_raw_template_by_year(cur, int(department_id), str(academic_year))
                if not row:
                    raise HTTPException(status_code=404, detail="Raw шаблон для этого года не найден")

                raw_template_id = row[0]
                path_str = row[1]

                deleted_file = False
                if path_str:
                    try:
                        p = safe_resolve_in_dir(path_str, DOCX_DIR)
                        if p.exists() and p.is_file():
                            p.unlink()
                            deleted_file = True
                    except Exception:
                        deleted_file = False

                cur.execute(
                    "DELETE FROM raw_docx_templates WHERE id=%s;",
                    (raw_template_id,),
                )

        return {
            "status": "ok",
            "deleted_year": str(academic_year),
            "deleted_file": deleted_file,
        }
    finally:
        conn.close()


@router.get("/{raw_template_id}/tables")
def get_raw_template_tables(
    raw_template_id: int,
    user=Depends(require_roles("admin")),
):
    admin_dep = user.get("department_id")
    if not admin_dep:
        raise HTTPException(status_code=403, detail="У админа нет department_id в токене")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT department_id
                FROM raw_docx_templates
                WHERE id=%s;
                """,
                (raw_template_id,),
            )
            tpl = cur.fetchone()
            if not tpl:
                raise HTTPException(status_code=404, detail="Raw шаблон не найден")

            if int(tpl[0]) != int(admin_dep):
                raise HTTPException(status_code=403, detail="Нельзя смотреть шаблон другой кафедры")

            cur.execute(
                """
                SELECT
                    id,
                    table_index,
                    section_title,
                    table_type,
                    row_count,
                    col_count,
                    header_signature,
                    has_total_row,
                    loop_template_row_index,
                    column_hints,
                    editable_cells_count,
                    prefilled_cells_count,
                    extra_meta
                FROM raw_docx_tables
                WHERE template_id=%s
                ORDER BY table_index;
                """,
                (raw_template_id,),
            )
            table_rows = cur.fetchall()

            out = []
            for t in table_rows:
                raw_table_id = t[0]

                cur.execute(
                    """
                    SELECT
                        row_index,
                        col_index,
                        cell_key,
                        original_text,
                        normalized_text,
                        is_empty,
                        is_editable,
                        cell_kind,
                        extra_meta
                    FROM raw_docx_cells
                    WHERE table_id=%s
                    ORDER BY row_index, col_index;
                    """,
                    (raw_table_id,),
                )
                cell_rows = cur.fetchall()

                matrix_map = {}
                for c in cell_rows:
                    row_index = c[0]
                    matrix_map.setdefault(row_index, []).append({
                        "row_index": c[0],
                        "col_index": c[1],
                        "cell_key": c[2],
                        "text": c[3],
                        "normalized_text": c[4],
                        "is_empty": c[5],
                        "editable": c[6],
                        "cell_kind": c[7],
                        "extra_meta": c[8],
                    })

                matrix = [matrix_map[k] for k in sorted(matrix_map.keys())]

                out.append({
                    "id": raw_table_id,
                    "table_index": t[1],
                    "section_title": t[2],
                    "table_type": t[3],
                    "row_count": t[4],
                    "col_count": t[5],
                    "header_signature": t[6],
                    "has_total_row": t[7],
                    "loop_template_row_index": t[8],
                    "column_hints": t[9] or [],
                    "editable_cells_count": t[10],
                    "prefilled_cells_count": t[11],
                    "extra_meta": t[12] or {},
                    "matrix": matrix,
                })

        return {
            "raw_template_id": raw_template_id,
            "tables": out,
        }
    finally:
        conn.close()


@router.patch("/table/{raw_table_id}/type")
def update_raw_table_type(
    raw_table_id: int,
    payload: dict,
    user=Depends(require_roles("admin")),
):
    admin_dep = user.get("department_id")
    if not admin_dep:
        raise HTTPException(status_code=403, detail="У админа нет department_id в токене")

    new_type = str(payload.get("table_type") or "").strip().lower()
    if new_type not in ("static", "loop"):
        raise HTTPException(status_code=400, detail="table_type должен быть static или loop")

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT t.id, rt.department_id
                    FROM raw_docx_tables t
                    JOIN raw_docx_templates rt ON rt.id = t.template_id
                    WHERE t.id=%s;
                    """,
                    (raw_table_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Таблица raw шаблона не найдена")

                if int(row[1]) != int(admin_dep):
                    raise HTTPException(status_code=403, detail="Нельзя менять шаблон другой кафедры")

                cur.execute(
                    """
                    UPDATE raw_docx_tables
                    SET table_type=%s
                    WHERE id=%s;
                    """,
                    (new_type, raw_table_id),
                )

        return {
            "status": "ok",
            "raw_table_id": raw_table_id,
            "table_type": new_type,
        }
    finally:
        conn.close()