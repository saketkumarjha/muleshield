from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.queue import router as queue_router
from app.api.case import router as case_router
from app.api.hold import router as hold_router

app = FastAPI(title="MuleShield")

app.include_router(queue_router)
app.include_router(case_router)
app.include_router(hold_router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
