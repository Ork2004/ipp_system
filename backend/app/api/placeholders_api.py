from fastapi import APIRouter, HTTPException
from backend.app.database import get_connection

router = APIRouter(prefix="/placeholders", tags=["Placeholders"])


@router.get("")
def get_placeholders(excel_template_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM excel_templates WHERE id=%s;", (excel_template_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Excel template не найден")

            cur.execute("""
                SELECT placeholder_name, placeholder_type, category, description, example
                FROM placeholder_catalog
                ORDER BY placeholder_name;
            """)
            stable = [
                {
                    "placeholder_name": r[0],
                    "placeholder_type": r[1],
                    "category": r[2],
                    "description": r[3],
                    "example": r[4],
                    "source": "catalog"
                }
                for r in cur.fetchall()
            ]

            cur.execute("""
                SELECT column_name, header_text
                FROM excel_columns
                WHERE template_id=%s
                ORDER BY position_index;
            """, (excel_template_id,))
            dynamic = []
            for col_name, header_text in cur.fetchall():
                dynamic.append({
                    "placeholder_name": f"row.{col_name}",
                    "placeholder_type": "text",
                    "category": "row",
                    "description": f"Сгенерировано из Excel колонки: {header_text}",
                    "example": f"{{{{ row.{col_name} }}}}",
                    "source": "excel",
                    "header_text": header_text,
                    "column_name": col_name
                })

        return {"excel_template_id": excel_template_id, "stable": stable, "dynamic": dynamic}
    finally:
        conn.close()
