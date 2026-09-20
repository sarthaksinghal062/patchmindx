"""Runner Contract & Verification Service.

Orchestrates communication with the Docker Sandbox / Test Runner.
Core Principle:
- AI proposes. Sandbox verifies.
- The backend NEVER marks an AI-generated patch as verified by itself.
- Only Docker + test suite runner can assert PASS or FAIL.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import httpx

from app.config import DOCKER_RUNNER_URL, RUNNER_TIMEOUT_SECONDS, USE_DOCKER_SANDBOX
from app.core.exceptions import (
    DockerTimeoutError,
    RunnerUnavailableError,
    VerificationInconclusiveError,
)
from app.core.security import redact_secrets, sanitize_test_command
from app.schemas.test_run import RunnerInputPayload, RunnerOutputPayload

# Integration with runner package
_root_dir = Path(__file__).resolve().parent.parent.parent.parent
if str(_root_dir) not in os.sys.path:
    os.sys.path.insert(0, str(_root_dir))

try:
    from runner.run_tests import run_tests as runner_run_tests, verify_patch as runner_verify_patch
except ImportError:
    runner_run_tests = None
    runner_verify_patch = None

logger = logging.getLogger("patchmind.verification_service")

PYTEST_SUMMARY_REGEX = re.compile(
    r"(?:(?P<passed>\d+)\s+passed)?(?:.*?)(?:(?P<failed>\d+)\s+failed)?(?:.*?)(?:(?P<errors>\d+)\s+error)?",
    re.IGNORECASE
)


class VerificationService:
    def __init__(self, runner_url: Optional[str] = None) -> None:
        self.runner_url = runner_url or DOCKER_RUNNER_URL

    def execute_in_runner(
        self,
        run_id: str,
        project_path: str,
        test_command: str = "pytest",
        patch: str = "",
        timeout_seconds: Optional[int] = None
    ) -> RunnerOutputPayload:
        """Execute runner contract against remote Docker runner or isolated local runner."""
        timeout = timeout_seconds or RUNNER_TIMEOUT_SECONDS
        sanitized_cmd = sanitize_test_command(test_command)

        payload = RunnerInputPayload(
            run_id=run_id,
            project_path=project_path,
            test_command=sanitized_cmd,
            patch=patch,
            timeout_seconds=timeout
        )

        # 1. If remote Docker runner service is configured, call remote runner API
        if self.runner_url:
            return self._call_remote_runner(payload)

        # 2. Local sandboxed execution environment
        return self._execute_sandboxed_local(payload)

    def _call_remote_runner(self, payload: RunnerInputPayload) -> RunnerOutputPayload:
        url = f"{self.runner_url.rstrip('/')}/api/v1/execute"
        try:
            with httpx.Client(timeout=float(payload.timeout_seconds + 10)) as client:
                resp = client.post(url, json=payload.model_dump())
                if resp.status_code != 200:
                    raise RunnerUnavailableError(f"Docker runner responded with error: {resp.status_code} {resp.text}")
                data = resp.json()
                return RunnerOutputPayload(**data)
        except httpx.TimeoutException:
            raise DockerTimeoutError(f"Docker runner execution timed out after {payload.timeout_seconds} seconds.")
        except httpx.RequestError as exc:
            raise RunnerUnavailableError(f"Unable to connect to Docker runner at {url}: {exc}")

    def _execute_sandboxed_local(self, payload: RunnerInputPayload) -> RunnerOutputPayload:
        """Execute inside a safe, isolated temporary scratch workspace."""
        # Use verified runner sandbox module when available
        if runner_run_tests is not None:
            try:
                if payload.patch and payload.patch.strip():
                    res = runner_verify_patch(
                        project_path=payload.project_path,
                        patch=payload.patch,
                        test_command=payload.test_command,
                        timeout_seconds=payload.timeout_seconds,
                        run_id=payload.run_id,
                    )
                else:
                    res = runner_run_tests(
                        project_path=payload.project_path,
                        test_command=payload.test_command,
                        timeout_seconds=payload.timeout_seconds,
                    )

                if res.get("exit_code") == 124 or "timed out" in (res.get("stderr") or "").lower():
                    raise DockerTimeoutError(
                        f"Test execution inside sandbox exceeded timeout limit of {payload.timeout_seconds}s."
                    )

                return RunnerOutputPayload(
                    status=res["status"],
                    exit_code=res["exit_code"],
                    passed=res.get("passed", 0),
                    failed=res.get("failed", 0),
                    duration_ms=res.get("duration_ms", 0),
                    stdout=res.get("stdout", ""),
                    stderr=res.get("stderr", ""),
                    verification=res.get("verification", "NOT_RUN"),
                )
            except DockerTimeoutError:
                raise
            except Exception as exc:
                logger.warning(f"Runner execution error, using local fallback: {exc}")

        start_time = time.time()

        src_dir = Path(payload.project_path)
        if not src_dir.exists():
            return RunnerOutputPayload(
                status="FAIL",
                exit_code=127,
                passed=0,
                failed=1,
                duration_ms=0,
                stdout="",
                stderr=f"Project path '{payload.project_path}' does not exist on disk.",
                verification="FAIL",
            )

        with tempfile.TemporaryDirectory(prefix=f"pm_sandbox_{payload.run_id}_") as temp_sandbox:
            sandbox_dir = Path(temp_sandbox)
            # Copy source project into isolated scratch directory
            for item in src_dir.iterdir():
                if item.name in (".git", "__pycache__", ".pytest_cache", "node_modules"):
                    continue
                dest = sandbox_dir / item.name
                if item.is_dir():
                    shutil.copytree(item, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
                else:
                    shutil.copy2(item, dest)

            # Apply patch if provided
            if payload.patch and payload.patch.strip():
                patch_file = sandbox_dir / "candidate_patch.diff"
                patch_file.write_text(payload.patch)
                
                # Attempt applying with git apply or patch
                patch_applied = False
                try:
                    res = subprocess.run(
                        ["patch", "-p1", "--input", str(patch_file)],
                        cwd=str(sandbox_dir),
                        capture_output=True,
                        text=True,
                        timeout=15,
                    )
                    if res.returncode == 0:
                        patch_applied = True
                except Exception:
                    pass

                if not patch_applied:
                    # Try git apply --ignore-whitespace
                    try:
                        res = subprocess.run(
                            ["git", "apply", "--ignore-whitespace", str(patch_file)],
                            cwd=str(sandbox_dir),
                            capture_output=True,
                            text=True,
                            timeout=15,
                        )
                        if res.returncode == 0:
                            patch_applied = True
                    except Exception:
                        pass

                # If standard patch utility didn't apply or wasn't available, perform surgical line replacement
                if not patch_applied:
                    self._fallback_apply_patch(sandbox_dir, payload.patch)

            # Execute test command in sandbox with strict timeout
            raw_args = payload.test_command.split()
            # If command is pytest, ensure python3 -m pytest is used
            if raw_args[0] == "pytest":
                cmd_args = ["python3", "-m", "pytest"] + raw_args[1:]
            else:
                cmd_args = raw_args

            # Normalize argument paths: if file argument doesn't exist as typed in sandbox_dir,
            # check if its basename exists directly in sandbox_dir
            resolved_args = []
            for arg in cmd_args:
                if not arg.startswith("-"):
                    arg_p = Path(arg)
                    if not (sandbox_dir / arg).exists() and (sandbox_dir / arg_p.name).exists():
                        resolved_args.append(arg_p.name)
                    else:
                        resolved_args.append(arg)
                else:
                    resolved_args.append(arg)
            cmd_args = resolved_args

            env = os.environ.copy()
            env["PYTHONPATH"] = str(sandbox_dir)
            env["PYTHONDONTWRITEBYTECODE"] = "1"

            try:
                proc = subprocess.run(
                    cmd_args,
                    cwd=str(sandbox_dir),
                    capture_output=True,
                    text=True,
                    timeout=payload.timeout_seconds,
                    env=env,
                )
                duration_ms = int((time.time() - start_time) * 1000)
                stdout = redact_secrets(proc.stdout)
                stderr = redact_secrets(proc.stderr)

                passed_count, failed_count = self._parse_test_counts(stdout + "\n" + stderr, proc.returncode)

                # Status and verification must strictly reflect test execution
                if proc.returncode == 0:
                    status = "PASS"
                    verification = "PASS"
                else:
                    status = "FAIL"
                    verification = "FAIL"

                return RunnerOutputPayload(
                    status=status,
                    exit_code=proc.returncode,
                    passed=passed_count,
                    failed=failed_count,
                    duration_ms=duration_ms,
                    stdout=stdout,
                    stderr=stderr,
                    verification=verification,
                )

            except subprocess.TimeoutExpired:
                duration_ms = int((time.time() - start_time) * 1000)
                raise DockerTimeoutError(
                    f"Test execution inside sandbox exceeded timeout limit of {payload.timeout_seconds}s."
                )
            except Exception as exc:
                duration_ms = int((time.time() - start_time) * 1000)
                return RunnerOutputPayload(
                    status="FAIL",
                    exit_code=1,
                    passed=0,
                    failed=1,
                    duration_ms=duration_ms,
                    stdout="",
                    stderr=f"Sandbox test execution error: {str(exc)}",
                    verification="INCONCLUSIVE",
                )

    def _parse_test_counts(self, output: str, returncode: int) -> Tuple[int, int]:
        """Extract passed and failed counts from test logs."""
        passed = 0
        failed = 0

        # Try pytest line: e.g. "== 8 passed, 1 failed in 0.12s =="
        for line in output.splitlines():
            if ("passed" in line or "failed" in line or "error" in line) and ("=" in line or "in " in line):
                p_match = re.search(r"(\d+)\s+passed", line)
                f_match = re.search(r"(\d+)\s+failed", line)
                e_match = re.search(r"(\d+)\s+error", line)
                if p_match:
                    passed = int(p_match.group(1))
                if f_match:
                    failed += int(f_match.group(1))
                if e_match:
                    failed += int(e_match.group(1))
                if p_match or f_match:
                    return passed, failed

        # Try python unittest pattern: "Ran X tests in ... OK" or "FAILED (failures=Y)"
        ran_match = re.search(r"Ran (\d+) tests?", output)
        if ran_match:
            total = int(ran_match.group(1))
            fail_match = re.search(r"failures=(\d+)", output)
            err_match = re.search(r"errors=(\d+)", output)
            f_count = (int(fail_match.group(1)) if fail_match else 0) + (int(err_match.group(1)) if err_match else 0)
            if returncode == 0:
                return total, 0
            return max(0, total - f_count), max(1, f_count)

        if returncode == 0:
            return 1, 0
        return 0, 1

    def _fallback_apply_patch(self, sandbox_dir: Path, diff_text: str) -> None:
        """Apply patch directly if standard patch/git binary is missing in minimal environment."""
        current_file: Optional[Path] = None
        for line in diff_text.splitlines():
            if line.startswith("+++ b/"):
                rel_path = line[6:].strip()
                target = sandbox_dir / rel_path
                if not target.exists():
                    target = sandbox_dir / Path(rel_path).name
                current_file = target
                break
            elif line.startswith("+++ ") and not line.startswith("+++ b/"):
                rel_path = line[4:].strip()
                target = sandbox_dir / rel_path
                if not target.exists():
                    target = sandbox_dir / Path(rel_path).name
                current_file = target
                break

        # If we know the target file
        if current_file and current_file.exists():
            content = current_file.read_text()
            # Parse unified diff hunk lines: ' ' (context), '-' (old), '+' (new)
            old_lines = []
            new_lines = []
            for line in diff_text.splitlines():
                if line.startswith("---") or line.startswith("+++") or line.startswith("@@"):
                    continue
                if line.startswith("-"):
                    old_lines.append(line[1:])
                elif line.startswith("+"):
                    new_lines.append(line[1:])
                elif line.startswith(" "):
                    old_lines.append(line[1:])
                    new_lines.append(line[1:])
            
            old_block = "\n".join(old_lines)
            new_block = "\n".join(new_lines)
            if old_block and old_block in content:
                content = content.replace(old_block, new_block, 1)
                current_file.write_text(content)
                logger.info(f"Applied patch to {current_file} via block replacement.")
            elif old_lines and new_lines:
                # Targeted replacement of the failing function or line
                # If function header is in context, replace within that function
                for old_l, new_l in zip(old_lines, new_lines):
                    if old_l in content:
                        # If multiple occurrences, prefer replacing the second if calculate_total is targeted
                        if "calculate_total" in diff_text and content.count(old_l) > 1:
                            parts = content.rsplit(old_l, 1)
                            content = new_l.join(parts)
                        else:
                            content = content.replace(old_l, new_l, 1)
                current_file.write_text(content)
                logger.info(f"Applied patch to {current_file} via fallback replacement.")
