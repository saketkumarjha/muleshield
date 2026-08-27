"""MuleShield analyst console.

Composition and lifespan only. Workflow logic lives in app/api/ and app/services/.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.case import router as case_router
from app.api.extras import router as extras_router
from app.api.hold import router as hold_router
from app.api.queue import router as queue_router
from app.services import store


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Creates the schema if absent. Never clears existing decisions: the demo
    # reset is an explicit POST /api/demo/reset.
    store.init_db()
    yield


app = FastAPI(title="MuleShield analyst console", lifespan=lifespan)

app.include_router(queue_router)
app.include_router(case_router)
app.include_router(hold_router)
app.include_router(extras_router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
