import os
from docx import Document
from backend.app.database import get_connection


def generate_docx_from_raw(raw_template_id, teacher_id, excel_template_id):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT file_path
        FROM raw_templates
        WHERE id = %s
        """,
        (raw_template_id,),
    )
    raw = cur.fetchone()
    if not raw:
        raise Exception("raw template not found")

    template_path = raw[0]

    doc = Document(template_path)

    cur.execute(
        """
        SELECT t.id, t.table_index, t.table_type
        FROM raw_tables t
        WHERE t.raw_template_id = %s
        ORDER BY t.table_index
        """,
        (raw_template_id,),
    )
    tables = cur.fetchall()

    cur.execute(
        """
        SELECT column_name, header_text
        FROM excel_columns
        WHERE template_id = %s
        ORDER BY position_index
        """,
        (excel_template_id,),
    )
    excel_columns = cur.fetchall()

    col_map = {c[0]: c[1] for c in excel_columns}

    cur.execute(
        """
        SELECT row_data
        FROM excel_rows
        WHERE template_id = %s AND teacher_id = %s
        """,
        (excel_template_id, teacher_id),
    )
    excel_rows = cur.fetchall()

    excel_data = [r[0] for r in excel_rows]

    for t in tables:
        raw_table_id, table_index, table_type = t

        if table_index >= len(doc.tables):
            continue

        doc_table = doc.tables[table_index]

        if table_type == "static":
            cur.execute(
                """
                SELECT raw_cell_id, row_index, col_index
                FROM raw_cells
                WHERE raw_table_id = %s AND editable = true
                """,
                (raw_table_id,),
            )
            cells = cur.fetchall()

            for c in cells:
                raw_cell_id, row_i, col_i = c

                cur.execute(
                    """
                    SELECT value
                    FROM manual_static_values
                    WHERE raw_cell_id = %s AND teacher_id = %s
                    """,
                    (raw_cell_id, teacher_id),
                )
                val = cur.fetchone()

                value = val[0] if val else ""

                if row_i < len(doc_table.rows) and col_i < len(doc_table.rows[row_i].cells):
                    doc_table.rows[row_i].cells[col_i].text = str(value)

        elif table_type == "loop":
            cur.execute(
                """
                SELECT loop_row_id, row_order
                FROM manual_loop_rows
                WHERE raw_table_id = %s AND teacher_id = %s
                ORDER BY row_order
                """,
                (raw_table_id, teacher_id),
            )
            loop_rows = cur.fetchall()

            cur.execute(
                """
                SELECT loop_template_row_index
                FROM raw_tables
                WHERE id = %s
                """,
                (raw_table_id,),
            )
            tpl_row = cur.fetchone()

            if not tpl_row or tpl_row[0] is None:
                continue

            template_row_index = tpl_row[0]

            if template_row_index >= len(doc_table.rows):
                continue

            template_row = doc_table.rows[template_row_index]

            while len(doc_table.rows) > template_row_index:
                doc_table._tbl.remove(doc_table.rows[template_row_index]._tr)

            for lr in loop_rows:
                loop_row_id = lr[0]

                new_row = doc_table.add_row()

                for col_index in range(len(new_row.cells)):
                    cur.execute(
                        """
                        SELECT value
                        FROM manual_loop_values
                        WHERE loop_row_id = %s AND col_index = %s
                        """,
                        (loop_row_id, col_index),
                    )
                    val = cur.fetchone()
                    value = val[0] if val else ""

                    new_row.cells[col_index].text = str(value)

    output_dir = "generated"
    os.makedirs(output_dir, exist_ok=True)

    filename = f"ipp_teacher_{teacher_id}_{raw_template_id}.docx"
    output_path = os.path.join(output_dir, filename)

    doc.save(output_path)

    return output_path