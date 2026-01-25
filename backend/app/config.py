from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

UPLOAD_DIR = BASE_DIR / "uploads"
EXCEL_DIR = UPLOAD_DIR / "excel"
DOCX_DIR = UPLOAD_DIR / "docx"
GENERATED_DIR = UPLOAD_DIR / "generated"

for d in (UPLOAD_DIR, EXCEL_DIR, DOCX_DIR, GENERATED_DIR):
    d.mkdir(parents=True, exist_ok=True)
