"""Comprehensive Backend & Orchestration Test Suite for PatchMind.

Validates the 13 required capabilities:
1. Health endpoint (/health and /)
2. Project creation (POST /api/projects, validation, retrieval)
3. Run creation (POST /api/runs, state initialized to QUEUED)
4. Run state transitions (QUEUED -> INSPECTING -> BASELINE_RUNNING -> ANALYZING -> PATCH_GENERATING -> PATCH_VALIDATING -> VERIFYING -> COMPLETED)
5. AI integration (Connecting analysis service to analyze_failure & generate_patch)
6. Malformed AI response handling (Gracefully fails run with FAILED and NOT_RUN verification)
7. Patch validation (AST structure, diff boundary safety, reject empty/malformed diffs)
8. Runner contract (Validates payload structure, exit_code, passed/failed parsing)
9. PASS result (Verified end-to-end bug fix reproduction and resolution)
10. FAIL result (When tests fail after patch or in baseline)
11. Timeout handling (Sandbox execution timeout mapped to DockerTimeoutError / failure)
12. Cancellation (Cancelling an active run transitions to CANCELLED state)
13. Security validation (Path traversal rejection, patch path safety, secret redaction)
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure backend package is in pythonpath
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient

from app.main import app
from app.database import init_db
from app.models.analysis import RunState, VerificationResultState
from app.schemas.test_run import RunnerInputPayload, RunnerOutputPayload
from app.services.patch_service import PatchService
from app.services.verification_service import VerificationService
from app.core.security import redact_secrets, validate_safe_relative_path, validate_patch_security
from app.core.exceptions import SecurityValidationError, DockerTimeoutError


class TestPatchMindBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)
        os.environ["PATCHMIND_OFFLINE_MODE"] = "true"

    def setUp(self):
        # Create a clean project for test cases
        resp = self.client.post(
            "/api/projects",
            json={
                "name": "Demo Calculator Project",
                "description": "Test fixture project",
                "repository_source": "backend/demo",
                "runtime": "python",
                "test_command": "pytest backend/demo/test_calculator.py",
            }
        )
        self.assertEqual(resp.status_code, 201)
        self.project_id = resp.json()["id"]

    # -------------------------------------------------------------------------
    # 1. Health Endpoint
    # -------------------------------------------------------------------------
    def test_01_health_endpoints(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "patchmind-backend")

        # Root endpoint
        root_resp = self.client.get("/")
        self.assertEqual(root_resp.status_code, 200)
        self.assertIn("documentation", root_resp.json())

    # -------------------------------------------------------------------------
    # 2. Project Creation & Retrieval
    # -------------------------------------------------------------------------
    def test_02_project_creation_and_retrieval(self):
        # Create valid project
        res = self.client.post(
            "/api/projects",
            json={
                "name": "Auth Microservice",
                "description": "OAuth2 backend",
                "repository_source": "backend/demo",
                "runtime": "python",
                "test_command": "pytest",
            }
        )
        self.assertEqual(res.status_code, 201)
        proj = res.json()
        self.assertEqual(proj["name"], "Auth Microservice")
        proj_id = proj["id"]

        # Fetch single project
        get_res = self.client.get(f"/api/projects/{proj_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["id"], proj_id)

        # List projects
        list_res = self.client.get("/api/projects")
        self.assertEqual(list_res.status_code, 200)
        self.assertTrue(any(p["id"] == proj_id for p in list_res.json()))

        # Empty name should fail
        bad_res = self.client.post("/api/projects", json={"name": "   "})
        self.assertIn(bad_res.status_code, (400, 422))

    # -------------------------------------------------------------------------
    # 3. Run Creation
    # -------------------------------------------------------------------------
    def test_03_run_creation(self):
        resp = self.client.post(
            "/api/runs",
            json={
                "project_id": self.project_id,
                "test_command": "pytest backend/demo/test_calculator.py",
                "target_path": "backend/demo"
            }
        )
        self.assertEqual(resp.status_code, 201)
        run = resp.json()
        self.assertTrue(run["id"].startswith("run-"))
        self.assertEqual(run["run_state"], RunState.QUEUED)
        self.assertEqual(run["verification"], VerificationResultState.NOT_RUN)

    # -------------------------------------------------------------------------
    # 4. Run State Transitions
    # -------------------------------------------------------------------------
    def test_04_run_state_transitions(self):
        # Trigger synchronous run execution to observe full pipeline transition
        resp = self.client.post(
            "/api/runs?sync=true",
            json={
                "project_id": self.project_id,
                "test_command": "pytest backend/demo/test_calculator.py",
                "target_path": "backend/demo"
            }
        )
        self.assertEqual(resp.status_code, 201)
        run = resp.json()
        run_id = run["id"]
        self.assertEqual(run["run_state"], RunState.COMPLETED)

        # Verify structured logs captured the required lifecycle states
        logs_resp = self.client.get(f"/api/runs/{run_id}/logs")
        self.assertEqual(logs_resp.status_code, 200)
        event_types = [entry["event_type"] for entry in logs_resp.json()["logs"]]

        expected_events = [
            "RUN_CREATED",
            "BASELINE_STARTED",
            "BASELINE_COMPLETED",
            "ANALYSIS_STARTED",
            "ANALYSIS_COMPLETED",
            "PATCH_GENERATED",
            "PATCH_VALIDATED",
            "VERIFICATION_STARTED",
            "VERIFICATION_COMPLETED",
            "REPORT_GENERATED"
        ]
        for ev in expected_events:
            self.assertIn(ev, event_types, f"Event {ev} should be in run logs")

    # -------------------------------------------------------------------------
    # 5. AI Integration
    # -------------------------------------------------------------------------
    def test_05_ai_integration(self):
        resp = self.client.post(
            "/api/runs?sync=true",
            json={
                "project_id": self.project_id,
                "test_command": "pytest backend/demo/test_calculator.py",
                "target_path": "backend/demo"
            }
        )
        run_id = resp.json()["id"]

        # Check that diagnosis was recorded
        run_data = self.client.get(f"/api/runs/{run_id}").json()
        self.assertIsNotNone(run_data["diagnosis"])
        self.assertIn("root_cause", run_data["diagnosis"])

        # Check that candidate patch diff exists
        diff_resp = self.client.get(f"/api/runs/{run_id}/diff")
        self.assertEqual(diff_resp.status_code, 200)
        self.assertTrue(diff_resp.json()["is_syntactically_valid"])
        self.assertIn("--- a/", diff_resp.json()["diff"])

    # -------------------------------------------------------------------------
    # 6. Malformed AI Response
    # -------------------------------------------------------------------------
    def test_06_malformed_ai_response_handling(self):
        with patch("app.services.analysis_service.analyze_failure") as mock_ai:
            mock_ai.side_effect = Exception("Invalid JSON structure returned by LLM")
            resp = self.client.post(
                "/api/runs?sync=true",
                json={
                    "project_id": self.project_id,
                    "test_command": "pytest",
                    "target_path": "backend/demo"
                }
            )
            run = resp.json()
            self.assertEqual(run["run_state"], RunState.FAILED)
            # Never mark verification as PASS when AI fails
            self.assertEqual(run["verification"], VerificationResultState.NOT_RUN)
            self.assertIn("Invalid JSON", run["error_message"])

    # -------------------------------------------------------------------------
    # 7. Patch Validation
    # -------------------------------------------------------------------------
    def test_07_patch_validation(self):
        valid_diff = (
            "--- a/backend/demo/calculator.py\n"
            "+++ b/backend/demo/calculator.py\n"
            "@@ -18,3 +18,3 @@\n"
            "-    return price - discount * 2\n"
            "+    return price - discount\n"
        )
        is_valid, files, msg = PatchService.validate_patch_structure(valid_diff)
        self.assertTrue(is_valid)
        self.assertIn("backend/demo/calculator.py", files)

        # Empty diff must be rejected
        is_valid, files, msg = PatchService.validate_patch_structure("   ")
        self.assertFalse(is_valid)

        # Diff with escaping path must be rejected
        escape_diff = (
            "--- a/../../etc/passwd\n"
            "+++ b/../../etc/passwd\n"
            "@@ -1,1 +1,1 @@\n"
            "-root:x:0:0\n"
            "+root:x:0:0:hacked\n"
        )
        is_valid, files, msg = PatchService.validate_patch_structure(escape_diff)
        self.assertFalse(is_valid)
        self.assertIn("Security validation rejected", msg)

        # Test endpoint
        res = self.client.post("/api/patches/validate", json={"diff": valid_diff})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["is_valid"])

    # -------------------------------------------------------------------------
    # 8. Runner Contract
    # -------------------------------------------------------------------------
    def test_08_runner_contract(self):
        svc = VerificationService()
        demo_dir = str(Path(__file__).resolve().parent.parent / "demo")
        
        # Test baseline execution via runner contract
        res = svc.execute_in_runner(
            run_id="test-run-123",
            project_path=demo_dir,
            test_command="pytest backend/demo/test_calculator.py",
            patch="",
            timeout_seconds=30
        )
        self.assertIsInstance(res, RunnerOutputPayload)
        self.assertIn(res.status, ("PASS", "FAIL"))
        self.assertIsInstance(res.passed, int)
        self.assertIsInstance(res.failed, int)
        self.assertIsInstance(res.duration_ms, int)
        self.assertIsInstance(res.stdout, str)

    # -------------------------------------------------------------------------
    # 9. PASS Result (End-to-End Demo Fix)
    # -------------------------------------------------------------------------
    def test_09_pass_result_e2e_demo(self):
        # Execute run on demo with candidate patch
        resp = self.client.post(
            "/api/runs?sync=true",
            json={
                "project_id": self.project_id,
                "test_command": "pytest backend/demo/test_calculator.py",
                "target_path": "backend/demo"
            }
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        run_id = data["id"]
        
        # After patch application, verification must be PASS!
        self.assertEqual(data["run_state"], RunState.COMPLETED)
        self.assertEqual(data["verification"], VerificationResultState.PASS)

        # Check full report endpoint
        rep_resp = self.client.get(f"/api/runs/{run_id}/report")
        self.assertEqual(rep_resp.status_code, 200)
        rep = rep_resp.json()
        self.assertEqual(rep["verification"], "PASS")
        self.assertIsNotNone(rep["verification_test"])
        self.assertEqual(rep["verification_test"]["verification"], "PASS")
        self.assertEqual(rep["verification_test"]["failed"], 0)

    # -------------------------------------------------------------------------
    # 10. FAIL Result (When patch does not fix test)
    # -------------------------------------------------------------------------
    def test_10_fail_result_when_patch_incorrect(self):
        # Provide runner that returns status=FAIL for verification
        with patch.object(VerificationService, "execute_in_runner") as mock_runner:
            # Baseline fails as expected (1 failed, 8 passed)
            mock_runner.side_effect = [
                RunnerOutputPayload(
                    status="FAIL", exit_code=1, passed=8, failed=1,
                    duration_ms=100, stdout="FAILED", stderr="", verification="FAIL"
                ),
                # Verification STILL fails (0 passed, 9 failed)
                RunnerOutputPayload(
                    status="FAIL", exit_code=1, passed=0, failed=9,
                    duration_ms=100, stdout="STILL FAILED", stderr="", verification="FAIL"
                ),
            ]

            resp = self.client.post(
                "/api/runs?sync=true",
                json={
                    "project_id": self.project_id,
                    "test_command": "pytest backend/demo/test_calculator.py",
                    "target_path": "backend/demo"
                }
            )
            run = resp.json()
            self.assertEqual(run["run_state"], RunState.COMPLETED)
            self.assertEqual(run["verification"], VerificationResultState.FAIL)

    # -------------------------------------------------------------------------
    # 11. Timeout Handling
    # -------------------------------------------------------------------------
    def test_11_timeout_handling(self):
        with patch.object(VerificationService, "execute_in_runner") as mock_runner:
            mock_runner.side_effect = DockerTimeoutError("Sandbox test execution exceeded 120s limit.")
            resp = self.client.post(
                "/api/runs?sync=true",
                json={
                    "project_id": self.project_id,
                    "test_command": "pytest backend/demo/test_calculator.py",
                    "target_path": "backend/demo"
                }
            )
            run = resp.json()
            self.assertEqual(run["run_state"], RunState.FAILED)
            self.assertEqual(run["verification"], VerificationResultState.NOT_RUN)
            self.assertIn("exceeded", run["error_message"])

    # -------------------------------------------------------------------------
    # 12. Cancellation Handling
    # -------------------------------------------------------------------------
    def test_12_cancellation_handling(self):
        # Create queued run without immediately triggering synchronous TestClient background execution
        with patch("fastapi.BackgroundTasks.add_task"):
            create_res = self.client.post(
                "/api/runs",
                json={
                    "project_id": self.project_id,
                    "test_command": "pytest backend/demo/test_calculator.py",
                    "target_path": "backend/demo"
                }
            )
            run_id = create_res.json()["id"]

        # Cancel run
        cancel_res = self.client.post(f"/api/runs/{run_id}/cancel")
        self.assertEqual(cancel_res.status_code, 200)
        self.assertEqual(cancel_res.json()["run_state"], RunState.CANCELLED)

        # Check that get returns CANCELLED
        get_res = self.client.get(f"/api/runs/{run_id}")
        self.assertEqual(get_res.json()["run_state"], RunState.CANCELLED)
        self.assertEqual(get_res.json()["verification"], VerificationResultState.NOT_RUN)

    # -------------------------------------------------------------------------
    # 13. Security Validation
    # -------------------------------------------------------------------------
    def test_13_security_validation(self):
        # Secret redaction
        text_with_keys = "Error with api_key: 'sk-12345678901234567890abcdef' and token: 'my_secret_token_12345'"
        redacted = redact_secrets(text_with_keys)
        self.assertNotIn("sk-12345678901234567890abcdef", redacted)
        self.assertIn("***REDACTED***", redacted)

        # Path traversal checks
        with self.assertRaises(SecurityValidationError):
            validate_safe_relative_path("../../../etc/shadow")

        with self.assertRaises(SecurityValidationError):
            validate_safe_relative_path("/root/.ssh/id_rsa")

        with self.assertRaises(SecurityValidationError):
            validate_patch_security("--- a//var/run/docker.sock\n+++ b//var/run/docker.sock\n@@ -1,1 +1,1 @@\n")


if __name__ == "__main__":
    unittest.main()
