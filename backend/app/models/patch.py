"""SQLAlchemy Model for AI Generated Patches."""

from __future__ import annotations

import datetime
import json
import uuid

try:
    from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey
    from sqlalchemy.orm import relationship
except ImportError:
    Column = String = Text = Boolean = DateTime = ForeignKey = relationship = lambda *a, **kw: None  # type: ignore

from app.database import Base


class Patch(Base):
    __tablename__ = "patches"

    id = Column(String(64), primary_key=True, default=lambda: f"patch-{uuid.uuid4().hex[:12]}")
    run_id = Column(String(64), ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False)
    unified_diff = Column(Text, nullable=False, default="")
    explanation = Column(Text, nullable=True, default="")
    affected_files_json = Column(Text, nullable=True, default="[]")
    is_syntactically_valid = Column(Boolean, nullable=False, default=False)
    validation_details = Column(Text, nullable=True, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    analysis = relationship("Analysis", back_populates="patches")

    def to_dict(self) -> dict:
        files = []
        if self.affected_files_json:
            try:
                files = json.loads(self.affected_files_json)
            except Exception:
                files = []

        return {
            "id": self.id,
            "run_id": self.run_id,
            "unified_diff": self.unified_diff,
            "explanation": self.explanation,
            "affected_files": files,
            "is_syntactically_valid": self.is_syntactically_valid,
            "validation_details": self.validation_details,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
