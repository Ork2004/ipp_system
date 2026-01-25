from pathlib import Path
from typing import Optional
from backend.app.database import get_connection


def insert_generation_history(
    generated_by_user_id: int | None,
    generated_by_role: str,
    generated_for_teacher_id: int | None,
    department_id: int | None,
    academic_year: str,
    excel_template_id: int | None,
    docx_template_id: int | None,
    output_path: str | None,
    status: str,
    error_text: str | None = None,
) -> int:
    file_name = None
    if output_path:
        try:
            file_name = Path(output_path).name
        except Exception:
            file_name = None

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO generation_history(
                        generated_by_user_id, generated_by_role,
                        generated_for_teacher_id,
                        department_id, academic_year,
                        excel_template_id, docx_template_id,
                        output_path, file_name,
                        status, error_text
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    RETURNING id;
                """, (
                    generated_by_user_id, generated_by_role,
                    generated_for_teacher_id,
                    department_id, academic_year,
                    excel_template_id, docx_template_id,
                    output_path, file_name,
                    status, error_text
                ))
                return cur.fetchone()[0]
    finally:
        conn.close()
