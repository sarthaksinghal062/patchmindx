"""Pydantic schemas for Test Runs, Logs, and Verification Reports."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

try:
    from pydantic import BaseModel, Field
except ImportError:
    class BaseModel:  # type: ignore
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)
        def model_dump(self):
            return self.__dict__
    Field = lambda default=None, **kw: default  # type: ignore


class LogEntrySchema(BaseModel):
    id: Optional[str] = None
    timestamp: str
    event_type: str
    message: str
    details: Optional[Dict[str, Any]] = None


class RunLogsResponse(BaseModel):
    run_id: str
    logs: List[LogEntrySchema] = []


class RunnerInputPayload(BaseModel):
    run_id: str
    project_path: str
    test_command: str = "pytest"
    patch: Optional[str] = ""
    timeout_seconds: int = 120


class RunnerOutputPayload(BaseModel):
    status: str
    exit_code: int
    passed: int
    failed: int
    duration_ms: int
    stdout: str
    stderr: str
    verification: str


class RunReportResponse(BaseModel):
    run_id: str
    project_id: str
    run_state: str
    verification: str
    baseline: Optional[Dict[str, Any]] = None
    diagnosis: Optional[Dict[str, Any]] = None
    patch: Optional[Dict[str, Any]] = None
    verification_test: Optional[Dict[str, Any]] = None
    summary: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
