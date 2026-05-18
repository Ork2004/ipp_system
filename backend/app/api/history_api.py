from fastapi import APIRouter, Depends, HTTPException
from backend.app.database import get_connection
from backend.app.api.auth_api import get_current_user

router = APIRouter(prefix="/history", tags=["Generated files"])


def _role_guard(user: dict):
    if user.get("role") not in ("admin", "teacher"):
        raise HTTPException(status_code=403, detail="Доступ только admin и teacher")


@router.get("")
def list_generated_files(
    teacher_id: int | None = None,
    limit: int = 200,
    offset: int = 0,
    user=Depends(get_current_user)
):
    _role_guard(user)

    role = user.get("role")
    dep = user.get("department_id")
    dep = int(dep) if dep else None
    my_teacher_id = user.get("teacher_id")

    if role == "teacher":
        teacher_id = int(my_teacher_id or 0)
        if not teacher_id:
            raise HTTPException(status_code=403, detail="teacher_id не привязан к аккаунту")

    limit = max(1, min(int(limit or 200), 500))
    offset = max(0, int(offset or 0))

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
                        raise HTTPException(status_code=403, detail="Нельзя смотреть файлы другой кафедры")

                if teacher_id:
                    cur.execute("""
                        SELECT
                            gf.id,
                            gf.created_at,
                            gf.updated_at,
                            gf.last_generated_by_user_id,
                            gf.last_generated_by_role,
                            u.username,
                            COALESCE(ut.full_name, u.username),
                            gf.generated_for_teacher_id,
                            t.full_name,
                            gf.department_id,
                            gf.academic_year,
                            gf.excel_template_id,
                            gf.raw_template_id,
                            gf.file_name,
                            gf.output_path
                        FROM generated_files gf
                        LEFT JOIN users u ON u.id = gf.last_generated_by_user_id
                        LEFT JOIN teachers ut ON ut.id = u.teacher_id
                        LEFT JOIN teachers t ON t.id = gf.generated_for_teacher_id
                        WHERE gf.department_id=%s AND gf.generated_for_teacher_id=%s
                        ORDER BY gf.academic_year DESC, t.full_name ASC, gf.updated_at DESC
                        LIMIT %s OFFSET %s;
                    """, (dep, teacher_id, limit, offset))
                else:
                    cur.execute("""
                        SELECT
                            gf.id,
                            gf.created_at,
                            gf.updated_at,
                            gf.last_generated_by_user_id,
                            gf.last_generated_by_role,
                            u.username,
                            COALESCE(ut.full_name, u.username),
                            gf.generated_for_teacher_id,
                            t.full_name,
                            gf.department_id,
                            gf.academic_year,
                            gf.excel_template_id,
                            gf.raw_template_id,
                            gf.file_name,
                            gf.output_path
                        FROM generated_files gf
                        LEFT JOIN users u ON u.id = gf.last_generated_by_user_id
                        LEFT JOIN teachers ut ON ut.id = u.teacher_id
                        LEFT JOIN teachers t ON t.id = gf.generated_for_teacher_id
                        WHERE gf.department_id=%s
                        ORDER BY gf.academic_year DESC, t.full_name ASC, gf.updated_at DESC
                        LIMIT %s OFFSET %s;
                    """, (dep, limit, offset))

            else:
                cur.execute("""
                    SELECT
                        gf.id,
                        gf.created_at,
                        gf.updated_at,
                        gf.last_generated_by_user_id,
                        gf.last_generated_by_role,
                        u.username,
                        COALESCE(ut.full_name, u.username),
                        gf.generated_for_teacher_id,
                        t.full_name,
                        gf.department_id,
                        gf.academic_year,
                        gf.excel_template_id,
                        gf.raw_template_id,
                        gf.file_name,
                        gf.output_path
                    FROM generated_files gf
                    LEFT JOIN users u ON u.id = gf.last_generated_by_user_id
                    LEFT JOIN teachers ut ON ut.id = u.teacher_id
                    LEFT JOIN teachers t ON t.id = gf.generated_for_teacher_id
                    WHERE gf.generated_for_teacher_id=%s
                    ORDER BY gf.academic_year DESC, gf.updated_at DESC
                    LIMIT %s OFFSET %s;
                """, (teacher_id, limit, offset))

            rows = cur.fetchall()

        return [
            {
                "id": r[0],
                "created_at": r[1],
                "updated_at": r[2],
                "last_generated_at": r[2],
                "status": "success",
                "error_text": None,
                "generated_by_user_id": r[3],
                "generated_by_role": r[4],
                "generated_by_username": r[5],
                "generated_by_display_name": r[6],
                "last_generated_by_user_id": r[3],
                "last_generated_by_role": r[4],
                "last_generated_by_username": r[5],
                "last_generated_by_display_name": r[6],
                "generated_for_teacher_id": r[7],
                "teacher_name": r[8],
                "department_id": r[9],
                "academic_year": r[10],
                "excel_template_id": r[11],
                "raw_template_id": r[12],
                "docx_template_id": None,
                "file_name": r[13],
                "output_path": r[14],
            }
            for r in rows
        ]
    finally:
        conn.close()
