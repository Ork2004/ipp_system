from typing import Any, Dict

from psycopg2.extras import Json

from backend.app.database import get_connection
from backend.app.utils.raw_docx_parser import scan_raw_docx


def store_raw_docx_template(
    *,
    file_path: str,
    department_id: int,
    academic_year: str,
    source_filename: str | None,
) -> Dict[str, Any]:
    scan_result = scan_raw_docx(file_path)
    tables = scan_result.get("tables", [])

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id
                    FROM raw_docx_templates
                    WHERE department_id = %s AND academic_year = %s
                    LIMIT 1;
                    """,
                    (department_id, academic_year),
                )
                existing = cur.fetchone()
                if existing:
                    raise Exception(
                        "Raw шаблон для этого учебного года уже загружен. Удали его и загрузи заново."
                    )

                cur.execute(
                    """
                    INSERT INTO raw_docx_templates (
                        department_id,
                        academic_year,
                        file_path,
                        source_filename,
                        scan_schema,
                        tables_count,
                        status,
                        error_text
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, 'scanned', NULL)
                    RETURNING id;
                    """,
                    (
                        department_id,
                        academic_year,
                        file_path,
                        source_filename,
                        Json(scan_result),
                        len(tables),
                    ),
                )
                raw_template_id = cur.fetchone()[0]

                total_cells_count = 0

                for table_item in tables:
                    cur.execute(
                        """
                        INSERT INTO raw_docx_tables (
                            template_id,
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
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id;
                        """,
                        (
                            raw_template_id,
                            table_item.get("table_index"),
                            table_item.get("section_title"),
                            table_item.get("table_type"),
                            table_item.get("row_count"),
                            table_item.get("col_count"),
                            table_item.get("header_signature"),
                            table_item.get("has_total_row", False),
                            table_item.get("loop_template_row_index"),
                            Json(table_item.get("column_hints", [])),
                            table_item.get("editable_cells_count", 0),
                            table_item.get("prefilled_cells_count", 0),
                            Json(
                                {
                                    "table_index": table_item.get("table_index"),
                                }
                            ),
                        ),
                    )
                    raw_table_id = cur.fetchone()[0]

                    matrix = table_item.get("matrix", []) or []

                    for row in matrix:
                        for cell in row:
                            cur.execute(
                                """
                                INSERT INTO raw_docx_cells (
                                    table_id,
                                    row_index,
                                    col_index,
                                    cell_key,
                                    original_text,
                                    normalized_text,
                                    is_empty,
                                    is_editable,
                                    cell_kind,
                                    extra_meta
                                )
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                                """,
                                (
                                    raw_table_id,
                                    cell.get("row_index"),
                                    cell.get("col_index"),
                                    cell.get("cell_key"),
                                    cell.get("text"),
                                    cell.get("text"),
                                    cell.get("is_empty", False),
                                    cell.get("editable", False),
                                    "text",
                                    Json({}),
                                ),
                            )
                            total_cells_count += 1

        return {
            "raw_template_id": raw_template_id,
            "tables_count": len(tables),
            "cells_count": total_cells_count,
            "scan_result": scan_result,
        }

    finally:
        conn.close()