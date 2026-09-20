"""Analysis Service & Pipeline Orchestrator.

Implements the end-to-end orchestration lifecycle:
Create run
   ↓
Inspect project
   ↓
Baseline test
   ↓
Collect failure
   ↓
Call AI Engine
   ↓
DiagnosisResult
   ↓
PatchResult
   ↓
Patch validation
   ↓
Send patch to Runner
   ↓
Receive VerificationResult
   ↓
Store evidence
   ↓
Final Report

Strict Mandate:
AI proposes. Sandbox verifies. The backend NEVER marks an AI-generated patch as verified by itself.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.ai import (
    AIEmptyPatchError,
    AILLMError,
    AIResponseParsingError,
    AISchemaValidationError,
    AITimeoutError,
    DiagnosisResult,
    PatchResult,
    analyze_failure,
    generate_patch,
    get_default_llm_client,
)
from app.config import WORKSPACE_ROOT
from app.core.exceptions import (
    AIEngineTimeoutError,
    BaselineTimeoutError,
    DockerTimeoutError,
    MalformedAIResponseError,
    MissingTestCommandError,
    PatchValidationError,
    ProjectNotFoundError,
    RunCancelledError,
    RunNotFoundError,
    RunnerUnavailableError,
    SecurityValidationError,
)
from app.core.logging import RunEventType
from app.core.security import validate_safe_relative_path
from app.models.analysis import Analysis, RunState, VerificationResultState
from app.models.test_run import TestRun, TestStage
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.patch_repository import PatchRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.test_run_repository import TestRunRepository
from app.schemas.test_run import RunReportResponse
from app.services.patch_service import PatchService
from app.services.verification_service import VerificationService

logger = logging.getLogger("patchmind.analysis_service")


class AnalysisService:
    def __init__(
        self,
        analysis_repo: AnalysisRepository,
        project_repo: ProjectRepository,
        patch_repo: PatchRepository,
        test_run_repo: TestRunRepository,
        verification_service: VerificationService,
        patch_service: Optional[PatchService] = None,
    ) -> None:
        self.analysis_repo = analysis_repo
        self.project_repo = project_repo
        self.patch_repo = patch_repo
        self.test_run_repo = test_run_repo
        self.verification_service = verification_service
        self.patch_service = patch_service or PatchService()
        self._cancelled_runs: set[str] = set()

    def get_run(self, run_id: str) -> Analysis:
        run = self.analysis_repo.get(run_id)
        if not run:
            raise RunNotFoundError(f"Run '{run_id}' not found.")
        return run

    def cancel_run(self, run_id: str) -> Analysis:
        run = self.get_run(run_id)
        if run.run_state in (RunState.COMPLETED, RunState.FAILED, RunState.CANCELLED):
            return run

        self._cancelled_runs.add(run_id)
        self.analysis_repo.update_state(
            run_id=run_id,
            run_state=RunState.CANCELLED,
            verification=VerificationResultState.NOT_RUN,
            error_message="Execution cancelled by user request."
        )
        self.analysis_repo.add_log(
            run_id=run_id,
            event_type=RunEventType.RUN_CANCELLED,
            message="Run marked as CANCELLED."
        )
        return self.get_run(run_id)

    def create_run(
        self,
        project_id: str,
        test_command: Optional[str] = "pytest",
        target_path: Optional[str] = ""
    ) -> Analysis:
        project = self.project_repo.get(project_id)
        if not project:
            raise ProjectNotFoundError(f"Project with ID '{project_id}' not found.")

        cmd = test_command or project.test_command or "pytest"
        if not cmd.strip():
            raise MissingTestCommandError("A valid test_command is required to execute a run.")

        target = target_path or ""
        if target:
            validate_safe_relative_path(target)

        run = self.analysis_repo.create(
            project_id=project_id,
            test_command=cmd.strip(),
            target_path=target.strip(),
        )

        self.analysis_repo.add_log(
            run_id=run.id,
            event_type=RunEventType.RUN_CREATED,
            message=f"Initialized run against project '{project.name}' with command '{cmd}'."
        )
        return run

    def execute_orchestration_pipeline(self, run_id: str) -> Analysis:
        """Run the end-to-end pipeline across all states."""
        run = self.get_run(run_id)
        project = self.project_repo.get(run.project_id)
        if not project:
            raise ProjectNotFoundError(f"Project '{run.project_id}' not found.")

        try:
            self._check_cancellation(run_id)

            # -------------------------------------------------------------
            # 1. INSPECTING PROJECT
            # -------------------------------------------------------------
            self.analysis_repo.update_state(run_id=run_id, run_state=RunState.INSPECTING)
            self.analysis_repo.add_log(
                run_id=run_id,
                event_type="INSPECTING_STARTED",
                message="Inspecting repository tree, runtime configurations, and test suites."
            )

            # Resolve project root directory
            project_dir = self._resolve_project_dir(project, run.target_path)
            self._check_cancellation(run_id)

            # -------------------------------------------------------------
            # 2. BASELINE_RUNNING (Reproduce Failure)
            # -------------------------------------------------------------
            self.analysis_repo.update_state(run_id=run_id, run_state=RunState.BASELINE_RUNNING)
            self.analysis_repo.add_log(
                run_id=run_id,
                event_type=RunEventType.BASELINE_STARTED,
                message=f"Running baseline reproduction: '{run.test_command}'"
            )

            baseline_runner_res = self.verification_service.execute_in_runner(
                run_id=run_id,
                project_path=str(project_dir),
                test_command=run.test_command,
                patch="",
            )

            # Record baseline test run
            self.test_run_repo.create(
                run_id=run_id,
                stage=TestStage.BASELINE,
                status=baseline_runner_res.status,
                verification=VerificationResultState.NOT_RUN,  # Baseline never asserts patch verification
                exit_code=baseline_runner_res.exit_code,
                passed_count=baseline_runner_res.passed,
                failed_count=baseline_runner_res.failed,
                duration_ms=baseline_runner_res.duration_ms,
                stdout=baseline_runner_res.stdout,
                stderr=baseline_runner_res.stderr,
                report_data=baseline_runner_res.model_dump(),
            )

            self.analysis_repo.add_log(
                run_id=run_id,
                event_type=RunEventType.BASELINE_COMPLETED,
                message=f"Baseline finished with exit_code={baseline_runner_res.exit_code} (passed={baseline_runner_res.passed}, failed={baseline_runner_res.failed})."
            )

            baseline_output = baseline_runner_res.stdout + "\n" + baseline_runner_res.stderr
            self.analysis_repo.update_state(run_id=run_id, run_state=RunState.BASELINE_RUNNING, baseline_test_output=baseline_output)
            self._check_cancellation(run_id)

            # -------------------------------------------------------------
            # 3. ANALYZING (Call AI Engine for Root Cause)
            # -------------------------------------------------------------
            self.analysis_repo.update_state(run_id=run_id, run_state=RunState.ANALYZING)
            self.analysis_repo.add_log(
                run_id=run_id,
                event_type=RunEventType.ANALYSIS_STARTED,
                message="Dispatched failure trace to PatchMind AI Engine for root cause diagnosis."
            )

            # Collect source context from project
            source_context, test_context = self._collect_contexts(project_dir)

            try:
                llm_client = get_default_llm_client()
                diagnosis: DiagnosisResult = analyze_failure(
                    test_output=baseline_output,
                    source_code=source_context,
                    test_code=test_context,
                    llm_client=llm_client,
                )
            except (AITimeoutError, TimeoutError) as e:
                raise AIEngineTimeoutError(f"AI diagnosis timed out: {e}")
            except (AIResponseParsingError, AISchemaValidationError) as e:
                raise MalformedAIResponseError(f"AI diagnosis output was malformed: {e}")
            except Exception as e:
                raise MalformedAIResponseError(f"AI diagnosis error: {e}")

            self.analysis_repo.update_state(
                run_id=run_id,
                run_state=RunState.ANALYZING,
                diagnosis_dict=diagnosis.model_dump() if hasattr(diagnosis, "model_dump") else diagnosis.__dict__
            )
            self.analysis_repo.add_log(
                run_id=run_id,
                event_type=RunEventType.ANALYSIS_COMPLETED,
                message=f"Root cause identified: '{diagnosis.root_cause[:80]}...'"
            )
            self._check_cancellation(run_id)

            # -------------------------------------------------------------
            # 4. PATCH_GENERATING (Call AI Engine for Unified Diff)
            # -------------------------------------------------------------
            self.analysis_repo.update_state(run_id=run_id, run_state=RunState.PATCH_GENERATING)
            self.analysis_repo.add_log(
                run_id=run_id,
                event_type=RunEventType.PATCH_GENERATED,
                message="AI Engine synthesizing unified diff patch."
            )

            try:
                patch_result: PatchResult = generate_patch(
                    diagnosis=diagnosis,
                    test_output=baseline_output,
                    source_code=source_context,
                    test_code=test_context,
                    llm_client=llm_client,
                )
            except (AITimeoutError, TimeoutError) as e:
                raise AIEngineTimeoutError(f"AI patch synthesis timed out: {e}")
            except (AIEmptyPatchError, AIResponseParsingError, AISchemaValidationError) as e:
                raise MalformedAIResponseError(f"AI patch output was empty or malformed: {e}")
            except Exception as e:
                raise MalformedAIResponseError(f"AI patch synthesis error: {e}")

            self._check_cancellation(run_id)

            # -------------------------------------------------------------
            # 5. PATCH_VALIDATING (Audit Diff & Syntax Boundaries)
            # -------------------------------------------------------------
            self.analysis_repo.update_state(run_id=run_id, run_state=RunState.PATCH_VALIDATING)
            
            is_valid, affected_files, validation_msg = self.patch_service.validate_patch_structure(patch_result.patch)
            
            # Persist Patch record
            saved_patch = self.patch_repo.create(
                run_id=run_id,
                unified_diff=patch_result.patch,
                explanation=getattr(patch_result, "test_recommendation", ""),
                affected_files=affected_files,
                is_syntactically_valid=is_valid,
                validation_details=validation_msg,
            )

            self.analysis_repo.add_log(
                run_id=run_id,
                event_type=RunEventType.PATCH_VALIDATED,
                message=f"Patch validation result: {'VALID' if is_valid else 'INVALID'} - {validation_msg}"
            )

            if not is_valid:
                raise PatchValidationError(f"Generated patch failed security/structure validation: {validation_msg}")

            self._check_cancellation(run_id)

            # -------------------------------------------------------------
            # 6. VERIFYING (Send patch to Runner for Sandbox Verification)
            # -------------------------------------------------------------
            # Strict Mandate: AI proposes. Sandbox verifies.
            # Backend NEVER asserts PASS on its own!
            self.analysis_repo.update_state(
                run_id=run_id,
                run_state=RunState.VERIFYING,
                verification=VerificationResultState.NOT_RUN
            )
            self.analysis_repo.add_log(
                run_id=run_id,
                event_type=RunEventType.VERIFICATION_STARTED,
                message="Dispatched candidate patch to Docker Sandbox for real test execution."
            )

            verify_runner_res = self.verification_service.execute_in_runner(
                run_id=run_id,
                project_path=str(project_dir),
                test_command=run.test_command,
                patch=patch_result.patch,
            )

            # Sandbox alone provides the verification outcome
            final_verification = (
                VerificationResultState.PASS if verify_runner_res.verification == "PASS"
                else VerificationResultState.FAIL if verify_runner_res.verification == "FAIL"
                else VerificationResultState.INCONCLUSIVE
            )

            # Record Verification Test Run
            self.test_run_repo.create(
                run_id=run_id,
                patch_id=saved_patch.id,
                stage=TestStage.VERIFICATION,
                status=verify_runner_res.status,
                verification=final_verification,
                exit_code=verify_runner_res.exit_code,
                passed_count=verify_runner_res.passed,
                failed_count=verify_runner_res.failed,
                duration_ms=verify_runner_res.duration_ms,
                stdout=verify_runner_res.stdout,
                stderr=verify_runner_res.stderr,
                report_data=verify_runner_res.model_dump(),
            )

            self.analysis_repo.add_log(
                run_id=run_id,
                event_type=RunEventType.VERIFICATION_COMPLETED,
                message=f"Sandbox test execution completed with verification={final_verification} (passed={verify_runner_res.passed}, failed={verify_runner_res.failed})."
            )

            # -------------------------------------------------------------
            # 7. COMPLETED & Final Report Generation
            # -------------------------------------------------------------
            self.analysis_repo.update_state(
                run_id=run_id,
                run_state=RunState.COMPLETED,
                verification=final_verification,
            )
            self.analysis_repo.add_log(
                run_id=run_id,
                event_type=RunEventType.REPORT_GENERATED,
                message=f"Final run report compiled with verification={final_verification}."
            )

            return self.get_run(run_id)

        except RunCancelledError:
            logger.info(f"Run {run_id} cancelled.")
            return self.get_run(run_id)
        except Exception as exc:
            logger.error(f"Pipeline failure for run {run_id}: {exc}", exc_info=True)
            self.analysis_repo.update_state(
                run_id=run_id,
                run_state=RunState.FAILED,
                verification=VerificationResultState.NOT_RUN,
                error_message=str(exc),
            )
            self.analysis_repo.add_log(
                run_id=run_id,
                event_type=RunEventType.RUN_FAILED,
                message=f"Run failed: {str(exc)}"
            )
            return self.get_run(run_id)

    def generate_report(self, run_id: str) -> RunReportResponse:
        run = self.get_run(run_id)
        baseline_test = self.test_run_repo.get_baseline_test(run_id)
        verify_test = self.test_run_repo.get_verification_test(run_id)
        patch = self.patch_repo.get_by_run(run_id)

        summary = (
            f"Run {run_id} finished in state {run.run_state}. "
            f"Verification Outcome: {run.verification}."
        )
        if verify_test:
            summary += f" Sandbox tests: {verify_test.passed_count} passed, {verify_test.failed_count} failed."

        return RunReportResponse(
            run_id=run.id,
            project_id=run.project_id,
            run_state=run.run_state,
            verification=run.verification,
            baseline=baseline_test.to_dict() if baseline_test else None,
            diagnosis=run.to_dict().get("diagnosis"),
            patch=patch.to_dict() if patch else None,
            verification_test=verify_test.to_dict() if verify_test else None,
            summary=summary,
            created_at=run.created_at.isoformat() if run.created_at else None,
            updated_at=run.updated_at.isoformat() if run.updated_at else None,
        )

    def _check_cancellation(self, run_id: str) -> None:
        if run_id in self._cancelled_runs:
            raise RunCancelledError(f"Run {run_id} was cancelled.")

    def _resolve_project_dir(self, project, target_path: str = "") -> Path:
        """Resolve the effective project filesystem directory."""
        if project.repository_source:
            # If storage path
            cand = Path(project.repository_source)
            if not cand.is_absolute():
                cand = (WORKSPACE_ROOT / project.repository_source).resolve()
            if cand.exists():
                if target_path:
                    sub = (cand / target_path).resolve()
                    if sub.exists():
                        return sub
                return cand

        # Fallback to backend/demo if project points to demo
        demo_path = WORKSPACE_ROOT / "backend" / "demo"
        if target_path:
            cand = (WORKSPACE_ROOT / target_path).resolve()
            if cand.exists():
                return cand
        return demo_path

    def _collect_contexts(self, project_dir: Path) -> tuple[str, str]:
        """Collect source code files and test code files for prompt generation."""
        source_texts = []
        test_texts = []

        for p in project_dir.rglob("*.py"):
            if any(part in p.parts for part in ("__pycache__", ".pytest_cache", "node_modules", "dist")):
                continue
            try:
                content = p.read_text()
                rel_name = str(p.relative_to(project_dir))
                entry = f"# --- File: {rel_name} ---\n{content}\n"
                if "test" in p.name.lower():
                    test_texts.append(entry)
                else:
                    source_texts.append(entry)
            except Exception:
                pass

        return "\n".join(source_texts) or "# No extra source files", "\n".join(test_texts) or "# No extra test files"
