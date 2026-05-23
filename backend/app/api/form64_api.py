from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from backend.app.api.auth_api import require_roles
from backend.app.api.form63_api import (
    _build_form63_preview_rows,
    _check_excel_access,
)
from backend.app.config import BASE_DIR
from backend.app.database import get_connection
from backend.app.utils.form64_generator import (
    build_form64_rows_from_form63,
    export_form64_docx,
)

router = APIRouter(prefix="/form64", tags=["Form64"])

FORM64_TEMPLATE_PATH = BASE_DIR / "assets" / "form64_template.docx"
FORM64_OUTPUT_DIR = Path("backend/generated/form64")

DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


def _load_department_name(department_id: int) -> str:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM departments WHERE id=%s;", (department_id,))
            row = cur.fetchone()
        return row[0] if row and row[0] else ""
    finally:
        conn.close()


@router.get("/preview")
def form64_preview(excel_template_id: int, user=Depends(require_roles("admin"))):
    """Department-wide Form 64 preview: one block per teacher with plan slots."""
    try:
        _check_excel_access(excel_template_id, user)
        items = _build_form63_preview_rows(excel_template_id)
        rows = build_form64_rows_from_form63(items)
        return {
            "status": "ok",
            "excel_template_id": excel_template_id,
            "count": len(rows),
            "teachers": rows,
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@router.get("/export")
def form64_export(excel_template_id: int, user=Depends(require_roles("admin"))):
    """Generate the official Form 64 DOCX for a department's teaching load."""
    try:
        excel_meta = _check_excel_access(excel_template_id, user)

        if not FORM64_TEMPLATE_PATH.exists():
            raise HTTPException(
                status_code=500,
                detail="Шаблон Формы 64 не найден на сервере",
            )

        items = _build_form63_preview_rows(excel_template_id)
        rows = build_form64_rows_from_form63(items)

        dept_name = _load_department_name(int(excel_meta["department_id"]))
        academic_year = excel_meta.get("academic_year")

        FORM64_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output_path = FORM64_OUTPUT_DIR / f"form64_excel_{excel_template_id}.docx"

        export_form64_docx(
            rows=rows,
            template_path=str(FORM64_TEMPLATE_PATH),
            output_path=str(output_path),
            dept_name=dept_name,
            academic_year=academic_year,
        )

        return FileResponse(
            path=str(output_path),
            filename=output_path.name,
            media_type=DOCX_MEDIA_TYPE,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации Формы 64: {e}")
