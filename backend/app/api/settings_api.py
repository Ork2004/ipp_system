from fastapi import APIRouter, HTTPException, Depends
from psycopg2.extras import Json

from backend.app.database import get_connection
from backend.app.api.auth_api import require_roles

router = APIRouter(prefix="/settings", tags=["Settings"])


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


@router.get("/current")
def current(department_id: int, academic_year: str, user=Depends(require_roles("admin"))):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            excel_id = _get_excel_id_by_year(cur, department_id, academic_year)

            cur.execute("""
                SELECT id, config, created_at, updated_at
                FROM generation_settings
                WHERE excel_template_id=%s
                LIMIT 1;
            """, (excel_id,))
            r = cur.fetchone()
            if not r:
                return {"exists": False, "excel_template_id": excel_id}

            return {
                "exists": True,
                "settings_id": r[0],
                "excel_template_id": excel_id,
                "config": r[1],
                "created_at": r[2],
                "updated_at": r[3]
            }
    finally:
        conn.close()


@router.post("/save")
def save(payload: dict, user=Depends(require_roles("admin"))):
    department_id = payload.get("department_id")
    academic_year = payload.get("academic_year")
    config = payload.get("config")

    if not department_id or not academic_year or not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="department_id, academic_year, config(dict) обязательны")

    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="department_id должен совпадать с кафедрой админа")

    cols = (config.get("columns") or {})
    if not cols.get("teacher_col") or not cols.get("staff_hours_col"):
        raise HTTPException(status_code=400, detail="config.columns.teacher_col и config.columns.staff_hours_col обязательны")

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                excel_id = _get_excel_id_by_year(cur, int(department_id), str(academic_year))

                cur.execute("""
                    INSERT INTO generation_settings(excel_template_id, config)
                    VALUES (%s,%s)
                    ON CONFLICT (excel_template_id)
                    DO UPDATE SET
                        config = EXCLUDED.config,
                        updated_at = now()
                    RETURNING id;
                """, (excel_id, Json(config)))
                settings_id = cur.fetchone()[0]

        return {"status": "ok", "settings_id": settings_id, "excel_template_id": excel_id}
    finally:
        conn.close()
