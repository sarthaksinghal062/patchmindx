"""Structured logging and run telemetry for PatchMind Backend."""

from __future__ import annotations

import datetime
import logging
from typing import Any, Dict, List, Optional
from .security import redact_secrets

logger = logging.getLogger("patchmind.backend")


class RunEventType:
    RUN_CREATED = "RUN_CREATED"
    BASELINE_STARTED = "BASELINE_STARTED"
    BASELINE_COMPLETED = "BASELINE_COMPLETED"
    ANALYSIS_STARTED = "ANALYSIS_STARTED"
    ANALYSIS_COMPLETED = "ANALYSIS_COMPLETED"
    PATCH_GENERATED = "PATCH_GENERATED"
    PATCH_VALIDATED = "PATCH_VALIDATED"
    VERIFICATION_STARTED = "VERIFICATION_STARTED"
    VERIFICATION_COMPLETED = "VERIFICATION_COMPLETED"
    REPORT_GENERATED = "REPORT_GENERATED"
    RUN_FAILED = "RUN_FAILED"
    RUN_CANCELLED = "RUN_CANCELLED"


def create_log_entry(
    event_type: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    run_id: Optional[str] = None
) -> Dict[str, Any]:
    """Create sanitized structured telemetry log entry."""
    entry = {
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "run_id": run_id,
        "event_type": event_type,
        "message": redact_secrets(message),
        "details": {k: redact_secrets(str(v)) for k, v in (details or {}).items()}
    }
    logger.info(f"[{event_type}] run_id={run_id} msg={entry['message']}")
    return entry
