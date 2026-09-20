"""Pydantic schemas for BugBuster AI Engine.

Architecture Rule:
The AI proposes a diagnosis and patch.
The AI must NEVER claim that a patch is verified or tested.
Only Team Member 4's Docker sandbox execution layer can return PASS or FAIL.
Verification fields ('verified', 'status', 'is_passing') are strictly forbidden here.
"""

from __future__ import annotations

import re
from typing import Any, List

try:
    from pydantic import BaseModel, Field, field_validator, ConfigDict  # type: ignore
    PYDANTIC_V2 = True
except ImportError:
    try:
        from pydantic import BaseModel, Field, validator as field_validator  # type: ignore
        PYDANTIC_V2 = False
    except ImportError:
        # Graceful fallback for minimal environments without pydantic installed
        PYDANTIC_V2 = None

        class BaseModel:  # type: ignore
            def __init__(self, **kwargs: Any) -> None:
                for key, val in kwargs.items():
                    setattr(self, key, val)

            def model_dump(self) -> dict[str, Any]:
                return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}

            def dict(self) -> dict[str, Any]:
                return self.model_dump()

            @classmethod
            def model_validate(cls, obj: Any) -> Any:
                if isinstance(obj, dict):
                    return cls(**obj)
                if isinstance(obj, cls):
                    return obj
                raise TypeError(f"Cannot validate {type(obj)} as {cls.__name__}")

        def Field(default: Any = ..., **kwargs: Any) -> Any:  # type: ignore
            return default

        def field_validator(*args: Any, **kwargs: Any) -> Any:  # type: ignore
            def decorator(func: Any) -> Any:
                return func
            return decorator


class DiagnosisResult(BaseModel):
    """Structured diagnosis of a failing test run produced by BugBuster AI."""

    root_cause: str = Field(
        ...,
        description="Concise description of the specific software defect causing the failure.",
        min_length=3,
    )
    explanation: str = Field(
        ...,
        description="Detailed evidence-grounded explanation linking the failing test to the defect in the code.",
        min_length=5,
    )
    affected_files: List[str] = Field(
        ...,
        description="List of repository relative file paths that contain the bug or need modifications.",
    )
    suggested_fix: str = Field(
        ...,
        description="High-level conceptual recommendation of how the defect should be corrected.",
        min_length=3,
    )
    uncertainty: str = Field(
        ...,
        description="Explicit statement of any epistemic uncertainty, ambiguities, or missing context.",
    )

    if PYDANTIC_V2:
        model_config = ConfigDict(extra="forbid")
    elif PYDANTIC_V2 is False:
        class Config:
            extra = "forbid"


class PatchResult(BaseModel):
    """Structured patch proposal produced by BugBuster AI.
    
    CRITICAL: Contains ONLY candidate patch diff and test suggestions.
    Does NOT contain verification state or execution results.
    """

    patch: str = Field(
        ...,
        description="Unified diff representing the smallest reasonable fix (e.g. '--- a/...\\n+++ b/...').",
        min_length=5,
    )
    affected_files: List[str] = Field(
        ...,
        description="List of file paths modified by this patch.",
    )
    test_recommendation: str = Field(
        ...,
        description="Recommended regression test or test case modifications to prove the fix and prevent regressions.",
        min_length=3,
    )
    uncertainty: str = Field(
        ...,
        description="Explicit statement of potential edge cases, side effects, or unverified assumptions.",
    )

    if PYDANTIC_V2:
        model_config = ConfigDict(extra="forbid")
    elif PYDANTIC_V2 is False:
        class Config:
            extra = "forbid"


def validate_unified_diff(patch_str: str) -> bool:
    """Basic validation that a patch string resembles a unified diff."""
    if not patch_str or not patch_str.strip():
        return False
    # Check for standard diff markers
    has_header = "--- " in patch_str and "+++ " in patch_str
    has_hunks = "@@" in patch_str
    has_deltas = ("\n+" in patch_str or patch_str.startswith("+")) or ("\n-" in patch_str or patch_str.startswith("-"))
    return (has_header or has_hunks) and has_deltas
