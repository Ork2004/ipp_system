import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.app.utils.excel_parser import parse_excel
from backend.app.api.excel_api import router as excel_router
from backend.app.api.placeholders_api import router as placeholders_router
from backend.app.api.docx_api import router as docx_router
from backend.app.api.settings_api import router as settings_router
from backend.app.api.generate_api import router as generate_router
from backend.app.api.auth_api import router as auth_router
from backend.app.api.teachers_api import router as teachers_router

app = FastAPI(title="IPP System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
EXCEL_DIR = UPLOAD_DIR / "excel"
EXCEL_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/")
def root():
    return {"status": "IPP system backend is running"}


def save_upload_file(upload_file: UploadFile, target_dir: Path) -> str:
    ext = Path(upload_file.filename).suffix.lower()
    file_id = uuid.uuid4().hex
    out_path = target_dir / f"{file_id}{ext}"
    with open(out_path, "wb") as f:
        f.write(upload_file.file.read())
    return str(out_path)


@app.post("/upload/excel")
def upload_excel(
    department_id: int = Form(...),
    academic_year: str = Form(...),
    file: UploadFile = File(...)
):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Нужен Excel файл .xlsx/.xls")

    saved_path = save_upload_file(file, EXCEL_DIR)

    excel_template_id = parse_excel(
        saved_path,
        department_id,
        academic_year,
        source_filename=file.filename
    )

    return {
        "type": "excel",
        "department_id": department_id,
        "academic_year": academic_year,
        "original_filename": file.filename,
        "saved_path": saved_path,
        "excel_template_id": excel_template_id
    }


app.include_router(excel_router)
app.include_router(placeholders_router)
app.include_router(docx_router)
app.include_router(settings_router)
app.include_router(generate_router)
app.include_router(auth_router)
app.include_router(teachers_router)
