from fastapi import APIRouter, Depends, HTTPException

from backend.app.database import get_connection
from backend.app.api.auth_api import get_current_user

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
            cur.execute("SELECT department_id FROM teachers WHERE id=%s;", (teacher_id,))
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
                    t.column_hints
                FROM raw_docx_tables t
                WHERE t.template_id=%s
                ORDER BY t.table_index;
            """, (raw_template_id,))
            table_rows = cur.fetchall()

            tables_out = []

            for t in table_rows:
                raw_table_id = t[0]

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
                        v.value_text
                    FROM raw_docx_cells c
                    LEFT JOIN teacher_manual_cell_values v
                      ON v.raw_cell_id = c.id
                     AND v.teacher_id = %s
                    WHERE c.table_id=%s
                    ORDER BY c.row_index, c.col_index;
                """, (teacher_id, raw_table_id))
                cell_rows = cur.fetchall()

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
                    saved_value = c[9]

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
                        "saved_value": saved_value if saved_value is not None else "",
                    }

                    matrix_map.setdefault(row_index, []).append(cell_item)

                    if is_editable:
                        editable_values.append({
                            "raw_cell_id": raw_cell_id,
                            "row_index": row_index,
                            "col_index": col_index,
                            "cell_key": cell_key,
                            "value": saved_value if saved_value is not None else "",
                        })

                matrix = [matrix_map[k] for k in sorted(matrix_map.keys())]

                loop_rows_out = []
                if str(t[3]) == "loop":
                    cur.execute("""
                        SELECT id, row_order
                        FROM teacher_manual_loop_rows
                        WHERE teacher_id=%s
                          AND raw_template_id=%s
                          AND raw_table_id=%s
                        ORDER BY row_order, id;
                    """, (teacher_id, raw_template_id, raw_table_id))
                    loop_rows = cur.fetchall()

                    for lr in loop_rows:
                        loop_row_id = lr[0]
                        row_order = lr[1]

                        cur.execute("""
                            SELECT col_index, value_text
                            FROM teacher_manual_loop_cell_values
                            WHERE loop_row_id=%s
                            ORDER BY col_index;
                        """, (loop_row_id,))
                        vals = cur.fetchall()

                        loop_rows_out.append({
                            "loop_row_id": loop_row_id,
                            "row_order": row_order,
                            "values": [
                                {
                                    "col_index": v[0],
                                    "value": v[1] if v[1] is not None else ""
                                }
                                for v in vals
                            ]
                        })

                tables_out.append({
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
                    "matrix": matrix,
                    "editable_values": editable_values,
                    "loop_rows": loop_rows_out,
                })

        return {
            "raw_template_id": raw_template_id,
            "teacher_id": teacher_id,
            "academic_year": tpl["academic_year"],
            "tables": tables_out,
        }
    finally:
        conn.close()


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
    _check_template_access(user, int(raw_template_id))

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                saved_count = 0

                for item in values:
                    raw_cell_id = item.get("raw_cell_id")
                    value_text = item.get("value", "")

                    if not raw_cell_id:
                        continue

                    cur.execute("""
                        SELECT c.id, c.table_id, t.template_id, t.table_type, c.is_editable
                        FROM raw_docx_cells c
                        JOIN raw_docx_tables t ON t.id = c.table_id
                        WHERE c.id=%s;
                    """, (raw_cell_id,))
                    row = cur.fetchone()
                    if not row:
                        continue

                    _, raw_table_id, template_id, table_type, is_editable = row

                    if int(template_id) != int(raw_template_id):
                        continue

                    if str(table_type) != "static":
                        continue

                    if not is_editable:
                        continue

                    cur.execute("""
                        INSERT INTO teacher_manual_cell_values(
                            teacher_id, raw_template_id, raw_table_id, raw_cell_id, value_text, updated_at
                        )
                        VALUES (%s,%s,%s,%s,%s,now())
                        ON CONFLICT (teacher_id, raw_cell_id)
                        DO UPDATE SET
                            value_text = EXCLUDED.value_text,
                            updated_at = now();
                    """, (
                        teacher_id,
                        raw_template_id,
                        raw_table_id,
                        raw_cell_id,
                        value_text,
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
    _check_template_access(user, int(raw_template_id))

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, template_id, table_type
                    FROM raw_docx_tables
                    WHERE id=%s;
                """, (raw_table_id,))
                tbl = cur.fetchone()
                if not tbl:
                    raise HTTPException(status_code=404, detail="Таблица не найдена")

                if int(tbl[1]) != int(raw_template_id):
                    raise HTTPException(status_code=400, detail="Таблица не принадлежит этому raw_template")

                if str(tbl[2]) != "loop":
                    raise HTTPException(status_code=400, detail="Добавлять строки можно только в loop таблицу")

                cur.execute("""
                    SELECT COALESCE(MAX(row_order), 0)
                    FROM teacher_manual_loop_rows
                    WHERE teacher_id=%s
                      AND raw_template_id=%s
                      AND raw_table_id=%s;
                """, (teacher_id, raw_template_id, raw_table_id))
                max_order = cur.fetchone()[0] or 0
                next_order = int(max_order) + 1

                cur.execute("""
                    INSERT INTO teacher_manual_loop_rows(
                        teacher_id, raw_template_id, raw_table_id, row_order, updated_at
                    )
                    VALUES (%s,%s,%s,%s,now())
                    RETURNING id;
                """, (
                    teacher_id,
                    raw_template_id,
                    raw_table_id,
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
                    SELECT id, teacher_id
                    FROM teacher_manual_loop_rows
                    WHERE id=%s;
                """, (loop_row_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Loop строка не найдена")

                if int(row[1]) != int(teacher_id):
                    raise HTTPException(status_code=403, detail="Нельзя сохранять чужую loop строку")

                saved_count = 0

                for item in values:
                    col_index = item.get("col_index")
                    value_text = item.get("value", "")

                    if col_index is None:
                        continue

                    cur.execute("""
                        INSERT INTO teacher_manual_loop_cell_values(
                            loop_row_id, col_index, value_text, updated_at
                        )
                        VALUES (%s,%s,%s,now())
                        ON CONFLICT (loop_row_id, col_index)
                        DO UPDATE SET
                            value_text = EXCLUDED.value_text,
                            updated_at = now();
                    """, (
                        loop_row_id,
                        int(col_index),
                        value_text,
                    ))
                    saved_count += 1

                cur.execute("""
                    UPDATE teacher_manual_loop_rows
                    SET updated_at = now()
                    WHERE id=%s;
                """, (loop_row_id,))

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
                    SELECT id, teacher_id
                    FROM teacher_manual_loop_rows
                    WHERE id=%s;
                """, (loop_row_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Loop строка не найдена")

                if int(row[1]) != int(teacher_id):
                    raise HTTPException(status_code=403, detail="Нельзя удалять чужую loop строку")

                cur.execute("DELETE FROM teacher_manual_loop_rows WHERE id=%s;", (loop_row_id,))

        return {
            "status": "ok",
            "deleted_loop_row_id": loop_row_id,
        }
    finally:
        conn.close()