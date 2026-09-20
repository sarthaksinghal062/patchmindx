"""SQLAlchemy Models for Test Runs, Verification Results, and Run Logs."""

from __future__ import annotations

import datetime
import json
import uuid

try:
    from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
    from sqlalchemy.orm import relationship
except ImportError:
    Column = String = Text = Integer = DateTime = ForeignKey = relationship = lambda *a, **kw: None  # type: ignore

from app.database import Base


class TestStage:
    BASELINE = "BASELINE"
    VERIFICATION = "VERIFICATION"


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(String(64), primary_key=True, default=lambda: f"tr-{uuid.uuid4().hex[:12]}")
    run_id = Column(String(64), ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False)
    patch_id = Column(String(64), nullable=True)
    stage = Column(String(32), nullable=False, default=TestStage.BASELINE)
    status = Column(String(32), nullable=False, default="NOT_RUN")
    verification = Column(String(32), nullable=False, default="NOT_RUN")
    exit_code = Column(Integer, nullable=True)
    passed_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    duration_ms = Column(Integer, nullable=False, default=0)
    stdout = Column(Text, nullable=True, default="")
    stderr = Column(Text, nullable=True, default="")
    report_json = Column(Text, nullable=True, default="{}")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    analysis = relationship("Analysis", back_populates="test_runs")

    def to_dict(self) -> dict:
        parsed_report = {}
        if self.report_json:
            try:
                parsed_report = json.loads(self.report_json)
            except Exception:
                parsed_report = {}

        return {
            "id": self.id,
            "run_id": self.run_id,
            "patch_id": self.patch_id,
            "stage": self.stage,
            "status": self.status,
            "verification": self.verification,
            "exit_code": self.exit_code,
            "passed": self.passed_count,
            "failed": self.failed_count,
            "duration_ms": self.duration_ms,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "report": parsed_report,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class RunLog(Base):
    __tablename__ = "run_logs"

    id = Column(String(64), primary_key=True, default=lambda: f"log-{uuid.uuid4().hex[:12]}")
    run_id = Column(String(64), ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    event_type = Column(String(64), nullable=False)
    message = Column(Text, nullable=False)
    details_json = Column(Text, nullable=True, default="{}")

    # Relationships
    analysis = relationship("Analysis", back_populates="logs")

    def to_dict(self) -> dict:
        details = {}
        if self.details_json:
            try:
                details = json.loads(self.details_json)
            except Exception:
                details = {}

        return {
            "id": self.id,
            "run_id": self.run_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "event_type": self.event_type,
            "message": self.message,
            "details": details,
        }
