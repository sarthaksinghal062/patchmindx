"""Comprehensive Test Suite for PatchMind Sandbox Runner & Verification.

Tests all security constraints and verification contracts:
1. Path Traversal rejection (../../secret.txt -> REJECTED)
2. Absolute Path rejection (/etc/passwd -> REJECTED)
3. Infinite Loop / Timeout handling -> TIMEOUT -> INCONCLUSIVE
4. Bad / Malformed patch -> PATCH_REJECTED
5. Failing patch -> VERIFICATION_FAILED (FAIL)
6. Correct patch -> VERIFIED (PASS)
7. Regression Check -> Another test failing causes VERIFICATION FAILED
8. Non-root / Sanitized Environment (Host secrets stripped and redacted)
9. Ephemeral Scratch Sandbox Cleanup (No disk leak)
10. NodeRunner interface contracts (Does not fake execution)
11. CLI interfaces for run_tests, apply_patch, collect_results, and cleanup
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

# Ensure runner and backend are on sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from runner.apply_patch import (
    PatchSecurityError,
    apply_patch,
    validate_patch_safety,
)
from runner.cleanup import SandboxContext, cleanup_container, cleanup_workspace
from runner.collect_results import parse_test_output, redact_secrets
from runner.run_tests import run_tests, verify_patch
from runner.supported_runtimes.node_runner import NodeRunner
from runner.supported_runtimes.python_runner import PythonRunner


class TestRunnerSandbox(unittest.TestCase):
    def setUp(self):
        self.demo_dir = ROOT_DIR / "backend" / "demo"

    # -------------------------------------------------------------------------
    # 1. Path Traversal Rejection
    # -------------------------------------------------------------------------
    def test_01_path_traversal_rejection(self):
        traversal_diff = (
            "--- a/../../secret.txt\n"
            "+++ b/../../secret.txt\n"
            "@@ -1,1 +1,1 @@\n"
            "-secret\n"
            "+hacked\n"
        )
        is_safe, msg, targets = validate_patch_safety(self.demo_dir, traversal_diff)
        self.assertFalse(is_safe)
        self.assertIn("PATCH_REJECTED", msg)
        self.assertIn("Path traversal", msg)

        # Ensure apply_patch also refuses to apply
        res = apply_patch(self.demo_dir, traversal_diff)
        self.assertEqual(res["status"], "PATCH_REJECTED")
        self.assertIn("Path traversal", res["message"])

    # -------------------------------------------------------------------------
    # 2. Absolute Path Rejection
    # -------------------------------------------------------------------------
    def test_02_absolute_path_rejection(self):
        absolute_diff = (
            "--- a//etc/passwd\n"
            "+++ b//etc/passwd\n"
            "@@ -1,1 +1,1 @@\n"
            "-root:x:0:0\n"
            "+root:x:0:0:hacked\n"
        )
        is_safe, msg, targets = validate_patch_safety(self.demo_dir, absolute_diff)
        self.assertFalse(is_safe)
        self.assertIn("PATCH_REJECTED", msg)

        res = apply_patch(self.demo_dir, absolute_diff)
        self.assertEqual(res["status"], "PATCH_REJECTED")

    # -------------------------------------------------------------------------
    # 3. Infinite Loop / Timeout Handling -> INCONCLUSIVE
    # -------------------------------------------------------------------------
    def test_03_timeout_inconclusive(self):
        with tempfile.TemporaryDirectory(prefix="pm_loop_") as tmp_dir:
            tmp_path = Path(tmp_dir)
            # Create a test that runs in an infinite loop
            loop_test = tmp_path / "test_loop.py"
            loop_test.write_text(
                "import time\n"
                "def test_infinite_loop():\n"
                "    while True:\n"
                "        time.sleep(0.5)\n"
            )

            runner = PythonRunner(default_timeout=2)
            res = runner.run_tests(
                project_path=tmp_path,
                test_command="pytest test_loop.py",
                timeout_seconds=2,
            )

            # Never report PASS after timeout!
            self.assertEqual(res.status, "FAIL")
            self.assertEqual(res.verification, "INCONCLUSIVE")
            self.assertEqual(res.exit_code, 124)
            self.assertIn("timed out", res.stderr.lower())

    # -------------------------------------------------------------------------
    # 4. Bad / Malformed Patch -> PATCH_REJECTED
    # -------------------------------------------------------------------------
    def test_04_bad_patch_rejected(self):
        # Empty patch
        is_safe, msg, _ = validate_patch_safety(self.demo_dir, "")
        self.assertFalse(is_safe)

        # Malformed garbage text
        is_safe, msg, _ = validate_patch_safety(self.demo_dir, "Just some plain text without diff markers")
        self.assertFalse(is_safe)
        self.assertIn("Malformed patch", msg)

        # Binary patch rejection
        binary_patch = "GIT binary patch\nliteral 0\nHcmV?d00001\n"
        is_safe, msg, _ = validate_patch_safety(self.demo_dir, binary_patch)
        self.assertFalse(is_safe)
        self.assertIn("Binary patches", msg)

        # Non-existent target file
        non_existent_diff = (
            "--- a/non_existent_module_999.py\n"
            "+++ b/non_existent_module_999.py\n"
            "@@ -1,1 +1,1 @@\n"
            "-x = 1\n"
            "+x = 2\n"
        )
        is_safe, msg, _ = validate_patch_safety(self.demo_dir, non_existent_diff)
        self.assertFalse(is_safe)
        self.assertIn("does not exist", msg)

    # -------------------------------------------------------------------------
    # 5. Failing Patch -> VERIFICATION_FAILED (FAIL)
    # -------------------------------------------------------------------------
    def test_05_failing_patch_verification_fail(self):
        # A patch that changes the calculation to an incorrect formula (e.g. price + discount)
        failing_patch = (
            "--- a/calculator.py\n"
            "+++ b/calculator.py\n"
            "@@ -16,7 +16,7 @@\n"
            " def calculate_total(price: float, discount: float) -> float:\n"
            "     \"\"\"Calculates total price after discount.\n"
            "     \n"
            "     INTENTIONAL DEFECT:\n"
            "     Multiplies discount by 2.\n"
            "     \"\"\"\n"
            "-    return price - discount * 2\n"
            "+    return price + discount * 3\n"
        )

        res = verify_patch(
            project_path=self.demo_dir,
            patch=failing_patch,
            test_command="pytest test_calculator.py",
            timeout_seconds=30,
        )

        self.assertEqual(res["status"], "FAIL")
        self.assertEqual(res["verification"], "FAIL")
        self.assertEqual(res["failed"], 1)
        self.assertIn("VERIFICATION FAILED", res["evidence"]["regression_status"])

    # -------------------------------------------------------------------------
    # 6. Correct Patch -> VERIFIED (PASS)
    # -------------------------------------------------------------------------
    def test_06_correct_patch_verification_pass(self):
        correct_patch = (
            "--- a/calculator.py\n"
            "+++ b/calculator.py\n"
            "@@ -16,7 +16,7 @@\n"
            " def calculate_total(price: float, discount: float) -> float:\n"
            "     \"\"\"Calculates total price after discount.\n"
            "     \n"
            "     INTENTIONAL DEFECT:\n"
            "     Multiplies discount by 2.\n"
            "     \"\"\"\n"
            "-    return price - discount * 2\n"
            "+    return price - discount\n"
        )

        res = verify_patch(
            project_path=self.demo_dir,
            patch=correct_patch,
            test_command="pytest test_calculator.py",
            timeout_seconds=30,
        )

        self.assertEqual(res["status"], "PASS")
        self.assertEqual(res["verification"], "PASS")
        self.assertEqual(res["passed"], 9)
        self.assertEqual(res["failed"], 0)
        self.assertEqual(res["exit_code"], 0)
        self.assertEqual(res["evidence"]["regression_status"], "VERIFIED AGAINST SELECTED TESTS")
        self.assertIsNotNone(res["evidence"]["container_reference"])
        self.assertIn("run-", res["evidence"]["run_id"])

    # -------------------------------------------------------------------------
    # 7. Regression Check -> Another test failing causes VERIFICATION FAILED
    # -------------------------------------------------------------------------
    def test_07_regression_check_causes_failure(self):
        # A patch that fixes test_calculate_total by hardcoding 90, but breaks other tests
        regression_patch = (
            "--- a/calculator.py\n"
            "+++ b/calculator.py\n"
            "@@ -16,7 +16,7 @@\n"
            " def calculate_total(price: float, discount: float) -> float:\n"
            "     \"\"\"Calculates total price after discount.\n"
            "     \n"
            "     INTENTIONAL DEFECT:\n"
            "     Multiplies discount by 2.\n"
            "     \"\"\"\n"
            "-    return price - discount * 2\n"
            "+    return 90\n"
        )

        res = verify_patch(
            project_path=self.demo_dir,
            patch=regression_patch,
            test_command="pytest test_calculator.py",
            timeout_seconds=30,
        )

        # Because test_calculate_total_zero_discount (50, 0) == 50 now fails (90 != 50)!
        self.assertEqual(res["status"], "FAIL")
        self.assertEqual(res["verification"], "FAIL")
        self.assertGreater(res["failed"], 0)
        self.assertIn("VERIFICATION FAILED", res["evidence"]["regression_status"])

    # -------------------------------------------------------------------------
    # 8. Secret Redaction & Sanitized Environment
    # -------------------------------------------------------------------------
    def test_08_secret_redaction(self):
        raw = "Error with api_key: 'sk-1234567890abcdef1234567890' and GEMINI_API_KEY: 'my-secret'"
        sanitized = redact_secrets(raw)
        self.assertNotIn("sk-1234567890abcdef1234567890", sanitized)
        self.assertIn("***REDACTED***", sanitized)

        # Test python runner environment excludes host secrets
        os.environ["GEMINI_API_KEY"] = "super_secret_test_key_12345"
        runner = PythonRunner()
        clean_env = runner.build_sanitized_env(self.demo_dir)
        self.assertNotIn("GEMINI_API_KEY", clean_env)

    # -------------------------------------------------------------------------
    # 9. Ephemeral Scratch Sandbox Cleanup
    # -------------------------------------------------------------------------
    def test_09_ephemeral_sandbox_cleanup(self):
        created_path = None
        with SandboxContext(prefix="pm_test_clean_", source_project=self.demo_dir) as sb:
            created_path = sb
            self.assertTrue(sb.exists())
            self.assertTrue((sb / "calculator.py").exists())

        # Outside context, sandbox must be completely deleted
        self.assertFalse(created_path.exists())

    # -------------------------------------------------------------------------
    # 10. NodeRunner Interface Contract
    # -------------------------------------------------------------------------
    def test_10_node_runner_interface(self):
        node_runner = NodeRunner()
        # Does not fake execution
        res = node_runner.run_tests(project_path=self.demo_dir)
        self.assertEqual(res.status, "FAIL")
        self.assertEqual(res.verification, "FAIL")
        err_msg = res.stderr or res.error or ""
        self.assertTrue("package.json" in err_msg or "Node" in err_msg)

    # -------------------------------------------------------------------------
    # 11. CLI Execution
    # -------------------------------------------------------------------------
    def test_11_cli_execution(self):
        # Test run_tests CLI on demo
        proc = subprocess.run(
            [sys.executable, str(ROOT_DIR / "runner" / "run_tests.py"), "--project", str(self.demo_dir), "--command", "pytest test_calculator.py", "--timeout", "30"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 1)  # Baseline has 1 failure
        data = json.loads(proc.stdout)
        self.assertEqual(data["status"], "FAIL")
        self.assertEqual(data["failed"], 1)
        self.assertEqual(data["passed"], 8)


if __name__ == "__main__":
    unittest.main()
