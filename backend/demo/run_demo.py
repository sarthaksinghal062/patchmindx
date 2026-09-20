"""Interactive end-to-end demo script for BugBuster AI Engine (Member 3).

Demonstrates the flow:
1. Pytest failure trace captured
2. AI diagnosis generated (bug_analyzer.py)
3. AI patch generated (patch_generator.py)
4. Verification Pending status explicitly preserved (Never claimed verified by AI!)
"""

from __future__ import annotations

import argparse
import json
import os
import sys

# Ensure backend package is in pythonpath
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.ai import (
    MockLLMClient,
    analyze_failure,
    generate_patch,
    get_default_llm_client,
)

DEMO_SOURCE_CODE = """def calculate_discounted_price(price: float, discount: float) -> float:
    if price < 0 or discount < 0:
        raise ValueError("Price and discount must be non-negative")
    return price - discount * 2
"""

DEMO_TEST_CODE = """from calculator import calculate_discounted_price

def test_calculate_discounted_price_standard():
    assert calculate_discounted_price(100.0, 15.0) == 85.0
"""

DEMO_PYTEST_OUTPUT = """============================= FAILURES =============================
_________________ test_calculate_discounted_price_standard _________________

    def test_calculate_discounted_price_standard():
>       assert calculate_discounted_price(100.0, 15.0) == 85.0
E       assert 70.0 == 85.0
E         +70.0
E         -85.0

backend/demo/test_calculator.py:4: AssertionError
========================= 1 failed in 0.03s =========================
"""

MOCK_DIAGNOSIS_JSON = json.dumps({
    "root_cause": "Excessive discount deduction caused by doubling discount factor (* 2)",
    "explanation": "In calculator.py, calculate_discounted_price executes `return price - discount * 2`. When price=100.0 and discount=15.0, it computes 100.0 - 30.0 = 70.0 instead of 85.0.",
    "affected_files": ["backend/demo/calculator.py"],
    "suggested_fix": "Remove the `* 2` multiplier from the return statement: `return price - discount`.",
    "uncertainty": "Minimal uncertainty; pytest assertion error and line numbers pinpoint the arithmetic error.",
})

MOCK_PATCH_JSON = json.dumps({
    "patch": """--- a/backend/demo/calculator.py
+++ b/backend/demo/calculator.py
@@ -4,3 +4,3 @@
     if price < 0 or discount < 0:
         raise ValueError("Price and discount must be non-negative")
-    return price - discount * 2
+    return price - discount""",
    "affected_files": ["backend/demo/calculator.py"],
    "test_recommendation": "Add test_calculate_discounted_price_standard and test_calculate_discounted_price_zero_discount to regression suite.",
    "uncertainty": "No side-effects; function signature and input validation remain unaltered.",
})


def run_pipeline_demo(use_live_llm: bool = False) -> None:
    print("=" * 70)
    print("      BUGBUSTER / PATCHMIND - AI ENGINE DEMONSTRATION")
    print("      Team Member 3 (AI Engine Lead)")
    print("=" * 70)
    print("\n[STAGE 1: FAILURE INGESTION (Member 2 -> Member 3)]")
    print("Captured Pytest Output:\n" + "-" * 40)
    print(DEMO_PYTEST_OUTPUT.strip())
    print("-" * 40)

    if use_live_llm:
        print("\n[INFO] Live LLM provider enabled from environment credentials.")
        client = get_default_llm_client()
    else:
        print("\n[INFO] Running with deterministic mock client for reproducible demo.")
        def response_handler(sys_prompt: str, user_prompt: str) -> str:
            if "Patch Generator" in sys_prompt or "generate a minimal unified diff" in user_prompt:
                return MOCK_PATCH_JSON
            return MOCK_DIAGNOSIS_JSON

        client = MockLLMClient(response_factory=response_handler)

    # Stage 2: AI Diagnosis
    print("\n[STAGE 2: ROOT CAUSE DIAGNOSIS (bug_analyzer.py)]")
    diagnosis = analyze_failure(
        test_output=DEMO_PYTEST_OUTPUT,
        source_code=DEMO_SOURCE_CODE,
        test_code=DEMO_TEST_CODE,
        project_metadata={"framework": "pytest", "python_version": "3.11"},
        llm_client=client,
    )

    print("Root Cause:     ", diagnosis.root_cause)
    print("Affected Files: ", diagnosis.affected_files)
    print("Suggested Fix:  ", diagnosis.suggested_fix)
    print("Uncertainty:    ", diagnosis.uncertainty)
    print("Explanation:    ", diagnosis.explanation)

    # Stage 3: AI Patch Generation
    print("\n[STAGE 3: PATCH GENERATION (patch_generator.py)]")
    patch_result = generate_patch(
        diagnosis=diagnosis,
        test_output=DEMO_PYTEST_OUTPUT,
        source_code=DEMO_SOURCE_CODE,
        test_code=DEMO_TEST_CODE,
        llm_client=client,
    )

    print("Target Files:        ", patch_result.affected_files)
    print("Test Recommendation: ", patch_result.test_recommendation)
    print("Uncertainty:         ", patch_result.uncertainty)
    print("\nGenerated Unified Diff Patch:\n" + "=" * 40)
    print(patch_result.patch)
    print("=" * 40)

    # Stage 4: Critical Hand-off Notice
    print("\n[STAGE 4: VERIFICATION HAND-OFF (Member 3 -> Member 2 -> Member 4)]")
    print("STATUS: VERIFICATION PENDING")
    print("NOTICE: The AI module does NOT verify the patch or execute tests.")
    print("        This patch payload is handed back to Member 2 (FastAPI),")
    print("        which dispatches to Member 4's isolated Docker sandbox.")
    print("        Only Docker + pytest can assert PASS or FAIL.")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BugBuster AI Engine Demo")
    parser.add_argument("--live", action="store_true", help="Use live configured LLM API instead of mock")
    args = parser.parse_args()
    run_pipeline_demo(use_live_llm=args.live)
