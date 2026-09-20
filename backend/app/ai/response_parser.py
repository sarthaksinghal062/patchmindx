"""Robust response parsing for PatchMind AI outputs.

Ensures that model responses are safely extracted, strictly validated against
Pydantic schemas, and stripped of extraneous markdown fences without masking errors.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Type, TypeVar

from .schemas import DiagnosisResult, PatchResult, validate_unified_diff

logger = logging.getLogger("patchmind.ai.response_parser")

T = TypeVar("T", DiagnosisResult, PatchResult)


class AIEngineError(Exception):
    """Base exception for all PatchMind AI engine operations."""
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class AIResponseParsingError(AIEngineError):
    """Raised when the LLM response cannot be parsed as valid JSON."""
    pass


class AISchemaValidationError(AIEngineError):
    """Raised when the parsed JSON fails required fields or type checks."""
    pass


class AIEmptyPatchError(AISchemaValidationError):
    """Raised when the generated patch is empty, blank, or not a valid unified diff."""
    pass


class AILLMError(AIEngineError):
    """Raised when an LLM provider request fails or encounters an API error."""
    pass


class AITimeoutError(AILLMError):
    """Raised when the LLM provider times out."""
    pass


def extract_json_payload(raw_text: str) -> str:
    """Extracts JSON substring from raw model output, handling markdown code fences.
    
    Supports:
    - ```json ... ```
    - ``` ... ```
    - Leading / trailing conversational text around valid JSON objects
    """
    if not raw_text or not raw_text.strip():
        raise AIResponseParsingError("Model returned an empty response string.")

    cleaned = raw_text.strip()

    # Case 1: Standard markdown code fence ```json ... ``` or ``` ... ```
    fence_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
    match = re.search(fence_pattern, cleaned, re.IGNORECASE)
    if match:
        candidate = match.group(1).strip()
        if candidate.startswith("{") and candidate.endswith("}"):
            return candidate

    # Case 2: Direct raw JSON string
    if cleaned.startswith("{") and cleaned.endswith("}"):
        return cleaned

    # Case 3: Embedded JSON object within leading/trailing narrative
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        return cleaned[first_brace : last_brace + 1]

    raise AIResponseParsingError(
        f"Unable to locate valid JSON boundaries in model output: '{cleaned[:120]}...'"
    )


def parse_and_validate_diagnosis(raw_text: str) -> DiagnosisResult:
    """Parses raw LLM text output and strictly validates it as a DiagnosisResult."""
    data = _parse_json_dict(raw_text, context_label="Diagnosis")
    
    # Required fields verification
    required_fields = ["root_cause", "explanation", "affected_files", "suggested_fix", "uncertainty"]
    missing = [f for f in required_fields if f not in data]
    if missing:
        msg = f"DiagnosisResult payload is missing required fields: {', '.join(missing)}. Payload was: {data}"
        logger.error(msg)
        raise AISchemaValidationError(msg, details={"missing_fields": missing, "payload": data})

    # Type validation
    if not isinstance(data.get("root_cause"), str) or not data["root_cause"].strip():
        raise AISchemaValidationError("'root_cause' must be a non-empty string.")
    if not isinstance(data.get("explanation"), str) or not data["explanation"].strip():
        raise AISchemaValidationError("'explanation' must be a non-empty string.")
    if not isinstance(data.get("affected_files"), list) or not all(isinstance(f, str) for f in data["affected_files"]):
        raise AISchemaValidationError("'affected_files' must be a list of string file paths.")
    if not isinstance(data.get("suggested_fix"), str) or not data["suggested_fix"].strip():
        raise AISchemaValidationError("'suggested_fix' must be a non-empty string.")
    if not isinstance(data.get("uncertainty"), str):
        raise AISchemaValidationError("'uncertainty' must be a string.")

    # Guard against forbidden verification fields injected by model
    if "verified" in data or "is_passing" in data or "status" in data:
        logger.warning("Model attempted to include verification fields in DiagnosisResult. Dropping them.")
        data.pop("verified", None)
        data.pop("is_passing", None)
        data.pop("status", None)

    try:
        if hasattr(DiagnosisResult, "model_validate"):
            return DiagnosisResult.model_validate(data)
        return DiagnosisResult(**data)
    except Exception as e:
        logger.error(f"Failed to instantiate DiagnosisResult: {e}")
        raise AISchemaValidationError(f"Schema validation failed for DiagnosisResult: {e}") from e


def parse_and_validate_patch(raw_text: str) -> PatchResult:
    """Parses raw LLM text output and strictly validates it as a PatchResult."""
    data = _parse_json_dict(raw_text, context_label="Patch")

    # Required fields verification
    required_fields = ["patch", "affected_files", "test_recommendation", "uncertainty"]
    missing = [f for f in required_fields if f not in data]
    if missing:
        msg = f"PatchResult payload is missing required fields: {', '.join(missing)}"
        logger.error(msg)
        raise AISchemaValidationError(msg, details={"missing_fields": missing, "payload": data})

    # Type checks
    patch_val = data.get("patch")
    if not isinstance(patch_val, str) or not patch_val.strip():
        raise AIEmptyPatchError("Generated patch is empty or not a valid string.")

    if not isinstance(data.get("affected_files"), list) or not all(isinstance(f, str) for f in data["affected_files"]):
        raise AISchemaValidationError("'affected_files' must be a list of string file paths.")

    if not isinstance(data.get("test_recommendation"), str) or not data["test_recommendation"].strip():
        raise AISchemaValidationError("'test_recommendation' must be a non-empty string.")

    if not isinstance(data.get("uncertainty"), str):
        raise AISchemaValidationError("'uncertainty' must be a string.")

    # Validate patch resembles a non-empty unified diff
    if not validate_unified_diff(patch_val):
        logger.warning("Patch does not strictly match standard unified diff markers (---, +++, @@, +/-).")
        # Ensure it at least has +/- diff lines
        if not ("-" in patch_val and "+" in patch_val):
            raise AIEmptyPatchError(
                "Patch must be a valid unified diff with added and removed lines.",
                details={"patch_preview": patch_val[:200]},
            )

    # Strictly forbid verification claims
    if "verified" in data or "is_verified" in data:
        data.pop("verified", None)
        data.pop("is_verified", None)

    try:
        if hasattr(PatchResult, "model_validate"):
            return PatchResult.model_validate(data)
        return PatchResult(**data)
    except Exception as e:
        logger.error(f"Failed to instantiate PatchResult: {e}")
        raise AISchemaValidationError(f"Schema validation failed for PatchResult: {e}") from e


def _parse_json_dict(raw_text: str, context_label: str) -> dict[str, Any]:
    """Helper to extract and json.loads payload with comprehensive error formatting."""
    json_str = extract_json_payload(raw_text)
    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError as exc:
        logger.error(f"JSONDecodeError during {context_label} parsing: {exc.msg} at line {exc.lineno}, col {exc.colno}")
        raise AIResponseParsingError(
            f"Failed to parse model output as valid JSON: {exc.msg} (Line {exc.lineno}, Column {exc.colno})",
            details={"raw_snippet": json_str[:300], "error": str(exc)},
        ) from exc

    if not isinstance(parsed, dict):
        raise AISchemaValidationError(
            f"Expected a JSON object (dict) for {context_label}, but received {type(parsed).__name__}.",
            details={"received_type": type(parsed).__name__},
        )
    return parsed
