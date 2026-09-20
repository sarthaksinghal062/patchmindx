"""API Routes for Test Runs and Sandbox Verification Records."""

from __future__ import annotations

from typing import List
from fastapi import APIRouter, HTTPException, status

from app.repositories.test_run_repository import TestRunRepository

router = APIRouter(prefix="/api/test-runs", tags=["test-runs"])


@router.get("/by-run/{runId}")
def get_test_runs_for_run(runId: str):
    """Retrieve all test runs (baseline and verification) recorded for a run."""
    repo = TestRunRepository()
    runs = repo.list_by_run(runId)
    return [r.to_dict() for r in runs]


@router.get("/{testRunId}")
def get_test_run(testRunId: str):
    """Retrieve details for a single test run."""
    repo = TestRunRepository()
    test_run = repo.get(testRunId)
    if not test_run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Test run '{testRunId}' not found.")
    return test_run.to_dict()
