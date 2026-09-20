"""SQLAlchemy Model for Projects."""

from __future__ import annotations

import datetime
import uuid
from typing import List

try:
    from sqlalchemy import Column, String, Text, DateTime
    from sqlalchemy.orm import relationship
except ImportError:
    Column = String = Text = DateTime = relationship = lambda *a, **kw: None  # type: ignore

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True, default="")
    repository_source = Column(String(1024), nullable=False, default="")
    runtime = Column(String(64), nullable=False, default="python")
    test_command = Column(String(255), nullable=False, default="pytest")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    runs = relationship("Analysis", back_populates="project", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "repository_source": self.repository_source,
            "runtime": self.runtime,
            "test_command": self.test_command,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
