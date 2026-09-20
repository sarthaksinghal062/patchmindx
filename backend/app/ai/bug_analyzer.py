"""Bug Analyzer module for PatchMind AI Engine.

Inspects failing pytest output, relevant source code, and test cases to infer
the software defect root cause, affected files, and suggested fix strategy.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from .llm_client import LLMClient, get_default_llm_client
from .prompt_templates import build_diagnosis_prompt
from .response_parser import parse_and_validate_diagnosis
from .schemas import DiagnosisResult

logger = logging.getLogger("patchmind.ai.analyzer")


def analyze_failure(
    test_output: str,
    source_code: str,
    test_code: str = "",
    project_metadata: Optional[dict[str, Any]] = None,
    llm_client: Optional[LLMClient] = None,
) -> DiagnosisResult:
    """Synchronously analyzes a test failure and produces a structured DiagnosisResult.
    
    Flow:
    Input -> Build bounded prompt -> LLM -> Parse JSON -> Validate Pydantic schema -> Return DiagnosisResult
    """
    client = llm_client or get_default_llm_client()
    start_time = time.monotonic()
    
    logger.info(
        "Analysis started. Source length: %d chars, Test length: %d chars, Output length: %d chars",
        len(source_code),
        len(test_code),
        len(test_output),
    )

    # 1. Build bounded prompts
    system_prompt, user_prompt = build_diagnosis_prompt(
        test_output=test_output,
        source_code=source_code,
        test_code=test_code,
        project_metadata=project_metadata,
    )

    # 2. Invoke LLM provider
    logger.info("LLM request dispatching for root-cause diagnosis...")
    raw_response = client.generate(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.0,
    )
    logger.info("LLM response received (%d chars).", len(raw_response))

    # 3. Parse and strictly validate response
    try:
        diagnosis = parse_and_validate_diagnosis(raw_response)
    except Exception as exc:
        logger.error("Parsing failure during diagnosis response extraction: %s", exc)
        raise

    duration = time.monotonic() - start_time
    logger.info(
        "Diagnosis generated successfully in %.2fs. Root cause: '%s', Affected files: %s",
        duration,
        diagnosis.root_cause,
        diagnosis.affected_files,
    )
    return diagnosis


async def analyze_failure_async(
    test_output: str,
    source_code: str,
    test_code: str = "",
    project_metadata: Optional[dict[str, Any]] = None,
    llm_client: Optional[LLMClient] = None,
) -> DiagnosisResult:
    """Asynchronous variant of analyze_failure for non-blocking FastAPI endpoint integration."""
    client = llm_client or get_default_llm_client()
    start_time = time.monotonic()

    logger.info("Async analysis started. Building bounded prompts...")
    system_prompt, user_prompt = build_diagnosis_prompt(
        test_output=test_output,
        source_code=source_code,
        test_code=test_code,
        project_metadata=project_metadata,
    )

    logger.info("Async LLM request dispatching...")
    raw_response = await client.generate_async(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.0,
    )
    logger.info("Async LLM response received (%d chars).", len(raw_response))

    try:
        diagnosis = parse_and_validate_diagnosis(raw_response)
    except Exception as exc:
        logger.error("Parsing failure during async diagnosis response extraction: %s", exc)
        raise

    duration = time.monotonic() - start_time
    logger.info(
        "Async diagnosis generated in %.2fs. Root cause: '%s', Affected: %s",
        duration,
        diagnosis.root_cause,
        diagnosis.affected_files,
    )
    return diagnosis
