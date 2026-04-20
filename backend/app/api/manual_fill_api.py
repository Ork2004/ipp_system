from fastapi import APIRouter, HTTPException, Query
from psycopg2.extras import RealDictCursor, Json

from backend.app.database import get_connection

router = APIRouter(prefix="/manual-tables", tags=["manual-tables"])

def get_prev_year(year: str) -> str | None:
    try:
        y = int(year)
        return str(y - 1)
    except Exception:
        return None


def get_best_previous_snapshot(cur, teacher_id, current_table):
    prev_year = get_prev_year(current_table["academic_year"])
    if not prev_year:
        return None

    cur.execute("""
        SELECT *
        FROM teacher_manual_table_snapshots
        WHERE teacher_id = %s
        AND academic_year = %s
        AND table_fingerprint = %s
        ORDER BY updated_at DESC
        LIMIT 1
    """, (
        teacher_id,
        prev_year,
        current_table["table_fingerprint"]
    ))

    row = cur.fetchone()
    if row:
        return row

    cur.execute("""
        SELECT *
        FROM teacher_manual_table_snapshots
        WHERE teacher_id = %s
        AND academic_year = %s
        AND table_type = %s
        AND section_title ILIKE %s
        ORDER BY updated_at DESC
        LIMIT 1
    """, (
        teacher_id,
        prev_year,
        current_table["table_type"],
        f"%{current_table['section_title'][:20]}%"
    ))

    return cur.fetchone()

@router.get("/prefill")
def get_tables_with_prefill(
    teacher_id: int = Query(...),
    raw_template_id: int = Query(...),
    academic_year: str = Query(...)
):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            cur.execute("""
                SELECT *
                FROM raw_docx_tables
                WHERE template_id = %s
                ORDER BY table_index
            """, (raw_template_id,))
            tables = cur.fetchall()

            result = []

            for table in tables:
                table_data = {
                    "table_id": table["id"],
                    "table_index": table["table_index"],
                    "section_title": table["section_title"],
                    "table_type": table["table_type"],
                    "prefilled": False,
                    "data": None
                }

                cur.execute("""
                    SELECT *
                    FROM teacher_manual_table_snapshots
                    WHERE teacher_id = %s
                    AND academic_year = %s
                    AND raw_table_id = %s
                    LIMIT 1
                """, (teacher_id, academic_year, table["id"]))

                current_snapshot = cur.fetchone()

                if current_snapshot:
                    table_data["data"] = load_snapshot_data(cur, current_snapshot)
                    result.append(table_data)
                    continue

                table_with_year = dict(table)
                table_with_year["academic_year"] = academic_year

                prev_snapshot = get_best_previous_snapshot(
                    cur, teacher_id, table_with_year
                )

                if prev_snapshot:
                    table_data["prefilled"] = True
                    table_data["data"] = load_snapshot_data(cur, prev_snapshot)

                result.append(table_data)

            return result

    finally:
        conn.close()

def load_snapshot_data(cur, snapshot):
    if snapshot["table_type"] == "static":
        cur.execute("""
            SELECT row_index, col_index, value_text
            FROM teacher_manual_static_cell_values
            WHERE snapshot_id = %s
        """, (snapshot["id"],))

        cells = cur.fetchall()

        return {
            "type": "static",
            "cells": cells
        }

    else:
        cur.execute("""
            SELECT id, row_order
            FROM teacher_manual_loop_rows
            WHERE snapshot_id = %s
            ORDER BY row_order
        """, (snapshot["id"],))

        rows = cur.fetchall()

        result_rows = []

        for row in rows:
            cur.execute("""
                SELECT col_index, value_text
                FROM teacher_manual_loop_cell_values
                WHERE loop_row_id = %s
            """, (row["id"],))

            cells = cur.fetchall()

            result_rows.append({
                "row_order": row["row_order"],
                "cells": cells
            })

        return {
            "type": "loop",
            "rows": result_rows
        }

@router.post("/save")
def save_manual_table(
    teacher_id: int,
    raw_template_id: int,
    raw_table_id: int,
    academic_year: str,
    data: dict
):
    conn = get_connection()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:

                cur.execute("""
                    SELECT *
                    FROM raw_docx_tables
                    WHERE id = %s
                """, (raw_table_id,))
                table = cur.fetchone()

                if not table:
                    raise HTTPException(404, "Table not found")

                cur.execute("""
                    DELETE FROM teacher_manual_table_snapshots
                    WHERE teacher_id = %s
                    AND academic_year = %s
                    AND raw_table_id = %s
                """, (teacher_id, academic_year, raw_table_id))

                cur.execute("""
                    INSERT INTO teacher_manual_table_snapshots (
                        teacher_id,
                        academic_year,
                        raw_template_id,
                        raw_table_id,
                        section_title,
                        table_type,
                        header_signature,
                        column_hints,
                        table_fingerprint,
                        source_mode
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    RETURNING id
                """, (
                    teacher_id,
                    academic_year,
                    raw_template_id,
                    raw_table_id,
                    table["section_title"],
                    table["table_type"],
                    table["header_signature"],
                    Json(table["column_hints"]),
                    table["table_fingerprint"],
                    "manual"
                ))

                snapshot_id = cur.fetchone()["id"]

                if table["table_type"] == "static":
                    for cell in data.get("cells", []):
                        cur.execute("""
                            INSERT INTO teacher_manual_static_cell_values (
                                snapshot_id,
                                row_index,
                                col_index,
                                value_text
                            )
                            VALUES (%s,%s,%s,%s)
                        """, (
                            snapshot_id,
                            cell["row_index"],
                            cell["col_index"],
                            cell.get("value_text")
                        ))

                else:
                    for i, row in enumerate(data.get("rows", []), start=1):
                        cur.execute("""
                            INSERT INTO teacher_manual_loop_rows (
                                snapshot_id,
                                row_order
                            )
                            VALUES (%s,%s)
                            RETURNING id
                        """, (snapshot_id, i))

                        loop_row_id = cur.fetchone()["id"]

                        for cell in row.get("cells", []):
                            cur.execute("""
                                INSERT INTO teacher_manual_loop_cell_values (
                                    loop_row_id,
                                    col_index,
                                    value_text
                                )
                                VALUES (%s,%s,%s)
                            """, (
                                loop_row_id,
                                cell["col_index"],
                                cell.get("value_text")
                            ))

        return {"status": "saved"}

    finally:
        conn.close()