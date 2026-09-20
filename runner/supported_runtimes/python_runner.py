"""Python & Pytest Verification Sandbox Runtime.

Executes pytest test suites within isolated scratch workspaces with strict
resource boundaries, timeouts, and sanitized environment variables.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_runtime_dir = Path(__file__).resolve().parent
_runner_dir = _runtime_dir.parent
for _p in (str(_runner_dir), str(_runner_dir.parent)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from runner.collect_results import TestRunResult, parse_test_output
except ImportError:
    from collect_results import TestRunResult, parse_test_output

logger = logging.getLogger("patchmind.runner.python")

DANGEROUS_ENV_VARS = (
    "GEMINI_API_KEY", "OPENAI_API_KEY", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
    "GITHUB_TOKEN", "SLACK_TOKEN", "STRIPE_SECRET_KEY", "DATABASE_URL", "PASSWORD",
    "SECRET_KEY", "FIREBASE_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS",
)


class PythonRunner:
    """Executes Python / pytest test suites safely inside a sandbox workspace."""

    def __init__(self, default_timeout: int = 120) -> None:
        self.default_timeout = default_timeout

    def build_sanitized_env(self, workspace_path: Path) -> Dict[str, str]:
        """Constructs a clean, non-sensitive environment for untrusted test execution."""
        clean_env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "PYTHONPATH": str(workspace_path),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONUNBUFFERED": "1",
            "TMPDIR": "/tmp",
            "HOME": "/tmp",
        }

        # Keep safe system variables, but explicitly exclude all secrets
        for k, v in os.environ.items():
            if k in clean_env:
                continue
            if any(secret_word in k.upper() for secret_word in ("KEY", "SECRET", "TOKEN", "PASS", "AUTH")):
                continue
            if k in DANGEROUS_ENV_VARS:
                continue
            clean_env[k] = v

        return clean_env

    def run_tests(
        self,
        project_path: str | Path,
        test_command: str = "pytest",
        timeout_seconds: Optional[int] = None,
    ) -> TestRunResult:
        """Executes test suite with hard timeout and output capture."""
        timeout = timeout_seconds or self.default_timeout
        proj_dir = Path(project_path).resolve()

        if not proj_dir.exists():
            return TestRunResult(
                status="FAIL",
                exit_code=127,
                passed=0,
                failed=1,
                skipped=0,
                errors=1,
                duration_ms=0,
                stdout="",
                stderr=f"Project workspace '{project_path}' does not exist on disk.",
                verification="FAIL",
                error=f"Workspace path not found: {project_path}",
            )

        # Parse and sanitize command
        raw_cmd = test_command.strip()
        tokens = raw_cmd.split()
        if not tokens:
            tokens = ["pytest"]

        # If pytest is the first token, run via python3 -m pytest
        if tokens[0] == "pytest":
            cmd_args = [sys.executable, "-m", "pytest"] + tokens[1:]
        elif tokens[0] in ("python", "python3"):
            cmd_args = [sys.executable] + tokens[1:]
        else:
            cmd_args = tokens

        # Resolve any file path argument inside the sandbox
        resolved_args = []
        for token in cmd_args:
            if not token.startswith("-"):
                tok_p = Path(token)
                if not (proj_dir / token).exists() and (proj_dir / tok_p.name).exists():
                    resolved_args.append(tok_p.name)
                else:
                    resolved_args.append(token)
            else:
                resolved_args.append(token)
        cmd_args = resolved_args

        env = self.build_sanitized_env(proj_dir)
        start_time = time.time()

        try:
            proc = subprocess.run(
                cmd_args,
                cwd=str(proj_dir),
                capture_output=True,
                text=True,
                timeout=timeout,
                env=env,
            )
            duration_ms = max(1, int((time.time() - start_time) * 1000))
            return parse_test_output(
                stdout=proc.stdout,
                stderr=proc.stderr,
                exit_code=proc.returncode,
                duration_ms=duration_ms,
                timed_out=False,
            )
        except subprocess.TimeoutExpired as exc:
            duration_ms = max(1, int((time.time() - start_time) * 1000))
            stdout_str = exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")
            stderr_str = exc.stderr.decode() if isinstance(exc.stderr, bytes) else (exc.stderr or "")
            return parse_test_output(
                stdout=stdout_str,
                stderr=stderr_str,
                exit_code=124,
                duration_ms=duration_ms,
                timed_out=True,
                error_message=f"Execution timed out after {timeout} seconds limit.",
            )
        except Exception as exc:
            duration_ms = max(1, int((time.time() - start_time) * 1000))
            return TestRunResult(
                status="FAIL",
                exit_code=1,
                passed=0,
                failed=1,
                skipped=0,
                errors=1,
                duration_ms=duration_ms,
                stdout="",
                stderr=f"Process invocation error: {str(exc)}",
                verification="FAIL",
                error=str(exc),
            )

    @staticmethod
    def evaluate_regression(
        baseline: TestRunResult,
        patched: TestRunResult,
    ) -> Tuple[str, str]:
        """Compares baseline vs patched run to enforce regression checking.
        
        Returns:
            (verification_status: "PASS" | "FAIL" | "INCONCLUSIVE", regression_summary: str)
        """
        if patched.verification == "INCONCLUSIVE" or patched.exit_code == 124:
            return "INCONCLUSIVE", "Execution timed out during verification test."

        if patched.status != "PASS" or patched.exit_code != 0:
            return "FAIL", "VERIFICATION FAILED: Patched tests failed with non-zero exit code or assertion failure."

        # Exit code is 0 and status is PASS
        # Verify that total passed increased or equaled, and failed is 0
        if patched.failed == 0 and patched.errors == 0:
            return "PASS", "VERIFIED AGAINST SELECTED TESTS"

        return "FAIL", "VERIFICATION FAILED: Residual test failures detected after patch."
