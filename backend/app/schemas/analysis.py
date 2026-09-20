"""Pydantic schemas for Analysis and Runs."""

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


class RunCreate(BaseModel):
    project_id: str = Field(..., description="ID of project to execute run against")
    test_command: Optional[str] = Field(default="pytest", description="Command to execute test suite")
    target_path: Optional[str] = Field(default="", description="Relative target path within project")


class RunResponse(BaseModel):
    id: str
    project_id: str
    run_state: str
    verification: str
    target_path: str
    test_command: str
    diagnosis: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class RunCancelResponse(BaseModel):
    run_id: str
    run_state: str
    message: str
