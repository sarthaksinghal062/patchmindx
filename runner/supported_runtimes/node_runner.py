"""Node.js Verification Sandbox Runtime Interface.

Extensible interface for Node.js / Jest / Mocha test runners.
Adheres strictly to the verification contract: Never fakes Node execution.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

_runtime_dir = Path(__file__).resolve().parent
_runner_dir = _runtime_dir.parent
for _p in (str(_runner_dir), str(_runner_dir.parent)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from runner.collect_results import TestRunResult, parse_test_output
except ImportError:
    from collect_results import TestRunResult, parse_test_output

logger = logging.getLogger("patchmind.runner.node")


class NodeRunner:
    """Extensible Node.js test runner interface."""

    def __init__(self, default_timeout: int = 120) -> None:
        self.default_timeout = default_timeout

    def is_available(self) -> bool:
        """Checks if Node.js and npm are present in the current container environment."""
        return bool(shutil.which("node") and shutil.which("npm"))

    def run_tests(
        self,
        project_path: str | Path,
        test_command: str = "npm test",
        timeout_seconds: Optional[int] = None,
    ) -> TestRunResult:
        """Executes Node.js test runner if installed, or returns explicit unconfigured error."""
        timeout = timeout_seconds or self.default_timeout
        proj_dir = Path(project_path).resolve()

        if not self.is_available():
            return TestRunResult(
                status="FAIL",
                exit_code=127,
                passed=0,
                failed=1,
                skipped=0,
                errors=1,
                duration_ms=0,
                stdout="",
                stderr="Node.js runtime environment (node/npm) is not installed in this runner container.",
                verification="FAIL",
                error="Node.js runtime missing: node/npm binary not found.",
            )

        package_json = proj_dir / "package.json"
        if not package_json.exists():
            return TestRunResult(
                status="FAIL",
                exit_code=1,
                passed=0,
                failed=1,
                skipped=0,
                errors=1,
                duration_ms=0,
                stdout="",
                stderr="No package.json found in project directory.",
                verification="FAIL",
                error="Missing package.json",
            )

        cmd_args = test_command.strip().split()
        start_time = time.time()
        try:
            proc = subprocess.run(
                cmd_args,
                cwd=str(proj_dir),
                capture_output=True,
                text=True,
                timeout=timeout,
                env={
                    "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
                    "NODE_ENV": "test",
                    "TMPDIR": "/tmp",
                },
            )
            duration_ms = max(1, int((time.time() - start_time) * 1000))
            return parse_test_output(
                stdout=proc.stdout,
                stderr=proc.stderr,
                exit_code=proc.returncode,
                duration_ms=duration_ms,
            )
        except subprocess.TimeoutExpired:
            duration_ms = max(1, int((time.time() - start_time) * 1000))
            return TestRunResult(
                status="FAIL",
                exit_code=124,
                passed=0,
                failed=0,
                skipped=0,
                errors=1,
                duration_ms=duration_ms,
                stdout="",
                stderr=f"Node.js test execution timed out after {timeout} seconds limit.",
                verification="INCONCLUSIVE",
                error="Execution timed out",
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
                stderr=f"Node runner error: {exc}",
                verification="FAIL",
                error=str(exc),
            )
