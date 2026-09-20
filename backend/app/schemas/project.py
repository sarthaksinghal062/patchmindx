"""Pydantic schemas for Projects."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

try:
    from pydantic import BaseModel, Field, ConfigDict
except ImportError:
    class BaseModel:  # type: ignore
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)
        def model_dump(self):
            return self.__dict__
    Field = lambda default=None, **kw: default  # type: ignore
    ConfigDict = dict  # type: ignore


class ProjectCreate(BaseModel):
    name: str = Field(..., description="Project name", min_length=1, max_length=255)
    description: Optional[str] = Field(default="", description="Project description")
    repository_source: Optional[str] = Field(default="", description="Repository or source path")
    runtime: Optional[str] = Field(default="python", description="Target runtime environment")
    test_command: Optional[str] = Field(default="pytest", description="Default test command")


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    repository_source: Optional[str] = None
    runtime: Optional[str] = None
    test_command: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    repository_source: str
    runtime: str
    test_command: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
