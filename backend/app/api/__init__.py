from backend.app.api.auth_api import router as auth_router
from backend.app.api.blocks_api import router as blocks_router
from backend.app.api.docx_api import router as docx_router
from backend.app.api.excel_api import router as excel_router
from backend.app.api.form63_api import router as form63_router
from backend.app.api.generate_api import router as generate_router
from backend.app.api.history_api import router as history_router
from backend.app.api.manual_fill_api import router as manual_fill_router
from backend.app.api.raw_template_api import router as raw_template_router
from backend.app.api.settings_api import router as settings_router
from backend.app.api.teachers_api import router as teachers_router
from backend.app.api.analysis import router as analysis_router

routers = (
    auth_router,
    teachers_router,
    history_router,
    excel_router,
    docx_router,
    settings_router,
    blocks_router,
    generate_router,
    raw_template_router,
    manual_fill_router,
    form63_router,
    analysis_router,
)

__all__ = ["routers"]