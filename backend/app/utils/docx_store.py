from psycopg2.extras import Json

from backend.app.database import get_connection
from backend.app.utils.docx_parser import analyze_docx


def store_docx_template(
    file_path: str,
    department_id: int,
    academic_year: str,
    excel_template_id: int,
    source_filename: str | None
) -> int:
    placeholder_schema, placeholders = analyze_docx(file_path)

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE docx_templates
                    SET is_active = FALSE
                    WHERE department_id=%s AND academic_year=%s AND is_active=TRUE;
                """, (department_id, academic_year))

                cur.execute("""
                    INSERT INTO docx_templates(
                        department_id, academic_year,
                        excel_template_id,
                        original_file_path, current_file_path, source_filename,
                        placeholder_schema, version,
                        status, error_text, is_active
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,1,'parsed',NULL,TRUE)
                    RETURNING id;
                """, (
                    department_id, academic_year,
                    excel_template_id,
                    file_path, file_path, source_filename,
                    Json(placeholder_schema),
                ))
                docx_template_id = cur.fetchone()[0]

                for p in placeholders:
                    cur.execute("""
                        INSERT INTO docx_placeholders(template_id, placeholder_name, placeholder_type, extra_meta)
                        VALUES (%s,%s,%s,%s);
                    """, (
                        docx_template_id,
                        p["placeholder_name"],
                        p["placeholder_type"],
                        Json(p["extra_meta"]) if p.get("extra_meta") is not None else None
                    ))

        return docx_template_id
    finally:
        conn.close()
