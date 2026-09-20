"""SQLAlchemy Model for Analysis Runs."""

from __future__ import annotations

import datetime
import json
import uuid
from typing import Any, Dict, List, Optional

try:
    from sqlalchemy import Column, String, Text, DateTime, ForeignKey
    from sqlalchemy.orm import relationship
except ImportError:
    Column = String = Text = DateTime = ForeignKey = relationship = lambda *a, **kw: None  # type: ignore

from app.database import Base


class RunState:
    QUEUED = "QUEUED"
    INSPECTING = "INSPECTING"
    BASELINE_RUNNING = "BASELINE_RUNNING"
    ANALYZING = "ANALYZING"
    PATCH_GENERATING = "PATCH_GENERATING"
    PATCH_VALIDATING = "PATCH_VALIDATING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

    ALL_STATES = [
        QUEUED,
        INSPECTING,
        BASELINE_RUNNING,
        ANALYZING,
        PATCH_GENERATING,
        PATCH_VALIDATING,
        VERIFYING,
        COMPLETED,
        FAILED,
        CANCELLED,
    ]


class VerificationResultState:
    PASS = "PASS"
    FAIL = "FAIL"
    NOT_RUN = "NOT_RUN"
    INCONCLUSIVE = "INCONCLUSIVE"

    ALL_RESULTS = [PASS, FAIL, NOT_RUN, INCONCLUSIVE]


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(String(64), primary_key=True, default=lambda: f"run-{uuid.uuid4().hex[:12]}")
    project_id = Column(String(64), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    run_state = Column(String(32), nullable=False, default=RunState.QUEUED)
    verification = Column(String(32), nullable=False, default=VerificationResultState.NOT_RUN)
    target_path = Column(String(1024), nullable=False, default="")
    test_command = Column(String(255), nullable=False, default="pytest")
    baseline_test_output = Column(Text, nullable=True, default="")
    diagnosis_json = Column(Text, nullable=True, default="")
    error_message = Column(Text, nullable=True, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="runs")
    patches = relationship("Patch", back_populates="analysis", cascade="all, delete-orphan")
    test_runs = relationship("TestRun", back_populates="analysis", cascade="all, delete-orphan")
    logs = relationship("RunLog", back_populates="analysis", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        parsed_diagnosis = None
        if self.diagnosis_json:
            try:
                parsed_diagnosis = json.loads(self.diagnosis_json)
            except Exception:
                parsed_diagnosis = self.diagnosis_json

        return {
            "id": self.id,
            "project_id": self.project_id,
            "run_state": self.run_state,
            "verification": self.verification,
            "target_path": self.target_path,
            "test_command": self.test_command,
            "diagnosis": parsed_diagnosis,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
