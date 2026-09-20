"""Background worker for asynchronous pipeline execution."""

from __future__ import annotations

import logging
from typing import Optional
from app.services.analysis_service import AnalysisService

logger = logging.getLogger("patchmind.worker.analysis")


def execute_run_task(run_id: str, analysis_service: AnalysisService) -> None:
    """Execute orchestration pipeline in background thread or task pool."""
    logger.info(f"Starting background execution for run '{run_id}'")
    try:
        analysis_service.execute_orchestration_pipeline(run_id)
        logger.info(f"Completed background execution for run '{run_id}'")
    except Exception as exc:
        logger.error(f"Worker crashed during run '{run_id}': {exc}", exc_info=True)
