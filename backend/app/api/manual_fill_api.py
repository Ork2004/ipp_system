from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from psycopg2.extras import Json

from backend.app.config import DOCX_DIR
from backend.app.api.auth_api import get_current_user
from backend.app.database import get_connection
from backend.app.utils.manual_docx_importer import import_manual_docx
from backend.app.utils.manual_prefill import build_prefill_payload
from backend.app.utils.storage import save_upload_file
from backend.app.utils.teaching_load import (
    build_effective_generation_settings,
    extract_excel_bound_raw_table_ids_with_raw_tables,
)

router = APIRouter(prefix="/manual-fill", tags=["Manual Fill"])


def _role_guard(user: dict):
    if user.get("role") not in ("admin", "teacher"):
        raise HTTPException(status_code=403, detail="Доступ только admin и teacher")


def _resolve_teacher_id(user: dict, requested_teacher_id: int | None) -> int:
    role = user.get("role")

    if role == "teacher":
        my_teacher_id = user.get("teacher_id")
        if not my_teacher_id:
            raise HTTPException(status_code=403, detail="teacher_id не привязан к аккаунту")
        if requested_teacher_id and int(requested_teacher_id) != int(my_teacher_id):
            raise HTTPException(status_code=403, detail="Преподаватель может работать только со своими данными")
        return int(my_teacher_id)

    if role == "admin":
        if not requested_teacher_id:
            raise HTTPException(status_code=400, detail="teacher_id обязателен для admin")
        return int(requested_teacher_id)

    raise HTTPException(status_code=403, detail="Недостаточно прав")


def _check_teacher_department_access(user: dict, teacher_id: int):
    role = user.get("role")
    if role != "admin":
        return

    admin_dep = user.get("department_id")
    if not admin_dep:
        raise HTTPException(status_code=403, detail="У админа нет department_id")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT department_id
                FROM teachers
                WHERE id=%s;
            """, (teacher_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Преподаватель не найден")
            if int(row[0]) != int(admin_dep):
                raise HTTPException(status_code=403, detail="Нельзя работать с преподавателем другой кафедры")
    finally:
        conn.close()


def _get_raw_template(cur, raw_template_id: int):
    cur.execute("""
        SELECT id, department_id, academic_year
        FROM raw_docx_templates
        WHERE id=%s;
    """, (raw_template_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Raw шаблон не найден")
    return {
        "id": row[0],
        "department_id": row[1],
        "academic_year": row[2],
    }


def _check_template_access(user: dict, raw_template_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            tpl = _get_raw_template(cur, raw_template_id)

        if user.get("role") == "admin":
            if int(user.get("department_id") or 0) != int(tpl["department_id"]):
                raise HTTPException(status_code=403, detail="Нельзя работать с шаблоном другой кафедры")
        return tpl
    finally:
        conn.close()


def _load_raw_table(cur, raw_table_id: int):
    cur.execute("""
        SELECT
            t.id,
            t.template_id,
            t.table_index,
            t.section_title,
            t.table_type,
            t.row_count,
            t.col_count,
            t.header_signature,
            t.has_total_row,
            t.loop_template_row_index,
            t.column_hints,
            t.table_fingerprint,
            t.structure_meta,
            t.extra_meta
        FROM raw_docx_tables t
        WHERE t.id=%s;
    """, (raw_table_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Таблица raw шаблона не найдена")

    return {
        "id": row[0],
        "template_id": row[1],
        "table_index": row[2],
        "section_title": row[3],
        "table_type": row[4],
        "row_count": row[5],
        "col_count": row[6],
        "header_signature": row[7],
        "has_total_row": row[8],
        "loop_template_row_index": row[9],
        "column_hints": row[10] or [],
        "table_fingerprint": row[11],
        "structure_meta": row[12] or {},
        "extra_meta": row[13] or {},
    }


def _load_raw_table_matrix(cur, raw_table_id: int):
    cur.execute("""
        SELECT
            c.id,
            c.row_index,
            c.col_index,
            c.cell_key,
            c.original_text,
            c.normalized_text,
            c.is_empty,
            c.is_editable,
            c.cell_kind,
            c.semantic_key,
            c.row_signature,
            c.column_hint_text
        FROM raw_docx_cells c
        WHERE c.table_id=%s
        ORDER BY c.row_index, c.col_index;
    """, (raw_table_id,))
    cell_rows = cur.fetchall() or []

    matrix_map = {}
    editable_values = []

    for c in cell_rows:
        raw_cell_id = c[0]
        row_index = c[1]
        col_index = c[2]
        cell_key = c[3]
        original_text = c[4]
        normalized_text = c[5]
        is_empty = c[6]
        is_editable = c[7]
        cell_kind = c[8]
        semantic_key = c[9]
        row_signature = c[10]
        column_hint_text = c[11]

        cell_item = {
            "raw_cell_id": raw_cell_id,
            "row_index": row_index,
            "col_index": col_index,
            "cell_key": cell_key,
            "text": original_text,
            "normalized_text": normalized_text,
            "is_empty": is_empty,
            "editable": is_editable,
            "cell_kind": cell_kind,
            "semantic_key": semantic_key,
            "row_signature": row_signature,
            "column_hint_text": column_hint_text,
            "saved_value": "",
        }

        matrix_map.setdefault(row_index, []).append(cell_item)

        if is_editable:
            editable_values.append({
                "raw_cell_id": raw_cell_id,
                "row_index": row_index,
                "col_index": col_index,
                "cell_key": cell_key,
                "semantic_key": semantic_key,
                "row_signature": row_signature,
                "column_hint_text": column_hint_text,
                "value": "",
            })

    matrix = [matrix_map[k] for k in sorted(matrix_map.keys())]
    return matrix, editable_values


def _load_current_snapshot(cur, teacher_id: int, academic_year: str, raw_table_id: int):
    cur.execute("""
        SELECT
            id,
            teacher_id,
            academic_year,
            raw_template_id,
            raw_table_id,
            department_id,
            section_title,
            table_type,
            header_signature,
            column_hints,
            table_fingerprint,
            source_mode,
            prefilled_from_snapshot_id,
            created_at,
            updated_at
        FROM teacher_manual_table_snapshots
        WHERE teacher_id=%s
          AND academic_year=%s
          AND raw_table_id=%s
        LIMIT 1;
    """, (teacher_id, academic_year, raw_table_id))
    row = cur.fetchone()
    if not row:
        return None

    return {
        "id": row[0],
        "teacher_id": row[1],
        "academic_year": row[2],
        "raw_template_id": row[3],
        "raw_table_id": row[4],
        "department_id": row[5],
        "section_title": row[6],
        "table_type": row[7],
        "header_signature": row[8],
        "column_hints": row[9] or [],
        "table_fingerprint": row[10],
        "source_mode": row[11],
        "prefilled_from_snapshot_id": row[12],
        "created_at": row[13],
        "updated_at": row[14],
    }


def _delete_current_snapshot_if_exists(cur, teacher_id: int, academic_year: str, raw_table_id: int):
    cur.execute("""
        DELETE FROM teacher_manual_table_snapshots
        WHERE teacher_id=%s
          AND academic_year=%s
          AND raw_table_id=%s;
    """, (teacher_id, academic_year, raw_table_id))


def _create_snapshot(
    cur,
    *,
    teacher_id: int,
    academic_year: str,
    raw_template_id: int,
    raw_table_id: int,
    department_id: int | None,
    section_title: str,
    table_type: str,
    header_signature: str,
    column_hints,
    table_fingerprint: str,
    source_mode: str,
    prefilled_from_snapshot_id: int | None,
):
    cur.execute("""
        INSERT INTO teacher_manual_table_snapshots(
            teacher_id,
            academic_year,
            raw_template_id,
            raw_table_id,
            department_id,
            section_title,
            table_type,
            header_signature,
            column_hints,
            table_fingerprint,
            source_mode,
            prefilled_from_snapshot_id,
            created_at,
            updated_at
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),now())
        RETURNING id;
    """, (
        teacher_id,
        academic_year,
        raw_template_id,
        raw_table_id,
        department_id,
        section_title,
        table_type,
        header_signature,
        Json(column_hints or []),
        table_fingerprint,
        source_mode,
        prefilled_from_snapshot_id,
    ))
    return cur.fetchone()[0]


def _load_current_static_values(cur, snapshot_id: int):
    cur.execute("""
        SELECT
            raw_cell_id,
            row_index,
            col_index,
            cell_key,
            semantic_key,
            row_signature,
            column_hint_text,
            value_text
        FROM teacher_manual_static_cell_values
        WHERE snapshot_id=%s
        ORDER BY row_index, col_index, id;
    """, (snapshot_id,))
    rows = cur.fetchall() or []

    return [
        {
            "raw_cell_id": r[0],
            "row_index": r[1],
            "col_index": r[2],
            "cell_key": r[3],
            "semantic_key": r[4],
            "row_signature": r[5],
            "column_hint_text": r[6],
            "value": r[7] if r[7] is not None else "",
        }
        for r in rows
    ]


def _load_current_loop_rows(cur, snapshot_id: int):
    cur.execute("""
        SELECT id, row_order
        FROM teacher_manual_loop_rows
        WHERE snapshot_id=%s
        ORDER BY row_order, id;
    """, (snapshot_id,))
    loop_rows = cur.fetchall() or []

    out = []
    for lr in loop_rows:
        loop_row_id = lr[0]
        row_order = lr[1]

        cur.execute("""
            SELECT col_index, value_text, column_hint_text, semantic_key
            FROM teacher_manual_loop_cell_values
            WHERE loop_row_id=%s
            ORDER BY col_index, id;
        """, (loop_row_id,))
        vals = cur.fetchall() or []

        out.append({
            "loop_row_id": loop_row_id,
            "row_order": row_order,
            "values": [
                {
                    "col_index": v[0],
                    "value": v[1] if v[1] is not None else "",
                    "column_hint_text": v[2],
                    "semantic_key": v[3],
                }
                for v in vals
            ]
        })

    return out


def _load_generation_settings_config(cur, department_id: int, academic_year: str) -> dict:
    cur.execute(
        """
        SELECT gs.config
        FROM generation_settings gs
        JOIN excel_templates et ON et.id = gs.excel_template_id
        WHERE et.department_id = %s
          AND et.academic_year = %s
        LIMIT 1;
        """,
        (department_id, academic_year),
    )
    row = cur.fetchone()
    if not row:
        return {}
    return row[0] or {}


@router.get("/form")
def get_manual_fill_form(
    raw_template_id: int,
    teacher_id: int | None = None,
    user=Depends(get_current_user),
):
    _role_guard(user)

    teacher_id = _resolve_teacher_id(user, teacher_id)
    _check_teacher_department_access(user, teacher_id)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            tpl = _get_raw_template(cur, raw_template_id)
            if user.get("role") == "admin":
                if int(user.get("department_id") or 0) != int(tpl["department_id"]):
                    raise HTTPException(status_code=403, detail="Шаблон другой кафедры")

            cur.execute("""
                SELECT
                    t.id,
                    t.table_index,
                    t.section_title,
                    t.table_type,
                    t.row_count,
                    t.col_count,
                    t.header_signature,
                    t.has_total_row,
                    t.loop_template_row_index,
                    t.column_hints,
                    t.table_fingerprint,
                    t.structure_meta,
                    t.extra_meta
                FROM raw_docx_tables t
                WHERE t.template_id=%s
                ORDER BY t.table_index;
            """, (raw_template_id,))
            table_rows = cur.fetchall() or []
            raw_table_meta_list = [
                {
                    "id": row[0],
                    "table_index": row[1],
                    "section_title": row[2],
                    "table_type": row[3],
                    "row_count": row[4],
                    "col_count": row[5],
                    "header_signature": row[6],
                    "has_total_row": row[7],
                    "loop_template_row_index": row[8],
                    "column_hints": row[9] or [],
                    "table_fingerprint": row[10],
                    "structure_meta": row[11] or {},
                    "extra_meta": row[12] or {},
                }
                for row in table_rows
            ]
            settings_cfg = _load_generation_settings_config(
                cur,
                int(tpl["department_id"]),
                str(tpl["academic_year"]),
            )
            effective_settings_cfg = build_effective_generation_settings(settings_cfg, raw_table_meta_list)
            excel_bound_raw_table_ids = extract_excel_bound_raw_table_ids_with_raw_tables(
                effective_settings_cfg,
                raw_table_meta_list,
            )

            tables_out = []

            for t in table_rows:
                raw_table_id = t[0]

                table_meta = {
                    "id": raw_table_id,
                    "template_id": raw_template_id,
                    "table_index": t[1],
                    "section_title": t[2],
                    "table_type": t[3],
                    "row_count": t[4],
                    "col_count": t[5],
                    "header_signature": t[6],
                    "has_total_row": t[7],
                    "loop_template_row_index": t[8],
                    "column_hints": t[9] or [],
                    "table_fingerprint": t[10],
                    "structure_meta": t[11] or {},
                    "extra_meta": t[12] or {},
                }
                is_excel_bound = int(raw_table_id) in excel_bound_raw_table_ids

                matrix, editable_values = _load_raw_table_matrix(cur, raw_table_id)

                current_snapshot = _load_current_snapshot(
                    cur,
                    teacher_id=teacher_id,
                    academic_year=tpl["academic_year"],
                    raw_table_id=raw_table_id,
                )

                prefill_info = {
                    "found": False,
                    "source_snapshot_id": None,
                    "source_academic_year": None,
                    "table_type": table_meta["table_type"],
                    "static_values": [],
                    "loop_rows": [],
                }

                loop_rows_out = []

                if is_excel_bound:
                    source_snapshot_id = None
                    source_academic_year = None
                    source_mode = "excel_bound"
                    prefilled_from_snapshot_id = None
                elif current_snapshot:
                    if table_meta["table_type"] == "static":
                        current_values = _load_current_static_values(cur, current_snapshot["id"])
                        value_map = {
                            (int(v["row_index"]), int(v["col_index"])): v["value"]
                            for v in current_values
                        }

                        patched_editable_values = []
                        for item in editable_values:
                            value = value_map.get((int(item["row_index"]), int(item["col_index"])), "")
                            patched_item = dict(item)
                            patched_item["value"] = value
                            patched_editable_values.append(patched_item)

                        editable_values = patched_editable_values
                    else:
                        loop_rows_out = _load_current_loop_rows(cur, current_snapshot["id"])

                    source_snapshot_id = current_snapshot["id"]
                    source_academic_year = current_snapshot["academic_year"]
                    source_mode = current_snapshot["source_mode"]
                    prefilled_from_snapshot_id = current_snapshot["prefilled_from_snapshot_id"]

                else:
                    prefill_info = build_prefill_payload(
                        cur,
                        teacher_id=teacher_id,
                        academic_year=tpl["academic_year"],
                        current_table=table_meta,
                        current_matrix=matrix,
                    )

                    if table_meta["table_type"] == "static":
                        prefill_map = {
                            (int(v["row_index"]), int(v["col_index"])): v["value"]
                            for v in (prefill_info.get("static_values") or [])
                        }

                        patched_editable_values = []
                        for item in editable_values:
                            value = prefill_map.get((int(item["row_index"]), int(item["col_index"])), "")
                            patched_item = dict(item)
                            patched_item["value"] = value
                            patched_item["from_previous_year"] = value != ""
                            patched_editable_values.append(patched_item)

                        editable_values = patched_editable_values
                    else:
                        for row in (prefill_info.get("loop_rows") or []):
                            loop_rows_out.append({
                                "loop_row_id": None,
                                "row_order": row.get("row_order"),
                                "values": [
                                    {
                                        "col_index": cell.get("col_index"),
                                        "value": cell.get("value", ""),
                                        "column_hint_text": cell.get("column_hint_text"),
                                        "semantic_key": None,
                                        "from_previous_year": True,
                                    }
                                    for cell in (row.get("cells") or [])
                                ]
                            })

                    source_snapshot_id = prefill_info.get("source_snapshot_id")
                    source_academic_year = prefill_info.get("source_academic_year")
                    source_mode = "prefilled" if prefill_info.get("found") else None
                    prefilled_from_snapshot_id = prefill_info.get("source_snapshot_id")

                tables_out.append({
                    "id": raw_table_id,
                    "table_index": table_meta["table_index"],
                    "section_title": table_meta["section_title"],
                    "table_type": table_meta["table_type"],
                    "row_count": table_meta["row_count"],
                    "col_count": table_meta["col_count"],
                    "header_signature": table_meta["header_signature"],
                    "has_total_row": table_meta["has_total_row"],
                    "loop_template_row_index": table_meta["loop_template_row_index"],
                    "column_hints": table_meta["column_hints"],
                    "table_fingerprint": table_meta["table_fingerprint"],
                    "structure_meta": table_meta["structure_meta"],
                    "extra_meta": table_meta["extra_meta"],
                    "matrix": matrix,
                    "editable_values": editable_values,
                    "loop_rows": loop_rows_out,
                    "excel_bound": is_excel_bound,
                    "prefill": {
                        "found": bool(prefill_info.get("found")) if not current_snapshot and not is_excel_bound else False,
                        "source_snapshot_id": source_snapshot_id,
                        "source_academic_year": source_academic_year,
                        "source_mode": source_mode,
                        "prefilled_from_snapshot_id": prefilled_from_snapshot_id,
                    }
                })

        return {
            "raw_template_id": raw_template_id,
            "teacher_id": teacher_id,
            "academic_year": tpl["academic_year"],
            "tables": tables_out,
        }
    finally:
        conn.close()


@router.post("/import-docx")
def import_manual_docx_file(
    raw_template_id: int = Form(...),
    file: UploadFile = File(...),
    teacher_id: int | None = Form(None),
    user=Depends(get_current_user),
):
    _role_guard(user)

    teacher_id = _resolve_teacher_id(user, teacher_id)
    _check_teacher_department_access(user, teacher_id)
    tpl = _check_template_access(user, int(raw_template_id))
    saved_path = save_upload_file(file, DOCX_DIR, allowed_exts={".docx"})

    try:
        result = import_manual_docx(
            file_path=saved_path,
            teacher_id=teacher_id,
            department_id=int(tpl["department_id"]),
            academic_year=str(tpl["academic_year"]),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        **result,
        "raw_template_id": int(raw_template_id),
        "teacher_id": teacher_id,
        "saved_path": saved_path,
    }


@router.post("/save-static")
def save_static_values(
    payload: dict,
    user=Depends(get_current_user),
):
    _role_guard(user)

    raw_template_id = payload.get("raw_template_id")
    teacher_id = payload.get("teacher_id")
    values = payload.get("values")

    if not raw_template_id or not isinstance(values, list):
        raise HTTPException(status_code=400, detail="raw_template_id и values(list) обязательны")

    teacher_id = _resolve_teacher_id(user, teacher_id)
    _check_teacher_department_access(user, teacher_id)
    tpl = _check_template_access(user, int(raw_template_id))

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                grouped_by_table = {}

                for item in values:
                    raw_cell_id = item.get("raw_cell_id")
                    value_text = item.get("value", "")

                    if not raw_cell_id:
                        continue

                    cur.execute("""
                        SELECT
                            c.id,
                            c.table_id,
                            c.row_index,
                            c.col_index,
                            c.cell_key,
                            c.semantic_key,
                            c.row_signature,
                            c.column_hint_text,
                            c.is_editable,
                            t.template_id,
                            t.table_type,
                            t.section_title,
                            t.header_signature,
                            t.column_hints,
                            t.table_fingerprint
                        FROM raw_docx_cells c
                        JOIN raw_docx_tables t ON t.id = c.table_id
                        WHERE c.id=%s;
                    """, (raw_cell_id,))
                    row = cur.fetchone()
                    if not row:
                        continue

                    (
                        cell_id,
                        raw_table_id,
                        row_index,
                        col_index,
                        cell_key,
                        semantic_key,
                        row_signature,
                        column_hint_text,
                        is_editable,
                        template_id,
                        table_type,
                        section_title,
                        header_signature,
                        column_hints,
                        table_fingerprint,
                    ) = row

                    if int(template_id) != int(raw_template_id):
                        continue

                    if str(table_type) != "static":
                        continue

                    if not is_editable:
                        continue

                    grouped_by_table.setdefault(raw_table_id, {
                        "raw_table_id": raw_table_id,
                        "section_title": section_title,
                        "table_type": table_type,
                        "header_signature": header_signature,
                        "column_hints": column_hints or [],
                        "table_fingerprint": table_fingerprint,
                        "cells": [],
                    })

                    grouped_by_table[raw_table_id]["cells"].append({
                        "raw_cell_id": cell_id,
                        "row_index": row_index,
                        "col_index": col_index,
                        "cell_key": cell_key,
                        "semantic_key": semantic_key,
                        "row_signature": row_signature,
                        "column_hint_text": column_hint_text,
                        "value": value_text,
                    })

                saved_count = 0

                for raw_table_id, table_data in grouped_by_table.items():
                    existing_snapshot = _load_current_snapshot(
                        cur,
                        teacher_id=teacher_id,
                        academic_year=tpl["academic_year"],
                        raw_table_id=raw_table_id,
                    )

                    source_mode = "manual"
                    prefilled_from_snapshot_id = None

                    if existing_snapshot and existing_snapshot.get("source_mode") == "prefilled":
                        source_mode = "mixed"
                        prefilled_from_snapshot_id = existing_snapshot.get("prefilled_from_snapshot_id")
                    elif existing_snapshot and existing_snapshot.get("source_mode") == "mixed":
                        source_mode = "mixed"
                        prefilled_from_snapshot_id = existing_snapshot.get("prefilled_from_snapshot_id")

                    _delete_current_snapshot_if_exists(
                        cur,
                        teacher_id=teacher_id,
                        academic_year=tpl["academic_year"],
                        raw_table_id=raw_table_id,
                    )

                    snapshot_id = _create_snapshot(
                        cur,
                        teacher_id=teacher_id,
                        academic_year=tpl["academic_year"],
                        raw_template_id=int(raw_template_id),
                        raw_table_id=raw_table_id,
                        department_id=tpl["department_id"],
                        section_title=table_data["section_title"],
                        table_type=table_data["table_type"],
                        header_signature=table_data["header_signature"],
                        column_hints=table_data["column_hints"],
                        table_fingerprint=table_data["table_fingerprint"],
                        source_mode=source_mode,
                        prefilled_from_snapshot_id=prefilled_from_snapshot_id,
                    )

                    for cell in table_data["cells"]:
                        cur.execute("""
                            INSERT INTO teacher_manual_static_cell_values(
                                snapshot_id,
                                raw_cell_id,
                                row_index,
                                col_index,
                                cell_key,
                                semantic_key,
                                row_signature,
                                column_hint_text,
                                value_text,
                                created_at,
                                updated_at
                            )
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),now());
                        """, (
                            snapshot_id,
                            cell["raw_cell_id"],
                            cell["row_index"],
                            cell["col_index"],
                            cell["cell_key"],
                            cell["semantic_key"],
                            cell["row_signature"],
                            cell["column_hint_text"],
                            cell["value"],
                        ))
                        saved_count += 1

        return {
            "status": "ok",
            "saved_count": saved_count,
            "teacher_id": teacher_id,
            "raw_template_id": int(raw_template_id),
        }
    finally:
        conn.close()


@router.post("/add-loop-row")
def add_loop_row(
    payload: dict,
    user=Depends(get_current_user),
):
    _role_guard(user)

    raw_template_id = payload.get("raw_template_id")
    raw_table_id = payload.get("raw_table_id")
    teacher_id = payload.get("teacher_id")

    if not raw_template_id or not raw_table_id:
        raise HTTPException(status_code=400, detail="raw_template_id и raw_table_id обязательны")

    teacher_id = _resolve_teacher_id(user, teacher_id)
    _check_teacher_department_access(user, teacher_id)
    tpl = _check_template_access(user, int(raw_template_id))

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                raw_table = _load_raw_table(cur, int(raw_table_id))

                if int(raw_table["template_id"]) != int(raw_template_id):
                    raise HTTPException(status_code=400, detail="Таблица не принадлежит этому raw_template")

                if str(raw_table["table_type"]) != "loop":
                    raise HTTPException(status_code=400, detail="Добавлять строки можно только в loop таблицу")

                snapshot = _load_current_snapshot(
                    cur,
                    teacher_id=teacher_id,
                    academic_year=tpl["academic_year"],
                    raw_table_id=int(raw_table_id),
                )

                if not snapshot:
                    snapshot_id = _create_snapshot(
                        cur,
                        teacher_id=teacher_id,
                        academic_year=tpl["academic_year"],
                        raw_template_id=int(raw_template_id),
                        raw_table_id=int(raw_table_id),
                        department_id=tpl["department_id"],
                        section_title=raw_table["section_title"],
                        table_type=raw_table["table_type"],
                        header_signature=raw_table["header_signature"],
                        column_hints=raw_table["column_hints"],
                        table_fingerprint=raw_table["table_fingerprint"],
                        source_mode="manual",
                        prefilled_from_snapshot_id=None,
                    )
                else:
                    snapshot_id = snapshot["id"]

                cur.execute("""
                    SELECT COALESCE(MAX(row_order), 0)
                    FROM teacher_manual_loop_rows
                    WHERE snapshot_id=%s;
                """, (snapshot_id,))
                max_order = cur.fetchone()[0] or 0
                next_order = int(max_order) + 1

                cur.execute("""
                    INSERT INTO teacher_manual_loop_rows(
                        snapshot_id,
                        row_order,
                        created_at,
                        updated_at
                    )
                    VALUES (%s,%s,now(),now())
                    RETURNING id;
                """, (
                    snapshot_id,
                    next_order,
                ))
                loop_row_id = cur.fetchone()[0]

        return {
            "status": "ok",
            "loop_row_id": loop_row_id,
            "row_order": next_order,
        }
    finally:
        conn.close()


@router.post("/save-loop-row")
def save_loop_row(
    payload: dict,
    user=Depends(get_current_user),
):
    _role_guard(user)

    teacher_id = payload.get("teacher_id")
    loop_row_id = payload.get("loop_row_id")
    values = payload.get("values")

    if not loop_row_id or not isinstance(values, list):
        raise HTTPException(status_code=400, detail="loop_row_id и values(list) обязательны")

    teacher_id = _resolve_teacher_id(user, teacher_id)
    _check_teacher_department_access(user, teacher_id)

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        lr.id,
                        s.teacher_id,
                        s.id,
                        s.source_mode,
                        s.prefilled_from_snapshot_id
                    FROM teacher_manual_loop_rows lr
                    JOIN teacher_manual_table_snapshots s ON s.id = lr.snapshot_id
                    WHERE lr.id=%s;
                """, (loop_row_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Loop строка не найдена")

                _, snapshot_teacher_id, snapshot_id, source_mode, prefilled_from_snapshot_id = row

                if int(snapshot_teacher_id) != int(teacher_id):
                    raise HTTPException(status_code=403, detail="Нельзя сохранять чужую loop строку")

                saved_count = 0

                for item in values:
                    col_index = item.get("col_index")
                    value_text = item.get("value", "")
                    column_hint_text = item.get("column_hint_text")
                    semantic_key = item.get("semantic_key")

                    if col_index is None:
                        continue

                    cur.execute("""
                        INSERT INTO teacher_manual_loop_cell_values(
                            loop_row_id,
                            col_index,
                            column_hint_text,
                            semantic_key,
                            value_text,
                            created_at,
                            updated_at
                        )
                        VALUES (%s,%s,%s,%s,%s,now(),now())
                        ON CONFLICT (loop_row_id, col_index)
                        DO UPDATE SET
                            column_hint_text = EXCLUDED.column_hint_text,
                            semantic_key = EXCLUDED.semantic_key,
                            value_text = EXCLUDED.value_text,
                            updated_at = now();
                    """, (
                        loop_row_id,
                        int(col_index),
                        column_hint_text,
                        semantic_key,
                        value_text,
                    ))
                    saved_count += 1

                cur.execute("""
                    UPDATE teacher_manual_loop_rows
                    SET updated_at = now()
                    WHERE id=%s;
                """, (loop_row_id,))

                next_source_mode = "manual"
                if source_mode == "prefilled":
                    next_source_mode = "mixed"
                elif source_mode == "mixed":
                    next_source_mode = "mixed"

                cur.execute("""
                    UPDATE teacher_manual_table_snapshots
                    SET source_mode=%s,
                        prefilled_from_snapshot_id=%s,
                        updated_at=now()
                    WHERE id=%s;
                """, (
                    next_source_mode,
                    prefilled_from_snapshot_id,
                    snapshot_id,
                ))

        return {
            "status": "ok",
            "loop_row_id": int(loop_row_id),
            "saved_count": saved_count,
        }
    finally:
        conn.close()


@router.delete("/loop-row/{loop_row_id}")
def delete_loop_row(
    loop_row_id: int,
    teacher_id: int | None = None,
    user=Depends(get_current_user),
):
    _role_guard(user)

    teacher_id = _resolve_teacher_id(user, teacher_id)
    _check_teacher_department_access(user, teacher_id)

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        lr.id,
                        s.teacher_id
                    FROM teacher_manual_loop_rows lr
                    JOIN teacher_manual_table_snapshots s ON s.id = lr.snapshot_id
                    WHERE lr.id=%s;
                """, (loop_row_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Loop строка не найдена")

                if int(row[1]) != int(teacher_id):
                    raise HTTPException(status_code=403, detail="Нельзя удалять чужую loop строку")

                cur.execute("""
                    DELETE FROM teacher_manual_loop_rows
                    WHERE id=%s;
                """, (loop_row_id,))

        return {
            "status": "ok",
            "deleted_loop_row_id": loop_row_id,
        }
    finally:
        conn.close()
