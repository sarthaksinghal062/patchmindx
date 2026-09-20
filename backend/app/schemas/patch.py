"""Pydantic schemas for Patches and Diffs."""

from __future__ import annotations

from typing import List, Optional

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


class PatchResponse(BaseModel):
    id: str
    run_id: str
    unified_diff: str
    explanation: Optional[str] = ""
    affected_files: List[str] = []
    is_syntactically_valid: bool = False
    validation_details: Optional[str] = ""
    created_at: Optional[str] = None


class RunDiffResponse(BaseModel):
    run_id: str
    patch_id: Optional[str] = None
    diff: str = ""
    affected_files: List[str] = []
    is_syntactically_valid: bool = False
    validation_details: Optional[str] = ""
