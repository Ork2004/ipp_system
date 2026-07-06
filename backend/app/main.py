from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api import routers


def create_app() -> FastAPI:
    app = FastAPI(title="IPP System API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_origin_regex=r"https://.*\.lhr\.life",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    def root():
        return {"status": "IPP system backend is running"}

    for router in routers:
        app.include_router(router)

    return app


app = create_app()
