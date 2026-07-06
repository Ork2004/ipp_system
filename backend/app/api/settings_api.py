from fastapi import APIRouter, HTTPException, Depends
from psycopg2.extras import Json

from backend.app.database import get_connection
from backend.app.api.auth_api import require_roles
from backend.app.utils.column_mapping import (
    carry_forward_column_map,
    suggest_column_map_with_confidence,
    validate_generation_readiness,
)
from backend.app.utils.manual_prefill import get_previous_academic_year
from backend.app.utils.teaching_load import build_effective_generation_settings
from backend.app.utils.generator import _get_excel_columns, _get_raw_tables, _get_settings_for_excel

router = APIRouter(prefix="/settings", tags=["Settings"])

TEACHING_LOAD_ROLES = ("teaching_load.staff", "teaching_load.hourly", "teaching_load.summary")


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


def _get_raw_table_for_department(cur, raw_table_id: int, department_id: int) -> dict:
    cur.execute("""
        SELECT rt.id, rt.column_hints, rt.table_fingerprint, rt.stable_column_keys
        FROM raw_docx_tables rt
        JOIN raw_docx_templates tpl ON tpl.id = rt.template_id
        WHERE rt.id=%s AND tpl.department_id=%s;
    """, (raw_table_id, department_id))
    r = cur.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Таблица шаблона не найдена для этой кафедры")
    return {
        "id": r[0],
        "column_hints": r[1] or [],
        "table_fingerprint": r[2] or "",
        "stable_column_keys": r[3] or [],
    }


def _get_previous_table_column_map(cur, department_id: int, academic_year: str, role: str):
    """Look up the previous year's confirmed column map (and its bound raw
    table) for `role`, if a previous-year settings row and template exist.
    Returns (entry, prev_raw_table) or (None, None) - never raises, since not
    having a previous year is the normal/expected case for a department's
    first year of use.
    """
    prev_year = get_previous_academic_year(academic_year)
    if not prev_year:
        return None, None

    cur.execute("""
        SELECT gs.config
        FROM generation_settings gs
        JOIN excel_templates et ON et.id = gs.excel_template_id
        WHERE et.department_id=%s AND et.academic_year=%s
        LIMIT 1;
    """, (department_id, prev_year))
    row = cur.fetchone()
    if not row:
        return None, None

    prev_config = row[0] or {}
    entry = (prev_config.get("table_column_maps") or {}).get(role)
    if not entry or not entry.get("raw_table_id"):
        return None, None

    cur.execute("""
        SELECT rt.id, rt.column_hints, rt.table_fingerprint, rt.stable_column_keys
        FROM raw_docx_tables rt
        JOIN raw_docx_templates tpl ON tpl.id = rt.template_id
        WHERE rt.id=%s AND tpl.department_id=%s;
    """, (int(entry["raw_table_id"]), department_id))
    prev_table_row = cur.fetchone()
    if not prev_table_row:
        return None, None

    prev_raw_table = {
        "id": prev_table_row[0],
        "column_hints": prev_table_row[1] or [],
        "table_fingerprint": prev_table_row[2] or "",
        "stable_column_keys": prev_table_row[3] or [],
    }
    return entry, prev_raw_table


@router.get("/table-column-map/suggest")
def suggest_table_column_map(
    department_id: int,
    academic_year: str,
    role: str,
    raw_table_id: int,
    user=Depends(require_roles("admin")),
):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

    if role not in TEACHING_LOAD_ROLES:
        raise HTTPException(status_code=400, detail=f"role должен быть одним из: {', '.join(TEACHING_LOAD_ROLES)}")

    kind = "summary" if role == "teaching_load.summary" else "detail"

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            raw_table = _get_raw_table_for_department(cur, raw_table_id, department_id)
            prev_entry, prev_raw_table = _get_previous_table_column_map(cur, department_id, academic_year, role)

        field_confidence = suggest_column_map_with_confidence(raw_table, kind=kind)
        suggested_source = "auto"

        if prev_entry and prev_raw_table:
            carried = carry_forward_column_map(raw_table, prev_entry, prev_raw_table)
            if carried:
                suggested_source = "carried_forward"
                for field_key, col_index in carried.items():
                    hint_text = (
                        raw_table["column_hints"][col_index]
                        if col_index < len(raw_table["column_hints"])
                        else ""
                    )
                    field_confidence[field_key] = {
                        "col_index": col_index,
                        "confidence": "carried_forward",
                        "hint_text": hint_text,
                    }

        col_map = {
            field_key: info["col_index"]
            for field_key, info in field_confidence.items()
            if info.get("col_index") is not None
        }

        return {
            "map": col_map,
            "field_confidence": field_confidence,
            "column_hints": raw_table["column_hints"],
            "table_fingerprint": raw_table["table_fingerprint"],
            "suggested_source": suggested_source,
        }
    finally:
        conn.close()


@router.get("/validate")
def validate_settings(department_id: int, academic_year: str, user=Depends(require_roles("admin"))):
    admin_dep = user.get("department_id")
    if not admin_dep or int(department_id) != int(admin_dep):
        raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id FROM excel_templates WHERE department_id=%s AND academic_year=%s;
            """, (department_id, academic_year))
            excel_row = cur.fetchone()
            if not excel_row:
                return {
                    "ready": False,
                    "errors": [{"code": "no_excel", "message_ru": "Для этого года не загружен Excel с нагрузкой.", "role": None}],
                    "warnings": [],
                }
            excel_id = int(excel_row[0])

            cur.execute("""
                SELECT id FROM raw_docx_templates WHERE department_id=%s AND academic_year=%s;
            """, (department_id, academic_year))
            raw_template_row = cur.fetchone()
            if not raw_template_row:
                return {
                    "ready": False,
                    "errors": [{"code": "no_raw_template", "message_ru": "Для этого года не загружен DOCX-шаблон ИПП.", "role": None}],
                    "warnings": [],
                }
            raw_template_id = int(raw_template_row[0])

            excel_columns = _get_excel_columns(cur, excel_id)
            raw_tables = _get_raw_tables(cur, raw_template_id)
            settings_cfg = _get_settings_for_excel(cur, excel_id)

        effective_settings_cfg = build_effective_generation_settings(settings_cfg, raw_tables)
        return validate_generation_readiness(
            settings_cfg=effective_settings_cfg,
            excel_columns=excel_columns,
            raw_tables=raw_tables,
        )
    finally:
        conn.close()
