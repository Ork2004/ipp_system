from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.excel_api import router as excel_router
from backend.app.api.placeholders_api import router as placeholders_router
from backend.app.api.docx_api import router as docx_router
from backend.app.api.settings_api import router as settings_router
from backend.app.api.generate_api import router as generate_router
from backend.app.api.auth_api import router as auth_router
from backend.app.api.teachers_api import router as teachers_router
from backend.app.api.history_api import router as history_router

app = FastAPI(title="IPP System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "IPP system backend is running"}

app.include_router(auth_router)
app.include_router(teachers_router)
app.include_router(history_router)

app.include_router(excel_router)
app.include_router(placeholders_router)
app.include_router(docx_router)
app.include_router(settings_router)
app.include_router(generate_router)
