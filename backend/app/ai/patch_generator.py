"""Patch Generator module for PatchMind AI Engine.

Generates surgical, minimal unified diffs based on the diagnosed root cause,
failing test trace, and source context.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from .llm_client import LLMClient, get_default_llm_client
from .prompt_templates import build_patch_prompt
from .response_parser import parse_and_validate_patch
from .schemas import DiagnosisResult, PatchResult

logger = logging.getLogger("patchmind.ai.patch_generator")


def generate_patch(
    diagnosis: DiagnosisResult,
    test_output: str,
    source_code: str,
    test_code: str = "",
    llm_client: Optional[LLMClient] = None,
) -> PatchResult:
    """Synchronously generates a surgical unified diff patch based on diagnosis.
    
    Flow:
    Diagnosis -> Patch prompt -> LLM -> Parse JSON -> Validate Pydantic schema -> Return PatchResult
    """
    client = llm_client or get_default_llm_client()
    start_time = time.monotonic()

    logger.info(
        "Patch generation started for defect: '%s'. Target files: %s",
        diagnosis.root_cause,
        diagnosis.affected_files,
    )

    # 1. Build bounded patch prompts
    system_prompt, user_prompt = build_patch_prompt(
        diagnosis=diagnosis,
        test_output=test_output,
        source_code=source_code,
        test_code=test_code,
    )

    # 2. Invoke LLM provider
    logger.info("LLM request dispatching for patch generation...")
    raw_response = client.generate(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.0,
    )
    logger.info("LLM patch response received (%d chars).", len(raw_response))

    # 3. Parse and strictly validate response
    try:
        patch_result = parse_and_validate_patch(raw_response)
    except Exception as exc:
        logger.error("Parsing failure during patch response validation: %s", exc)
        raise

    duration = time.monotonic() - start_time
    logger.info(
        "Patch generated successfully in %.2fs. Modified files: %s, Diff preview: %s",
        duration,
        patch_result.affected_files,
        patch_result.patch.replace("\n", "\\n")[:80],
    )
    return patch_result


async def generate_patch_async(
    diagnosis: DiagnosisResult,
    test_output: str,
    source_code: str,
    test_code: str = "",
    llm_client: Optional[LLMClient] = None,
) -> PatchResult:
    """Asynchronous variant of generate_patch for FastAPI orchestration."""
    client = llm_client or get_default_llm_client()
    start_time = time.monotonic()

    logger.info("Async patch generation started. Constructing prompts...")
    system_prompt, user_prompt = build_patch_prompt(
        diagnosis=diagnosis,
        test_output=test_output,
        source_code=source_code,
        test_code=test_code,
    )

    logger.info("Async LLM request dispatching for patch...")
    raw_response = await client.generate_async(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.0,
    )
    logger.info("Async LLM patch response received (%d chars).", len(raw_response))

    try:
        patch_result = parse_and_validate_patch(raw_response)
    except Exception as exc:
        logger.error("Parsing failure during async patch validation: %s", exc)
        raise

    duration = time.monotonic() - start_time
    logger.info(
        "Async patch generated in %.2fs. Affected: %s",
        duration,
        patch_result.affected_files,
    )
    return patch_result
