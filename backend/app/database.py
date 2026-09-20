"""SQLAlchemy Database configuration and session management for PatchMind."""

from __future__ import annotations

import logging
from typing import Generator

try:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import declarative_base, sessionmaker, Session
    HAVE_SQLALCHEMY = True
except ImportError:
    HAVE_SQLALCHEMY = False
    # Graceful fallback placeholders if importing during minimal bootstrap
    def declarative_base():  # type: ignore
        class DummyBase:
            pass
        return DummyBase
    def sessionmaker(*args, **kwargs):  # type: ignore
        return lambda: None
    def create_engine(*args, **kwargs):  # type: ignore
        return None
    Session = object  # type: ignore

from .config import DATABASE_URL, DEBUG

logger = logging.getLogger("patchmind.database")

Base = declarative_base()

# Configure engine kwargs
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

if HAVE_SQLALCHEMY:
    engine = create_engine(
        DATABASE_URL,
        echo=DEBUG,
        connect_args=connect_args,
        future=True,
    )
    SessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
        future=True,
    )
else:
    engine = None
    SessionLocal = None


def get_db() -> Generator[Session, None, None]:
    """FastAPI database session dependency."""
    if not SessionLocal:
        yield None  # type: ignore
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all database tables based on registered models."""
    if HAVE_SQLALCHEMY and engine:
        # Import models so they attach to Base metadata
        import app.models.project  # noqa: F401
        import app.models.analysis  # noqa: F401
        import app.models.patch  # noqa: F401
        import app.models.test_run  # noqa: F401
        Base.metadata.create_all(bind=engine)
        logger.info("Initialized database schema.")
