"""API Routes for Patches."""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.dependencies import get_patch_service
from app.repositories.patch_repository import PatchRepository
from app.schemas.patch import PatchResponse
from app.services.patch_service import PatchService

router = APIRouter(prefix="/api/patches", tags=["patches"])


class PatchValidationRequest(BaseModel):
    diff: str


class PatchValidationResponse(BaseModel):
    is_valid: bool
    affected_files: list[str]
    details: str


@router.post("/validate", response_model=PatchValidationResponse)
def validate_patch(
    payload: PatchValidationRequest,
    service: PatchService = Depends(get_patch_service)
):
    """Validate unified diff structure, safety, and file boundary compliance."""
    is_valid, files, details = service.validate_patch_structure(payload.diff)
    return PatchValidationResponse(
        is_valid=is_valid,
        affected_files=files,
        details=details
    )


@router.get("/{patchId}", response_model=PatchResponse)
def get_patch(
    patchId: str,
):
    """Retrieve patch record by patch ID."""
    repo = PatchRepository()
    patch = repo.get(patchId)
    if not patch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patch '{patchId}' not found.")
    return patch.to_dict()
