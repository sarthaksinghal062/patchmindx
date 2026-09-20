"""PatchMind Backend Configuration.

Reads application configuration from environment variables with safe defaults.
Never hardcodes secrets.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

# Base paths
BACKEND_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = Path(os.getenv("PATCHMIND_WORKSPACE_ROOT", str(BACKEND_DIR.parent)))
STORAGE_DIR = Path(os.getenv("PATCHMIND_STORAGE_DIR", str(BACKEND_DIR / "storage")))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Database
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{STORAGE_DIR / 'patchmind.db'}"
)

# Fix postgres protocol alias if standard URI format is provided
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Application & Server
ENV = os.getenv("ENV", "development")
DEBUG = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# CORS
CORS_ORIGINS: List[str] = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

# LLM & AI Engine settings
LLM_API_KEY = os.getenv("LLM_API_KEY", "") or os.getenv("OPENAI_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "45.0"))
OFFLINE_MODE = os.getenv("PATCHMIND_OFFLINE_MODE", "true").lower() in ("true", "1", "yes")

# Runner & Sandbox configuration
RUNNER_TIMEOUT_SECONDS = int(os.getenv("RUNNER_TIMEOUT_SECONDS", "120"))
DOCKER_RUNNER_URL = os.getenv("DOCKER_RUNNER_URL", "")  # Optional remote runner endpoint
USE_DOCKER_SANDBOX = os.getenv("USE_DOCKER_SANDBOX", "false").lower() in ("true", "1", "yes")

# Security bounds
MAX_PROJECT_UPLOAD_SIZE = int(os.getenv("MAX_PROJECT_UPLOAD_SIZE", str(50 * 1024 * 1024)))  # 50MB
ALLOWED_RUNTIMES = ["python", "python3", "pytest"]
