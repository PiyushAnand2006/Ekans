"""Ekans FastAPI Backend Entry Point."""

from __future__ import annotations

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router
from backend.config import settings
from backend.storage.database import close_db, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    await init_db()
    yield
    await close_db()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Visual AI Workforce Operating System API",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "Ekans AI Workforce OS API", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.host, port=settings.port, reload=True)
