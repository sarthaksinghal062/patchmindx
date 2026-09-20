"""Repository for TestRun and VerificationResult operations."""

from __future__ import annotations

import datetime
import json
import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.models.test_run import TestRun, TestStage


class TestRunRepository:
    def __init__(self, db: Optional[Session] = None) -> None:
        self.db = db
        self._memory_test_runs: dict[str, TestRun] = {}

    def get(self, test_run_id: str) -> Optional[TestRun]:
        if self.db:
            return self.db.query(TestRun).filter(TestRun.id == test_run_id).first()
        return self._memory_test_runs.get(test_run_id)

    def list_by_run(self, run_id: str) -> List[TestRun]:
        if self.db:
            return self.db.query(TestRun).filter(TestRun.run_id == run_id).order_by(TestRun.created_at.asc()).all()
        return [t for t in self._memory_test_runs.values() if t.run_id == run_id]

    def get_verification_test(self, run_id: str) -> Optional[TestRun]:
        if self.db:
            return self.db.query(TestRun).filter(
                TestRun.run_id == run_id,
                TestRun.stage == TestStage.VERIFICATION
            ).order_by(TestRun.created_at.desc()).first()
        for t in reversed(list(self._memory_test_runs.values())):
            if t.run_id == run_id and t.stage == TestStage.VERIFICATION:
                return t
        return None

    def get_baseline_test(self, run_id: str) -> Optional[TestRun]:
        if self.db:
            return self.db.query(TestRun).filter(
                TestRun.run_id == run_id,
                TestRun.stage == TestStage.BASELINE
            ).order_by(TestRun.created_at.desc()).first()
        for t in reversed(list(self._memory_test_runs.values())):
            if t.run_id == run_id and t.stage == TestStage.BASELINE:
                return t
        return None

    def create(
        self,
        run_id: str,
        stage: str,
        status: str,
        verification: str,
        exit_code: int,
        passed_count: int = 0,
        failed_count: int = 0,
        duration_ms: int = 0,
        stdout: str = "",
        stderr: str = "",
        report_data: Optional[Dict[str, Any]] = None,
        patch_id: Optional[str] = None,
        test_run_id: Optional[str] = None,
    ) -> TestRun:
        tr_id = test_run_id or f"tr-{uuid.uuid4().hex[:10]}"
        test_run = TestRun(
            id=tr_id,
            run_id=run_id,
            patch_id=patch_id,
            stage=stage,
            status=status,
            verification=verification,
            exit_code=exit_code,
            passed_count=passed_count,
            failed_count=failed_count,
            duration_ms=duration_ms,
            stdout=stdout,
            stderr=stderr,
            report_json=json.dumps(report_data or {}),
            created_at=datetime.datetime.utcnow(),
        )
        if self.db:
            self.db.add(test_run)
            self.db.commit()
            self.db.refresh(test_run)
        else:
            self._memory_test_runs[tr_id] = test_run
        return test_run
