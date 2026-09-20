"""Test Runner and Sandbox Verification Orchestration.

CLI & Library Interface:
  run_tests(project_path, test_command, timeout_seconds)
  verify_patch(project_path, patch, test_command, timeout_seconds)

Core Principle:
  AI proposes. Sandbox verifies.
  The sandbox is the final authority for verification.
"""

from __future__ import annotations

import argparse
import datetime
import json
import logging
import os
import sys
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

# Ensure both runner/ and parent directory are on sys.path
_runner_dir = Path(__file__).resolve().parent
_parent_dir = _runner_dir.parent
for _p in (str(_runner_dir), str(_parent_dir)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from runner.apply_patch import apply_patch, validate_patch_safety, PatchSecurityError
    from runner.cleanup import SandboxContext
    from runner.collect_results import TestRunResult
    from runner.supported_runtimes.python_runner import PythonRunner
except ImportError:
    from apply_patch import apply_patch, validate_patch_safety, PatchSecurityError
    from cleanup import SandboxContext
    from collect_results import TestRunResult
    from supported_runtimes.python_runner import PythonRunner

# Configure structured logging
logger = logging.getLogger("patchmind.runner")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stderr)
    formatter = logging.Formatter("[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def _log_event(event_name: str, message: str, callback: Optional[Callable[[str, str], None]] = None) -> None:
    """Emits structured audit logs required by the verification sandbox protocol."""
    log_line = f"[{event_name}] {message}"
    logger.info(log_line)
    if callback:
        try:
            callback(event_name, message)
        except Exception:
            pass


def run_tests(
    project_path: str | Path,
    test_command: str = "pytest",
    timeout_seconds: int = 120,
    runtime: str = "python",
    log_callback: Optional[Callable[[str, str], None]] = None,
) -> Dict[str, Any]:
    """Executes test suite in an isolated scratch sandbox.
    
    Accepts:
        project_path: Path to the project repository
        test_command: Test command (e.g. 'pytest')
        timeout_seconds: Hard execution timeout in seconds
    
    Returns structured dict:
        {
          "status": "PASS" | "FAIL",
          "exit_code": int,
          "passed": int,
          "failed": int,
          "skipped": int,
          "errors": int,
          "duration_ms": int,
          "stdout": str,
          "stderr": str,
          "verification": "PASS" | "FAIL" | "INCONCLUSIVE"
        }
    """
    proj_dir = Path(project_path).resolve()
    if not proj_dir.exists():
        return {
            "status": "FAIL",
            "exit_code": 127,
            "passed": 0,
            "failed": 1,
            "skipped": 0,
            "errors": 1,
            "duration_ms": 0,
            "stdout": "",
            "stderr": f"Project path does not exist: {project_path}",
            "verification": "FAIL",
            "error": "Workspace not found",
        }

    # Isolated ephemeral sandbox
    with SandboxContext(prefix="pm_test_", source_project=proj_dir) as sandbox:
        _log_event("SANDBOX_CREATED", f"Scratch sandbox directory initialized: {sandbox}", log_callback)
        _log_event("PROJECT_COPIED", f"Project files copied into sandbox from {proj_dir}", log_callback)

        runner = PythonRunner(default_timeout=timeout_seconds)
        _log_event("TESTS_STARTED", f"Executing '{test_command}' with timeout {timeout_seconds}s", log_callback)

        res: TestRunResult = runner.run_tests(
            project_path=sandbox,
            test_command=test_command,
            timeout_seconds=timeout_seconds,
        )

        _log_event(
            "TESTS_COMPLETED",
            f"Test execution finished (exit_code={res.exit_code}, passed={res.passed}, failed={res.failed})",
            log_callback
        )
        _log_event("RESULT_COLLECTED", f"Status={res.status}, Verification={res.verification}", log_callback)

    _log_event("SANDBOX_DESTROYED", "Scratch sandbox cleaned up and destroyed.", log_callback)
    return res.to_dict()


def verify_patch(
    project_path: str | Path,
    patch: str,
    test_command: str = "pytest",
    timeout_seconds: int = 120,
    run_id: Optional[str] = None,
    log_callback: Optional[Callable[[str, str], None]] = None,
) -> Dict[str, Any]:
    """Executes the dual-sandbox verification protocol:
    
    1. Clean Baseline Run:
       Creates fresh sandbox -> Runs baseline tests -> Collects baseline result
    2. Patch Application & Validation:
       Validates path security, unified diff structure, boundaries
    3. Fresh Patched Run:
       Creates a brand new, uncontaminated sandbox -> Applies patch -> Runs tests -> Compares regression
    4. Collects full audit evidence and destroys sandboxes.
    """
    effective_run_id = run_id or f"run-{uuid.uuid4().hex[:12]}"
    proj_dir = Path(project_path).resolve()
    container_ref = f"sandbox-runner-{effective_run_id[:16]}"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    if not proj_dir.exists():
        return {
            "status": "FAIL",
            "verification": "FAIL",
            "exit_code": 127,
            "passed": 0,
            "failed": 1,
            "duration_ms": 0,
            "stdout": "",
            "stderr": f"Project path does not exist: {project_path}",
            "evidence": {
                "run_id": effective_run_id,
                "error": "Workspace directory not found",
                "timestamp": now_iso,
            },
        }

    # -------------------------------------------------------------------------
    # STAGE 1: Baseline Run in Fresh Sandbox
    # -------------------------------------------------------------------------
    _log_event("BASELINE_STARTED", f"Running baseline tests against clean repository in {container_ref}", log_callback)
    with SandboxContext(prefix=f"pm_baseline_{effective_run_id}_", source_project=proj_dir) as baseline_sandbox:
        _log_event("SANDBOX_CREATED", f"Baseline sandbox created at {baseline_sandbox}", log_callback)
        _log_event("PROJECT_COPIED", f"Baseline project copied to {baseline_sandbox}", log_callback)

        runner = PythonRunner(default_timeout=timeout_seconds)
        baseline_res = runner.run_tests(
            project_path=baseline_sandbox,
            test_command=test_command,
            timeout_seconds=timeout_seconds,
        )

        _log_event(
            "BASELINE_COMPLETED",
            f"Baseline finished (exit_code={baseline_res.exit_code}, passed={baseline_res.passed}, failed={baseline_res.failed})",
            log_callback
        )
    _log_event("SANDBOX_DESTROYED", "Baseline sandbox destroyed.", log_callback)

    # -------------------------------------------------------------------------
    # STAGE 2: Validate Patch Safety
    # -------------------------------------------------------------------------
    is_safe, safety_msg, target_files = validate_patch_safety(proj_dir, patch)
    if not is_safe:
        _log_event("PATCH_REJECTED", f"Patch security audit failed: {safety_msg}", log_callback)
        return {
            "status": "FAIL",
            "verification": "FAIL",
            "exit_code": 1,
            "passed": 0,
            "failed": 1,
            "duration_ms": 0,
            "stdout": "",
            "stderr": f"PATCH_REJECTED: {safety_msg}",
            "evidence": {
                "run_id": effective_run_id,
                "baseline_result": baseline_res.to_dict(),
                "patch": patch,
                "patched_result": None,
                "exit_code": 1,
                "stdout": "",
                "stderr": f"PATCH_REJECTED: {safety_msg}",
                "duration_ms": 0,
                "container_reference": container_ref,
                "verification_status": "FAIL",
                "regression_status": "PATCH_REJECTED",
                "timestamp": now_iso,
            },
        }

    _log_event("PATCH_VALIDATED", f"Patch passed security audit. Targets: {target_files}", log_callback)

    # -------------------------------------------------------------------------
    # STAGE 3: Patched Run in Fresh Sandbox
    # -------------------------------------------------------------------------
    _log_event("VERIFICATION_STARTED", f"Creating uncontaminated sandbox for candidate patch verification in {container_ref}", log_callback)
    with SandboxContext(prefix=f"pm_patch_{effective_run_id}_", source_project=proj_dir) as patch_sandbox:
        _log_event("SANDBOX_CREATED", f"Verification sandbox created at {patch_sandbox}", log_callback)
        _log_event("PROJECT_COPIED", f"Clean project copied to verification sandbox", log_callback)

        # Apply candidate patch
        apply_res = apply_patch(patch_sandbox, patch)
        if apply_res["status"] != "PATCH_APPLIED":
            _log_event("PATCH_REJECTED", f"Failed to apply patch: {apply_res['message']}", log_callback)
            return {
                "status": "FAIL",
                "verification": "FAIL",
                "exit_code": 1,
                "passed": 0,
                "failed": 1,
                "duration_ms": 0,
                "stdout": "",
                "stderr": apply_res["message"],
                "evidence": {
                    "run_id": effective_run_id,
                    "baseline_result": baseline_res.to_dict(),
                    "patch": patch,
                    "patched_result": None,
                    "exit_code": 1,
                    "stdout": "",
                    "stderr": apply_res["message"],
                    "duration_ms": 0,
                    "container_reference": container_ref,
                    "verification_status": "FAIL",
                    "regression_status": "PATCH_APPLICATION_FAILED",
                    "timestamp": now_iso,
                },
            }

        _log_event("PATCH_APPLIED", f"Candidate patch applied successfully to {apply_res['applied_files']}", log_callback)

        # Execute tests on patched project
        patched_res = runner.run_tests(
            project_path=patch_sandbox,
            test_command=test_command,
            timeout_seconds=timeout_seconds,
        )

        _log_event(
            "TESTS_COMPLETED",
            f"Verification tests completed (exit_code={patched_res.exit_code}, passed={patched_res.passed}, failed={patched_res.failed})",
            log_callback
        )
        _log_event("RESULT_COLLECTED", f"Raw verification outcome: status={patched_res.status}", log_callback)

    _log_event("SANDBOX_DESTROYED", "Verification sandbox destroyed.", log_callback)

    # -------------------------------------------------------------------------
    # STAGE 4: Evaluate Regression & Final Verification Status
    # -------------------------------------------------------------------------
    final_verification, regression_summary = PythonRunner.evaluate_regression(
        baseline=baseline_res,
        patched=patched_res,
    )

    evidence = {
        "run_id": effective_run_id,
        "baseline_result": baseline_res.to_dict(),
        "patch": patch,
        "patched_result": patched_res.to_dict(),
        "exit_code": patched_res.exit_code,
        "stdout": patched_res.stdout,
        "stderr": patched_res.stderr,
        "duration_ms": patched_res.duration_ms,
        "container_reference": container_ref,
        "verification_status": final_verification,
        "regression_status": regression_summary,
        "timestamp": now_iso,
    }

    return {
        "status": "PASS" if final_verification == "PASS" else "FAIL",
        "verification": final_verification,
        "exit_code": patched_res.exit_code,
        "passed": patched_res.passed,
        "failed": patched_res.failed,
        "duration_ms": patched_res.duration_ms,
        "stdout": patched_res.stdout,
        "stderr": patched_res.stderr,
        "evidence": evidence,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="PatchMind Test Runner & Verification Sandbox")
    parser.add_argument("--project", required=True, help="Workspace project directory")
    parser.add_argument("--command", default="pytest", help="Test command to run")
    parser.add_argument("--timeout", type=int, default=120, help="Execution timeout in seconds")
    parser.add_argument("--patch-file", help="Optional unified diff patch to verify")
    args = parser.parse_args()

    if args.patch_file:
        try:
            with open(args.patch_file, "r", encoding="utf-8") as f:
                patch_text = f.read()
        except Exception as exc:
            print(json.dumps({"status": "FAIL", "verification": "FAIL", "error": f"Cannot read patch file: {exc}"}))
            sys.exit(1)

        result = verify_patch(
            project_path=args.project,
            patch=patch_text,
            test_command=args.command,
            timeout_seconds=args.timeout,
        )
    else:
        result = run_tests(
            project_path=args.project,
            test_command=args.command,
            timeout_seconds=args.timeout,
        )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("status") == "PASS" else 1)


if __name__ == "__main__":
    main()
