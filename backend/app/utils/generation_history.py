from pathlib import Path
from backend.app.database import get_connection


def upsert_generated_file(
    last_generated_by_user_id: int | None,
    last_generated_by_role: str,
    generated_for_teacher_id: int,
    department_id: int | None,
    academic_year: str,
    excel_template_id: int | None,
    raw_template_id: int | None,
    output_path: str,
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
                    INSERT INTO generated_files(
                        last_generated_by_user_id, last_generated_by_role,
                        generated_for_teacher_id,
                        department_id, academic_year,
                        excel_template_id, raw_template_id,
                        output_path, file_name
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (generated_for_teacher_id, academic_year)
                    DO UPDATE SET
                        last_generated_by_user_id = EXCLUDED.last_generated_by_user_id,
                        last_generated_by_role = EXCLUDED.last_generated_by_role,
                        department_id = EXCLUDED.department_id,
                        excel_template_id = EXCLUDED.excel_template_id,
                        raw_template_id = EXCLUDED.raw_template_id,
                        output_path = EXCLUDED.output_path,
                        file_name = EXCLUDED.file_name,
                        updated_at = now()
                    RETURNING id;
                """, (
                    last_generated_by_user_id, last_generated_by_role,
                    generated_for_teacher_id,
                    department_id, academic_year,
                    excel_template_id, raw_template_id,
                    output_path, file_name,
                ))
                return cur.fetchone()[0]
    finally:
        conn.close()
