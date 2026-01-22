from fastapi import APIRouter, Depends, HTTPException
from backend.app.database import get_connection
from backend.app.api.auth_api import get_current_user, require_roles

router = APIRouter(prefix="/teachers", tags=["Teachers"])


@router.get("")
def list_teachers(
    department_id: int | None = None,
    q: str | None = None,
    user=Depends(get_current_user)
):

    role = user.get("role")
    dep_from_token = user.get("department_id")
    teacher_from_token = user.get("teacher_id")

    if role == "guest":
        raise HTTPException(status_code=403, detail="Гостю нельзя смотреть ППС")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if role == "teacher":
                if not teacher_from_token:
                    raise HTTPException(status_code=403, detail="teacher_id не привязан к аккаунту")
                cur.execute("""
                    SELECT id, full_name, department_id, faculty, position, academic_degree, academic_rank, staff_type, extra_data
                    FROM teachers
                    WHERE id=%s
                    ORDER BY full_name;
                """, (teacher_from_token,))
                rows = cur.fetchall()

            else:
                dep = int(department_id) if department_id else dep_from_token
                if not dep:
                    raise HTTPException(status_code=400, detail="Нет department_id (и в токене тоже нет)")
                if dep != dep_from_token:
                    raise HTTPException(status_code=403, detail="Нельзя смотреть другую кафедру")

                if q:
                    cur.execute("""
                        SELECT id, full_name, department_id, faculty, position, academic_degree, academic_rank, staff_type, extra_data
                        FROM teachers
                        WHERE department_id=%s AND lower(full_name) LIKE %s
                        ORDER BY full_name;
                    """, (dep, f"%{q.lower()}%"))
                else:
                    cur.execute("""
                        SELECT id, full_name, department_id, faculty, position, academic_degree, academic_rank, staff_type, extra_data
                        FROM teachers
                        WHERE department_id=%s
                        ORDER BY full_name;
                    """, (dep,))
                rows = cur.fetchall()

        return [
            {
                "id": r[0],
                "full_name": r[1],
                "department_id": r[2],
                "faculty": r[3],
                "position": r[4],
                "academic_degree": r[5],
                "academic_rank": r[6],
                "staff_type": r[7],
                "extra_data": r[8],
            }
            for r in rows
        ]
    finally:
        conn.close()


@router.get("/{teacher_id}")
def get_teacher(
    teacher_id: int,
    user=Depends(get_current_user)
):
    role = user.get("role")
    dep_from_token = user.get("department_id")
    teacher_from_token = user.get("teacher_id")

    if role == "guest":
        raise HTTPException(status_code=403, detail="Гостю нельзя")

    if role == "teacher" and int(teacher_id) != int(teacher_from_token or -1):
        raise HTTPException(status_code=403, detail="Преподаватель может смотреть только себя")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, full_name, department_id, faculty, position, academic_degree, academic_rank, staff_type, extra_data
                FROM teachers
                WHERE id=%s;
            """, (teacher_id,))
            r = cur.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Преподаватель не найден")

            if role == "admin" and dep_from_token and r[2] != dep_from_token:
                raise HTTPException(status_code=403, detail="Нельзя смотреть преподавателей другой кафедры")

        return {
            "id": r[0],
            "full_name": r[1],
            "department_id": r[2],
            "faculty": r[3],
            "position": r[4],
            "academic_degree": r[5],
            "academic_rank": r[6],
            "staff_type": r[7],
            "extra_data": r[8],
        }
    finally:
        conn.close()
