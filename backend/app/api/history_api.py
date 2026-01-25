from fastapi import APIRouter, Depends, HTTPException
from backend.app.database import get_connection
from backend.app.api.auth_api import get_current_user

router = APIRouter(prefix="/history", tags=["History"])


def _role_guard(user: dict):
    if user.get("role") not in ("admin", "teacher"):
        raise HTTPException(status_code=403, detail="Доступ только admin и teacher")


@router.get("")
def list_history(
    teacher_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
    user=Depends(get_current_user)
):
    _role_guard(user)

    role = user.get("role")
    dep = user.get("department_id")
    my_teacher_id = user.get("teacher_id")

    if role == "teacher":
        teacher_id = int(my_teacher_id or 0)
        if not teacher_id:
            raise HTTPException(status_code=403, detail="teacher_id не привязан к аккаунту")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if role == "admin":
                if not dep:
                    raise HTTPException(status_code=403, detail="У админа нет department_id")
                if teacher_id:
                    cur.execute("SELECT department_id FROM teachers WHERE id=%s;", (teacher_id,))
                    r = cur.fetchone()
                    if not r:
                        raise HTTPException(status_code=404, detail="Преподаватель не найден")
                    if r[0] != dep:
                        raise HTTPException(status_code=403, detail="Нельзя смотреть историю другой кафедры")

                if teacher_id:
                    cur.execute("""
                        SELECT id, created_at, status, error_text,
                               generated_by_user_id, generated_by_role,
                               generated_for_teacher_id, department_id,
                               academic_year, excel_template_id, docx_template_id,
                               file_name, output_path
                        FROM generation_history
                        WHERE department_id=%s AND generated_for_teacher_id=%s
                        ORDER BY created_at DESC
                        LIMIT %s OFFSET %s;
                    """, (dep, teacher_id, limit, offset))
                else:
                    cur.execute("""
                        SELECT id, created_at, status, error_text,
                               generated_by_user_id, generated_by_role,
                               generated_for_teacher_id, department_id,
                               academic_year, excel_template_id, docx_template_id,
                               file_name, output_path
                        FROM generation_history
                        WHERE department_id=%s
                        ORDER BY created_at DESC
                        LIMIT %s OFFSET %s;
                    """, (dep, limit, offset))

            else:
                cur.execute("""
                    SELECT id, created_at, status, error_text,
                           generated_by_user_id, generated_by_role,
                           generated_for_teacher_id, department_id,
                           academic_year, excel_template_id, docx_template_id,
                           file_name, output_path
                    FROM generation_history
                    WHERE generated_for_teacher_id=%s
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s;
                """, (teacher_id, limit, offset))

            rows = cur.fetchall()

        return [
            {
                "id": r[0],
                "created_at": r[1],
                "status": r[2],
                "error_text": r[3],
                "generated_by_user_id": r[4],
                "generated_by_role": r[5],
                "generated_for_teacher_id": r[6],
                "department_id": r[7],
                "academic_year": r[8],
                "excel_template_id": r[9],
                "docx_template_id": r[10],
                "file_name": r[11],
                "output_path": r[12],
            }
            for r in rows
        ]
    finally:
        conn.close()
