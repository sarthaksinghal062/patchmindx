"""API Routes for Projects."""

from __future__ import annotations

from typing import List
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.dependencies import get_project_service
from app.core.exceptions import InvalidProjectError, ProjectNotFoundError, SecurityValidationError
from app.schemas.project import ProjectCreate, ProjectResponse
from app.services.project_service import ProjectService

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    service: ProjectService = Depends(get_project_service)
):
    """Register a new project with its runtime and default test command."""
    try:
        project = service.create_project(
            name=payload.name,
            description=payload.description or "",
            repository_source=payload.repository_source or "",
            runtime=payload.runtime or "python",
            test_command=payload.test_command or "pytest",
        )
        return project.to_dict()
    except (InvalidProjectError, SecurityValidationError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("", response_model=List[ProjectResponse])
def list_projects(service: ProjectService = Depends(get_project_service)):
    """Retrieve list of registered projects."""
    projects = service.list_projects()
    return [p.to_dict() for p in projects]


@router.get("/{projectId}", response_model=ProjectResponse)
def get_project(
    projectId: str,
    service: ProjectService = Depends(get_project_service)
):
    """Retrieve project details by ID."""
    try:
        project = service.get_project(projectId)
        return project.to_dict()
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/{projectId}/upload", response_model=ProjectResponse)
async def upload_project_archive(
    projectId: str,
    file: UploadFile = File(...),
    service: ProjectService = Depends(get_project_service)
):
    """Upload project zip archive for sandboxed execution."""
    try:
        file_bytes = await file.read()
        project = service.upload_project_archive(
            project_id=projectId,
            file_bytes=file_bytes,
            filename=file.filename or "project.zip"
        )
        return project.to_dict()
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except (InvalidProjectError, SecurityValidationError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
