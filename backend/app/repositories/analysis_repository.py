"""Repository for Analysis Run database operations."""

from __future__ import annotations

import datetime
import json
import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.models.analysis import Analysis, RunState, VerificationResultState
from app.models.test_run import RunLog


class AnalysisRepository:
    def __init__(self, db: Optional[Session] = None) -> None:
        self.db = db
        self._memory_runs: dict[str, Analysis] = {}
        self._memory_logs: dict[str, List[RunLog]] = {}

    def get(self, run_id: str) -> Optional[Analysis]:
        if self.db:
            return self.db.query(Analysis).filter(Analysis.id == run_id).first()
        return self._memory_runs.get(run_id)

    def list_by_project(self, project_id: str) -> List[Analysis]:
        if self.db:
            return self.db.query(Analysis).filter(Analysis.project_id == project_id).order_by(Analysis.created_at.desc()).all()
        return [r for r in self._memory_runs.values() if r.project_id == project_id]

    def create(
        self,
        project_id: str,
        test_command: str = "pytest",
        target_path: str = "",
        run_id: Optional[str] = None
    ) -> Analysis:
        rid = run_id or f"run-{uuid.uuid4().hex[:12]}"
        analysis = Analysis(
            id=rid,
            project_id=project_id,
            run_state=RunState.QUEUED,
            verification=VerificationResultState.NOT_RUN,
            target_path=target_path,
            test_command=test_command,
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow(),
        )
        if self.db:
            self.db.add(analysis)
            self.db.commit()
            self.db.refresh(analysis)
        else:
            self._memory_runs[rid] = analysis
            self._memory_logs[rid] = []
        return analysis

    def update_state(
        self,
        run_id: str,
        run_state: str,
        verification: Optional[str] = None,
        baseline_test_output: Optional[str] = None,
        diagnosis_dict: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None
    ) -> Optional[Analysis]:
        analysis = self.get(run_id)
        if not analysis:
            return None

        analysis.run_state = run_state
        if verification is not None:
            analysis.verification = verification
        if baseline_test_output is not None:
            analysis.baseline_test_output = baseline_test_output
        if diagnosis_dict is not None:
            analysis.diagnosis_json = json.dumps(diagnosis_dict)
        if error_message is not None:
            analysis.error_message = error_message
        analysis.updated_at = datetime.datetime.utcnow()

        if self.db:
            self.db.commit()
            self.db.refresh(analysis)
        return analysis

    def add_log(
        self,
        run_id: str,
        event_type: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ) -> RunLog:
        log_entry = RunLog(
            id=f"log-{uuid.uuid4().hex[:10]}",
            run_id=run_id,
            timestamp=datetime.datetime.utcnow(),
            event_type=event_type,
            message=message,
            details_json=json.dumps(details or {})
        )
        if self.db:
            self.db.add(log_entry)
            self.db.commit()
        else:
            if run_id not in self._memory_logs:
                self._memory_logs[run_id] = []
            self._memory_logs[run_id].append(log_entry)
        return log_entry

    def get_logs(self, run_id: str) -> List[RunLog]:
        if self.db:
            return self.db.query(RunLog).filter(RunLog.run_id == run_id).order_by(RunLog.timestamp.asc()).all()
        return self._memory_logs.get(run_id, [])
