"""API Routes for Analysis and Runs."""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from app.core.dependencies import get_analysis_service
from app.core.exceptions import (
    MissingTestCommandError,
    ProjectNotFoundError,
    RunNotFoundError,
    SecurityValidationError,
)
from app.schemas.analysis import RunCancelResponse, RunCreate, RunResponse
from app.schemas.patch import RunDiffResponse
from app.schemas.test_run import RunLogsResponse, RunReportResponse
from app.services.analysis_service import AnalysisService
from app.workers.analysis_worker import execute_run_task

logger = logging.getLogger("patchmind.routes.analysis")

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.post("", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
def create_and_start_run(
    payload: RunCreate,
    background_tasks: BackgroundTasks,
    sync: bool = Query(default=False, description="Whether to execute pipeline synchronously"),
    service: AnalysisService = Depends(get_analysis_service),
):
    """Create a new run and orchestrate the diagnosis, patch, and verification pipeline."""
    try:
        run = service.create_run(
            project_id=payload.project_id,
            test_command=payload.test_command,
            target_path=payload.target_path,
        )

        if sync:
            # Synchronous execution for demo/testing
            completed_run = service.execute_orchestration_pipeline(run.id)
            return completed_run.to_dict()
        else:
            # Asynchronous background execution
            background_tasks.add_task(execute_run_task, run.id, service)
            return run.to_dict()

    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except (MissingTestCommandError, SecurityValidationError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{runId}", response_model=RunResponse)
def get_run(
    runId: str,
    service: AnalysisService = Depends(get_analysis_service),
):
    """Retrieve run state, verification status, and error details."""
    try:
        run = service.get_run(runId)
        return run.to_dict()
    except RunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/{runId}/logs", response_model=RunLogsResponse)
def get_run_logs(
    runId: str,
    service: AnalysisService = Depends(get_analysis_service),
):
    """Retrieve chronologically ordered structured telemetry logs for a run."""
    try:
        service.get_run(runId)  # verify run exists
        logs = service.analysis_repo.get_logs(runId)
        return RunLogsResponse(
            run_id=runId,
            logs=[l.to_dict() for l in logs]
        )
    except RunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/{runId}/diff", response_model=RunDiffResponse)
def get_run_diff(
    runId: str,
    service: AnalysisService = Depends(get_analysis_service),
):
    """Retrieve candidate patch unified diff and syntax validation status."""
    try:
        service.get_run(runId)
        patch = service.patch_repo.get_by_run(runId)
        if not patch:
            return RunDiffResponse(
                run_id=runId,
                patch_id=None,
                diff="",
                affected_files=[],
                is_syntactically_valid=False,
                validation_details="No patch generated yet.",
            )
        p_dict = patch.to_dict()
        return RunDiffResponse(
            run_id=runId,
            patch_id=p_dict.get("id"),
            diff=p_dict.get("unified_diff", ""),
            affected_files=p_dict.get("affected_files", []),
            is_syntactically_valid=p_dict.get("is_syntactically_valid", False),
            validation_details=p_dict.get("validation_details", ""),
        )
    except RunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/{runId}/report", response_model=RunReportResponse)
def get_run_report(
    runId: str,
    service: AnalysisService = Depends(get_analysis_service),
):
    """Retrieve comprehensive verification report with full baseline and test evidence."""
    try:
        return service.generate_report(runId)
    except RunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/{runId}/cancel", response_model=RunCancelResponse)
def cancel_run(
    runId: str,
    service: AnalysisService = Depends(get_analysis_service),
):
    """Cancel an active or queued run."""
    try:
        run = service.cancel_run(runId)
        return RunCancelResponse(
            run_id=run.id,
            run_state=run.run_state,
            message="Run has been successfully cancelled."
        )
    except RunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
