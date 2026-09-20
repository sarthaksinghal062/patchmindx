"""Test Result Parser for PatchMind Runner.

Extracts normalized metrics (passed, failed, skipped, errors, duration, exit_code)
from pytest and test runner execution outputs.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional, Tuple

SECRET_PATTERNS = [
    (re.compile(r"(?i)(api[_-]?key|secret|token|password|auth|bearer)\s*[:=]\s*['\"]?([a-zA-Z0-9_\-\.]{8,})['\"]?"), r"\1: '***REDACTED***'"),
    (re.compile(r"sk-[a-zA-Z0-9]{20,}"), "***REDACTED***"),
    (re.compile(r"AIza[0-9A-Za-z\-_]{35}"), "***REDACTED***"),
    (re.compile(r"ghp_[a-zA-Z0-9]{36}"), "***REDACTED***"),
]


def redact_secrets(text: str) -> str:
    """Redacts any sensitive tokens, keys, or passwords from logs and output."""
    if not text:
        return ""
    sanitized = text
    for pattern, replacement in SECRET_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


@dataclass
class TestRunResult:
    status: str
    exit_code: int
    passed: int
    failed: int
    skipped: int
    errors: int
    duration_ms: int
    stdout: str
    stderr: str
    verification: str = "NOT_RUN"
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        if self.error is None:
            d.pop("error", None)
        return d


def parse_pytest_summary(combined_output: str) -> Tuple[int, int, int, int]:
    """Parse passed, failed, skipped, error counts from pytest summary lines."""
    passed = 0
    failed = 0
    skipped = 0
    errors = 0

    # Look for pytest short summary lines, e.g.:
    # "=== 9 passed in 0.12s ==="
    # "=== 1 failed, 8 passed in 0.05s ==="
    # "=== 1 failed, 8 passed, 2 skipped, 1 error in 1.45s ==="
    lines = combined_output.splitlines()
    for line in reversed(lines):
        clean_line = line.strip("= ")
        if any(token in clean_line for token in ("passed", "failed", "error", "skipped")):
            p_match = re.search(r"(\d+)\s+passed", clean_line)
            f_match = re.search(r"(\d+)\s+failed", clean_line)
            s_match = re.search(r"(\d+)\s+skipped", clean_line)
            e_match = re.search(r"(\d+)\s+error", clean_line)

            found = False
            if p_match:
                passed = int(p_match.group(1))
                found = True
            if f_match:
                failed += int(f_match.group(1))
                found = True
            if s_match:
                skipped = int(s_match.group(1))
                found = True
            if e_match:
                errors += int(e_match.group(1))
                found = True

            if found:
                return passed, failed, skipped, errors

    # Check unittest format: "Ran 9 tests in 0.05s" ... "OK" or "FAILED (failures=1, errors=1)"
    ran_match = re.search(r"Ran (\d+) tests?", combined_output)
    if ran_match:
        total = int(ran_match.group(1))
        f_match = re.search(r"failures=(\d+)", combined_output)
        e_match = re.search(r"errors=(\d+)", combined_output)
        s_match = re.search(r"skipped=(\d+)", combined_output)

        f_cnt = int(f_match.group(1)) if f_match else 0
        e_cnt = int(e_match.group(1)) if e_match else 0
        s_cnt = int(s_match.group(1)) if s_match else 0

        failed = f_cnt
        errors = e_cnt
        skipped = s_cnt
        passed = max(0, total - failed - errors - skipped)
        return passed, failed, skipped, errors

    return passed, failed, skipped, errors


def parse_test_output(
    stdout: str,
    stderr: str,
    exit_code: int,
    duration_ms: int = 0,
    timed_out: bool = False,
    error_message: Optional[str] = None,
) -> TestRunResult:
    """Creates a normalized test execution result from raw process output."""
    clean_stdout = redact_secrets(stdout)
    clean_stderr = redact_secrets(stderr)
    combined = f"{clean_stdout}\n{clean_stderr}"

    if timed_out:
        return TestRunResult(
            status="FAIL",
            exit_code=124,
            passed=0,
            failed=0,
            skipped=0,
            errors=1,
            duration_ms=duration_ms,
            stdout=clean_stdout,
            stderr=clean_stderr or (error_message or "Execution timed out"),
            verification="INCONCLUSIVE",
            error=error_message or "Execution timed out",
        )

    passed, failed, skipped, errors = parse_pytest_summary(combined)

    # If pytest failed to parse any counts but returned non-zero, record 1 failure/error
    if exit_code != 0 and (failed == 0 and errors == 0 and passed == 0):
        failed = 1

    # Verification rule:
    # IF patched tests pass AND exit code == 0 THEN verification = PASS
    # IF tests fail THEN verification = FAIL
    if exit_code == 0 and failed == 0 and errors == 0:
        status = "PASS"
        verification = "PASS"
    else:
        status = "FAIL"
        verification = "FAIL"

    return TestRunResult(
        status=status,
        exit_code=exit_code,
        passed=passed,
        failed=failed,
        skipped=skipped,
        errors=errors,
        duration_ms=duration_ms,
        stdout=clean_stdout,
        stderr=clean_stderr,
        verification=verification,
        error=error_message,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse pytest results into normalized JSON")
    parser.add_argument("--stdout-file", type=str, help="Path to stdout log file")
    parser.add_argument("--stderr-file", type=str, help="Path to stderr log file")
    parser.add_argument("--exit-code", type=int, default=0, help="Process exit code")
    parser.add_argument("--duration-ms", type=int, default=0, help="Execution duration in milliseconds")
    parser.add_argument("--timeout", action="store_true", help="Whether execution timed out")
    args = parser.parse_args()

    stdout = ""
    if args.stdout_file:
        try:
            with open(args.stdout_file, "r", encoding="utf-8", errors="replace") as f:
                stdout = f.read()
        except Exception:
            pass

    stderr = ""
    if args.stderr_file:
        try:
            with open(args.stderr_file, "r", encoding="utf-8", errors="replace") as f:
                stderr = f.read()
        except Exception:
            pass

    res = parse_test_output(
        stdout=stdout,
        stderr=stderr,
        exit_code=args.exit_code,
        duration_ms=args.duration_ms,
        timed_out=args.timeout,
    )

    print(json.dumps(res.to_dict(), indent=2))


if __name__ == "__main__":
    main()
