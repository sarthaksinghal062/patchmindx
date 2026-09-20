"""Background worker for test execution tasks."""

from __future__ import annotations

import logging
from app.services.verification_service import VerificationService
from app.schemas.test_run import RunnerInputPayload, RunnerOutputPayload

logger = logging.getLogger("patchmind.worker.test")


def execute_test_task(
    payload: RunnerInputPayload,
    verification_service: VerificationService
) -> RunnerOutputPayload:
    """Execute test run task in runner."""
    logger.info(f"Executing test task for run_id={payload.run_id}")
    return verification_service.execute_in_runner(
        run_id=payload.run_id,
        project_path=payload.project_path,
        test_command=payload.test_command,
        patch=payload.patch or "",
        timeout_seconds=payload.timeout_seconds,
    )
