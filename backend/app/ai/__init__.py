"""BugBuster AI Engine Package.

Subsystem owned by Team Member 3 (AI Engine Lead).

Architectural Contract:
- The AI module diagnoses defects and proposes unified diff patches.
- The AI module NEVER claims that a patch is verified or has passed.
- Execution and verification belong strictly to Team Member 4's Docker Sandbox.
- Orchestration and API endpoints belong to Team Member 2's FastAPI layer.
"""

from .bug_analyzer import analyze_failure, analyze_failure_async
from .llm_client import LLMClient, MockLLMClient, OpenAILikeLLMClient, get_default_llm_client
from .patch_generator import generate_patch, generate_patch_async
from .prompt_templates import (
    build_diagnosis_prompt,
    build_patch_prompt,
    truncate_context,
)
from .response_parser import (
    AIEmptyPatchError,
    AIEngineError,
    AILLMError,
    AIResponseParsingError,
    AISchemaValidationError,
    AITimeoutError,
    extract_json_payload,
    parse_and_validate_diagnosis,
    parse_and_validate_patch,
)
from .schemas import DiagnosisResult, PatchResult, validate_unified_diff

__all__ = [
    # Core workflows
    "analyze_failure",
    "analyze_failure_async",
    "generate_patch",
    "generate_patch_async",
    # Schemas
    "DiagnosisResult",
    "PatchResult",
    "validate_unified_diff",
    # LLM Clients
    "LLMClient",
    "OpenAILikeLLMClient",
    "MockLLMClient",
    "get_default_llm_client",
    # Prompt helpers
    "build_diagnosis_prompt",
    "build_patch_prompt",
    "truncate_context",
    # Exceptions & Parsers
    "AIEngineError",
    "AIResponseParsingError",
    "AISchemaValidationError",
    "AIEmptyPatchError",
    "AILLMError",
    "AITimeoutError",
    "extract_json_payload",
    "parse_and_validate_diagnosis",
    "parse_and_validate_patch",
]
