from fastapi import APIRouter, HTTPException, Depends
from psycopg2.extras import Json

from backend.app.database import get_connection
from backend.app.api.auth_api import require_roles

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("/current")
def current(excel_template_id: int, docx_template_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, config, created_at
                FROM generation_settings
                WHERE excel_template_id=%s AND docx_template_id=%s AND is_active=TRUE
                ORDER BY created_at DESC
                LIMIT 1;
            """, (excel_template_id, docx_template_id))
            r = cur.fetchone()
            if not r:
                return {"exists": False}
            return {"exists": True, "settings_id": r[0], "config": r[1], "created_at": r[2]}
    finally:
        conn.close()


@router.post("/save")
def save(payload: dict, user=Depends(require_roles("admin"))):
    excel_template_id = payload.get("excel_template_id")
    docx_template_id = payload.get("docx_template_id")
    config = payload.get("config")

    if not excel_template_id or not docx_template_id or not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="excel_template_id, docx_template_id, config(dict) обязательны")

    cols = (config.get("columns") or {})
    if not cols.get("teacher_col") or not cols.get("staff_hours_col"):
        raise HTTPException(status_code=400, detail="config.columns.teacher_col и config.columns.staff_hours_col обязательны")

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE generation_settings
                    SET is_active=FALSE
                    WHERE excel_template_id=%s AND docx_template_id=%s AND is_active=TRUE;
                """, (excel_template_id, docx_template_id))

                cur.execute("""
                    INSERT INTO generation_settings(excel_template_id, docx_template_id, config, is_active)
                    VALUES (%s,%s,%s,TRUE)
                    RETURNING id;
                """, (excel_template_id, docx_template_id, Json(config)))
                new_id = cur.fetchone()[0]

        return {"status": "ok", "settings_id": new_id}
    finally:
        conn.close()
