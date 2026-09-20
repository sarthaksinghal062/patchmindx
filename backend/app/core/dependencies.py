"""FastAPI Dependency Injection Providers."""

from __future__ import annotations

from typing import Generator
from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.patch_repository import PatchRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.test_run_repository import TestRunRepository
from app.services.analysis_service import AnalysisService
from app.services.patch_service import PatchService
from app.services.project_service import ProjectService
from app.services.verification_service import VerificationService


def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    repo = ProjectRepository(db=db)
    return ProjectService(repo=repo)


def get_patch_service() -> PatchService:
    return PatchService()


def get_verification_service() -> VerificationService:
    return VerificationService()


def get_analysis_service(
    db: Session = Depends(get_db),
    verification_service: VerificationService = Depends(get_verification_service),
    patch_service: PatchService = Depends(get_patch_service),
) -> AnalysisService:
    analysis_repo = AnalysisRepository(db=db)
    project_repo = ProjectRepository(db=db)
    patch_repo = PatchRepository(db=db)
    test_run_repo = TestRunRepository(db=db)

    return AnalysisService(
        analysis_repo=analysis_repo,
        project_repo=project_repo,
        patch_repo=patch_repo,
        test_run_repo=test_run_repo,
        verification_service=verification_service,
        patch_service=patch_service,
    )
