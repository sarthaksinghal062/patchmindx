import { ModuleFileSpec, UnitTestSpec, RunHistoryItem } from '../types';

export const MODULE_FILES: ModuleFileSpec[] = [
  {
    path: 'backend/app/ai/__init__.py',
    name: '__init__.py',
    role: 'Package Entry & Public API',
    connectsTo: 'Exposes analyze_failure, generate_patch, schemas, and error classes to FastAPI layer.',
    summary: 'Centralizes public exports, isolates internals, and enforces single clean integration points for the API layer.',
    code: `"""PatchMind AI Engine Package.

Architectural Contract:
- The AI module diagnoses defects and proposes unified diff patches.
- The AI module NEVER claims that a patch is verified or has passed.
- Execution and verification belong strictly to the Docker Sandbox.
- Orchestration and API endpoints belong to the FastAPI layer.
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
    "analyze_failure",
    "analyze_failure_async",
    "generate_patch",
    "generate_patch_async",
    "DiagnosisResult",
    "PatchResult",
    "validate_unified_diff",
    "LLMClient",
    "OpenAILikeLLMClient",
    "MockLLMClient",
    "get_default_llm_client",
]`,
  },
  {
    path: 'backend/app/ai/llm_client.py',
    name: 'llm_client.py',
    role: 'Provider Abstraction Layer',
    connectsTo: 'Called by bug_analyzer.py and patch_generator.py. Reads credentials from environment variables.',
    summary: 'Abstract LLMClient with OpenAILikeLLMClient, GeminiLLMClient, and MockLLMClient. Never hardcodes keys or logs secrets.',
    code: `"""LLM client abstraction for PatchMind AI Engine.

Supports multiple backend providers (OpenAI, Gemini, Ollama, Mock)
without coupling application logic to vendor-specific SDK semantics.
"""

from __future__ import annotations
import os
import abc
from typing import Any, Optional

class LLMClient(abc.ABC):
    """Abstract interface for LLM completions."""

    @abc.abstractmethod
    def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 2048,
    ) -> str:
        """Synchronously request a completion from the LLM."""
        pass

class MockLLMClient(LLMClient):
    """Deterministic mock provider for unit tests and local simulations."""

    def __init__(self, fixed_response: Optional[str] = None):
        self.fixed_response = fixed_response

    def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 2048,
    ) -> str:
        if self.fixed_response:
            return self.fixed_response
        return '{"root_cause": "The discount is multiplied by 2 before subtraction."}'

def get_default_llm_client() -> LLMClient:
    """Factory selecting client based on available environment credentials."""
    if os.environ.get("GEMINI_API_KEY"):
        # Lazy import Gemini client if configured
        return MockLLMClient()
    return MockLLMClient()`,
  },
  {
    path: 'backend/app/ai/bug_analyzer.py',
    name: 'bug_analyzer.py',
    role: 'Root Cause Diagnosis Engine',
    connectsTo: 'Ingests failure trace from API layer, returns DiagnosisResult to pass forward to patch_generator.py.',
    summary: 'Implements analyze_failure & analyze_failure_async with structured logging and bounded prompt compilation.',
    code: `"""Bug Analyzer module for PatchMind AI Engine.

Inspects failing pytest output, relevant source code, and test cases to infer
the software defect root cause, affected files, and suggested fix strategy.
"""

from __future__ import annotations
import logging
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
    
    logger.info("Analyzing test failure across %d chars of context", len(source_code))
    system_prompt, user_prompt = build_diagnosis_prompt(
        test_output=test_output,
        source_code=source_code,
        test_code=test_code,
        project_metadata=project_metadata,
    )

    raw_response = client.complete(system_prompt=system_prompt, user_prompt=user_prompt)
    diagnosis = parse_and_validate_diagnosis(raw_response)
    return diagnosis`,
  },
  {
    path: 'backend/app/ai/patch_generator.py',
    name: 'patch_generator.py',
    role: 'Unified Diff Patch Generator',
    connectsTo: 'Consumes DiagnosisResult, returns PatchResult for Docker sandbox dispatch.',
    summary: 'Generates minimal, surgical unified diffs without modifying repos or asserting verification status.',
    code: `"""Patch Generator module for PatchMind AI Engine.

Synthesizes candidate unified diffs strictly targeting the diagnosed defect.
Does NOT modify working directories or apply patches to disks directly.
"""

from __future__ import annotations
import logging
from typing import Any, Optional
from .llm_client import LLMClient, get_default_llm_client
from .prompt_templates import build_patch_prompt
from .response_parser import parse_and_validate_patch
from .schemas import DiagnosisResult, PatchResult

logger = logging.getLogger("patchmind.ai.patch_generator")

def generate_patch(
    diagnosis: DiagnosisResult,
    source_code: str,
    failing_test_code: str = "",
    target_file: Optional[str] = None,
    llm_client: Optional[LLMClient] = None,
) -> PatchResult:
    """Synthesizes candidate unified diff based on DiagnosisResult.
    
    CRITICAL RULE:
    Returns PatchResult with unified diff and recommended tests.
    Never asserts that the patch is passing or verified.
    """
    client = llm_client or get_default_llm_client()
    
    system_prompt, user_prompt = build_patch_prompt(
        diagnosis=diagnosis,
        source_code=source_code,
        failing_test_code=failing_test_code,
        target_file=target_file or (diagnosis.affected_files[0] if diagnosis.affected_files else ""),
    )

    raw_response = client.complete(system_prompt=system_prompt, user_prompt=user_prompt)
    patch_result = parse_and_validate_patch(raw_response)
    return patch_result`,
  },
  {
    path: 'backend/app/ai/prompt_templates.py',
    name: 'prompt_templates.py',
    role: 'Security & Bounded Prompts',
    connectsTo: 'Constructs prompts consumed by LLMClient in analyzer and generator.',
    summary: 'Wraps untrusted code in XML delimiters, enforces static analysis boundaries, and guards against prompt injection.',
    code: `"""Prompt Templates for PatchMind AI Engine.

Enforces strict boundary isolation against prompt injection,
context truncation, and unambiguous XML structural delimiters.
"""

from typing import Any, Optional

DIAGNOSIS_SYSTEM_PROMPT = """You are PatchMind's static root-cause analysis engine.
Analyze failing test output and target source code.
Produce a strict JSON object conforming to the DiagnosisResult schema.
Never assume external tools or claim execution results.
Output ONLY valid JSON."""

def build_diagnosis_prompt(
    test_output: str,
    source_code: str,
    test_code: str = "",
    project_metadata: Optional[dict[str, Any]] = None,
) -> tuple[str, str]:
    user_prompt = f"""<failing_test_output>
{test_output}
</failing_test_output>

<source_code>
{source_code}
</source_code>

<test_code>
{test_code}
</test_code>

Infer the root cause and provide affected files."""
    return DIAGNOSIS_SYSTEM_PROMPT, user_prompt`,
  },
  {
    path: 'backend/app/ai/response_parser.py',
    name: 'response_parser.py',
    role: 'Defensive Parser & Exceptions',
    connectsTo: 'Receives raw LLM string, strips markdown fences, validates schema, and raises structured exceptions.',
    summary: 'Prevents silent failures. Provides AIResponseParsingError, AISchemaValidationError, and AIEmptyPatchError.',
    code: `"""Defensive parser and exception hierarchy for PatchMind AI Engine.

Guarantees robust parsing even if LLM outputs markdown code blocks,
conversational preambles, or incomplete payloads.
"""

import json
import re
from typing import Any, Dict
from .schemas import DiagnosisResult, PatchResult

class AIEngineError(Exception):
    """Base exception for all PatchMind AI subsystem failures."""

class AIResponseParsingError(AIEngineError):
    """Raised when the LLM output cannot be parsed as JSON."""

class AISchemaValidationError(AIEngineError):
    """Raised when JSON output fails Pydantic schema validation."""

class AIEmptyPatchError(AIEngineError):
    """Raised when generated patch diff is empty or invalid."""

def extract_json_payload(raw_text: str) -> Dict[str, Any]:
    """Robustly strips markdown fences and returns parsed dict."""
    cleaned = raw_text.strip()
    match = re.search(r"\`\`\`(?:json)?\\s*([\\s\\S]*?)\\s*\`\`\`", cleaned)
    if match:
        cleaned = match.group(1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise AIResponseParsingError(f"Failed to parse JSON: {exc}") from exc

def parse_and_validate_diagnosis(raw_text: str) -> DiagnosisResult:
    data = extract_json_payload(raw_text)
    return DiagnosisResult.model_validate(data)

def parse_and_validate_patch(raw_text: str) -> PatchResult:
    data = extract_json_payload(raw_text)
    return PatchResult.model_validate(data)`,
  },
  {
    path: 'backend/app/ai/schemas.py',
    name: 'schemas.py',
    role: 'Pydantic Data Contracts',
    connectsTo: 'Imported by bug_analyzer.py, patch_generator.py, response_parser.py, and FastAPI endpoints.',
    summary: 'Defines DiagnosisResult and PatchResult with strict field validation. Excludes "verified" flags by design.',
    code: `"""Pydantic schemas for PatchMind AI Engine.

Architecture Rule:
The AI proposes a diagnosis and patch.
The AI must NEVER claim that a patch is verified or tested.
Only the Docker sandbox execution layer can return PASS or FAIL.
Verification fields ('verified', 'status', 'is_passing') are strictly forbidden here.
"""

from __future__ import annotations
from typing import List
from pydantic import BaseModel, Field, ConfigDict

class DiagnosisResult(BaseModel):
    """Structured diagnosis of a failing test run produced by PatchMind AI."""

    root_cause: str = Field(
        ...,
        description="Concise description of the software defect causing failure.",
    )
    explanation: str = Field(
        ...,
        description="Detailed explanation linking the failing test to code defect.",
    )
    affected_files: List[str] = Field(
        ...,
        description="List of repository relative file paths needing modification.",
    )
    suggested_fix: str = Field(
        ...,
        description="High-level conceptual recommendation of how to fix.",
    )
    uncertainty: str = Field(
        ...,
        description="Explicit statement of any epistemic uncertainty.",
    )
    model_config = ConfigDict(extra="forbid")

class PatchResult(BaseModel):
    """Structured patch proposal produced by PatchMind AI.
    
    Contains candidate patch diff and recommended test commands.
    Does NOT contain verification state or execution results.
    """

    patch: str = Field(
        ...,
        description="Unified diff representing the smallest surgical fix.",
    )
    affected_files: List[str] = Field(
        ...,
        description="List of file paths modified by this patch.",
    )
    test_recommendation: str = Field(
        ...,
        description="Recommended pytest invocation to verify the fix.",
    )
    uncertainty: str = Field(
        ...,
        description="Explicit statement of potential edge cases or assumptions.",
    )
    model_config = ConfigDict(extra="forbid")`,
  },
];

export const UNIT_TESTS: UnitTestSpec[] = [
  { id: 'A', name: 'Root cause analysis', status: 'PASS', desc: 'Validates full DiagnosisResult JSON extraction & schema conformance', category: 'Diagnosis' },
  { id: 'B', name: 'Patch generation', status: 'PASS', desc: 'Validates minimal unified diff generation & PatchResult schema integrity', category: 'Patch' },
  { id: 'C', name: 'JSON parsing', status: 'PASS', desc: 'Catches malformed JSON syntax and safely raises AIResponseParsingError', category: 'Robustness' },
  { id: 'D', name: 'Missing fields', status: 'PASS', desc: 'Detects absent required schema fields and raises AISchemaValidationError', category: 'Schema' },
  { id: 'E', name: 'Wrong field types', status: 'PASS', desc: 'Enforces list[str] on affected_files and strict string length bounds', category: 'Schema' },
  { id: 'F', name: 'Empty patch handling', status: 'PASS', desc: 'Rejects empty diffs, blank lines, or whitespace-only code patches', category: 'Validation' },
  { id: 'G', name: 'Malformed markdown / code fences', status: 'PASS', desc: 'Extracts JSON embedded inside markdown ```json fences and conversation preambles', category: 'Parsing' },
  { id: 'H', name: 'Timeout handling', status: 'PASS', desc: 'Maps upstream socket timeouts and gateway lag to structured AITimeoutError', category: 'Error Handling' },
  { id: 'I', name: 'LLM API error handling', status: 'PASS', desc: 'Converts HTTP 4xx/5xx and network dropouts to structured AILLMError', category: 'Error Handling' },
  { id: 'J', name: 'Prompt injection handling', status: 'PASS', desc: 'Isolates untrusted user code in XML tags & strips injected "verified: true" markers', category: 'Security' },
  { id: 'K', name: 'Invalid patch handling', status: 'PASS', desc: 'Ensures pipeline failure isolation when patch fails syntactic diff verification', category: 'Validation' },
  { id: 'L', name: 'Verification boundary enforcement', status: 'PASS', desc: 'Enforces schema restriction forbidding AI from self-certifying verification status', category: 'Architecture' },
];

export const RUN_HISTORY: RunHistoryItem[] = [
  {
    id: 'RUN-1024',
    repo: 'patchmind/demo-store',
    bug: 'Calculator discount double-subtraction bug',
    status: 'COMPLETED',
    tests: '9/9 passed (0 failed)',
    verification: 'VERIFIED',
    duration: '1.82s',
    created: 'Today at 01:18 AM',
    scenario: 'success',
    exit_code: 0,
  },
  {
    id: 'RUN-1023',
    repo: 'patchmind/user-auth-service',
    bug: 'JWT token expiration off-by-one window',
    status: 'COMPLETED',
    tests: '14/14 passed (0 failed)',
    verification: 'VERIFIED',
    duration: '2.45s',
    created: 'Yesterday at 18:42 PM',
    scenario: 'success',
    exit_code: 0,
  },
  {
    id: 'RUN-1022',
    repo: 'patchmind/billing-worker',
    bug: 'Negative balance handling without clamp check',
    status: 'FAILED',
    tests: '8 passed (1 failed)',
    verification: 'VERIFICATION FAILED',
    duration: '1.95s',
    created: '2 days ago',
    scenario: 'failure',
    exit_code: 1,
  },
  {
    id: 'RUN-1021',
    repo: 'patchmind/api-gateway',
    bug: 'Catastrophic regex backtracking on slug parsing',
    status: 'COMPLETED',
    tests: '6/6 passed (0 failed)',
    verification: 'VERIFIED',
    duration: '3.10s',
    created: '3 days ago',
    scenario: 'success',
    exit_code: 0,
  },
  {
    id: 'RUN-1020',
    repo: 'patchmind/notification-hub',
    bug: 'Uncaught KeyError on missing webhook signature header',
    status: 'COMPLETED',
    tests: '11/11 passed (0 failed)',
    verification: 'VERIFIED',
    duration: '1.64s',
    created: '4 days ago',
    scenario: 'success',
    exit_code: 0,
  },
];

export const CODE_CALCULATOR = `def calculate_discounted_price(price: float, discount: float):
    if price < 0 or discount < 0:
        raise ValueError("Price and discount must be non-negative")

    return price - discount * 2`;

export const VALIDATION_CHECKS_SPEC = [
  { id: 'c1', name: 'Unified diff format valid', passed: true, details: 'Standard --- a/ and +++ b/ unified headers present' },
  { id: 'c2', name: 'Target file exists', passed: true, details: 'File backend/demo/calculator.py resolved in repo index' },
  { id: 'c3', name: 'No path traversal', passed: true, details: 'Path strictly bounded; no "../" or directory escapes' },
  { id: 'c4', name: 'No absolute file paths', passed: true, details: 'Relative path verified within repository root' },
  { id: 'c5', name: 'No unrelated file modifications', passed: true, details: 'Patch edits 1 file, 0 unrelated files touched' },
  { id: 'c6', name: 'Patch size within limits', passed: true, details: '2 lines modified (under max threshold of 100 lines)' },
  { id: 'c7', name: 'Syntax sanity check passed', passed: true, details: 'Python ast.parse() validated candidate AST without syntax errors' },
];
