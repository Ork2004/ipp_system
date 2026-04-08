from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.database import get_conn
from app.utils.generator import generate_docx_from_raw

router = APIRouter(prefix="/generate", tags=["generate"])


@router.post("/teacher")
def generate_teacher(data: dict):
    teacher_id = data.get("teacher_id")
    department_id = data.get("department_id")
    academic_year = data.get("academic_year")

    if not teacher_id or not department_id or not academic_year:
        raise HTTPException(status_code=400, detail="missing params")

    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT id, file_path
        FROM raw_templates
        WHERE department_id = %s AND academic_year = %s
        """,
        (department_id, academic_year),
    )
    raw = cur.fetchone()

    if not raw:
        raise HTTPException(status_code=400, detail="no raw template")

    raw_template_id, file_path = raw

    cur.execute(
        """
        SELECT id
        FROM excel_templates
        WHERE department_id = %s AND academic_year = %s
        """,
        (department_id, academic_year),
    )
    excel = cur.fetchone()

    if not excel:
        raise HTTPException(status_code=400, detail="no excel")

    excel_template_id = excel[0]

    try:
        output_path = generate_docx_from_raw(
            raw_template_id=raw_template_id,
            teacher_id=teacher_id,
            excel_template_id=excel_template_id,
        )

        cur.execute(
            """
            INSERT INTO generation_history(
                teacher_id,
                department_id,
                academic_year,
                file_path,
                status
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                teacher_id,
                department_id,
                academic_year,
                output_path,
                "success",
            ),
        )
        conn.commit()

        return {
            "download_url": f"/generate/download?path={output_path}"
        }

    except Exception as e:
        conn.rollback()

        cur.execute(
            """
            INSERT INTO generation_history(
                teacher_id,
                department_id,
                academic_year,
                file_path,
                status,
                error_text
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                teacher_id,
                department_id,
                academic_year,
                "",
                "error",
                str(e),
            ),
        )
        conn.commit()

        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download")
def download(path: str):
    return FileResponse(path, filename=path.split("/")[-1])