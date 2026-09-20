"""PatchMind FastAPI Backend Entrypoint.

Production-style application wiring:
- Root & Health endpoints
- CORS middleware for frontend integration
- Project, Run, Patch, and Verification routers
- Database schema initialization
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import analysis, patches, projects, test_runs
from app.config import CORS_ORIGINS, DEBUG
from app.core.exceptions import PatchMindError
from app.database import init_db

logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("patchmind.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    logger.info("Starting PatchMind Backend service...")
    try:
        init_db()
        logger.info("Database initialized successfully.")
    except Exception as exc:
        logger.error(f"Failed to initialize database: {exc}", exc_info=True)
    yield
    logger.info("Shutting down PatchMind Backend service...")


app = FastAPI(
    title="PatchMind Backend",
    description="Orchestration layer connecting PatchMind Frontend, AI Engine, and Docker Sandbox Runner.",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(projects.router)
app.include_router(analysis.router)
app.include_router(patches.router)
app.include_router(test_runs.router)


@app.get("/", tags=["system"])
@app.get("/api", tags=["system"])
def read_root():
    """Root endpoint welcoming clients."""
    return {
        "service": "patchmind-backend",
        "version": "1.0.0",
        "documentation": "/docs"
    }


@app.get("/health", tags=["system"])
@app.get("/api/health", tags=["system"])
def health_check():
    """Service health inspection endpoint."""
    return {
        "status": "ok",
        "service": "patchmind-backend"
    }


@app.exception_handler(PatchMindError)
async def patchmind_exception_handler(request: Request, exc: PatchMindError):
    """Handle domain exceptions with clean JSON responses."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": exc.__class__.__name__,
            "message": exc.message,
            "details": exc.details
        }
    )
