from fastapi import APIRouter, Depends, HTTPException
from backend.app.database import get_connection
from backend.app.api.auth_api import get_current_user
from backend.app.utils.blocks import detect_semester_columns, build_available_block_keys, build_block_snippet

router = APIRouter(prefix="/blocks", tags=["Blocks"])


@router.get("/available")
def available_blocks(excel_template_id: int, docx_template_id: int, user=Depends(get_current_user)):
    if user.get("role") not in ("admin", "teacher"):
        raise HTTPException(status_code=403, detail="Доступ только admin/teacher")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM excel_templates WHERE id=%s;", (excel_template_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Excel template не найден")

            cur.execute("SELECT id, excel_template_id FROM docx_templates WHERE id=%s;", (docx_template_id,))
            docx = cur.fetchone()
            if not docx:
                raise HTTPException(status_code=404, detail="DOCX template не найден")

            cur.execute("""
                SELECT column_name, header_text
                FROM excel_columns
                WHERE template_id=%s
                ORDER BY position_index;
            """, (excel_template_id,))
            cols = cur.fetchall()

            semester_map = detect_semester_columns(cols)

            cur.execute("""
                SELECT config
                FROM generation_settings
                WHERE excel_template_id=%s AND docx_template_id=%s AND is_active=TRUE
                ORDER BY created_at DESC
                LIMIT 1;
            """, (excel_template_id, docx_template_id))
            r = cur.fetchone()
            config = r[0] if r else {}
            hourly_hours_col = ((config or {}).get("columns") or {}).get("hourly_hours_col")

            blocks = build_available_block_keys(semester_map, has_hourly=bool(hourly_hours_col))

            for b in blocks:
                b["snippet"] = build_block_snippet(b["key"], loop_var="row")

        return {
            "excel_template_id": excel_template_id,
            "docx_template_id": docx_template_id,
            "semester_map": semester_map,
            "blocks": blocks
        }
    finally:
        conn.close()
