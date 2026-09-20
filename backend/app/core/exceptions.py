"""Domain exceptions for PatchMind Backend."""

from typing import Any, Optional


class PatchMindError(Exception):
    """Base exception for all PatchMind backend operations."""
    def __init__(self, message: str, details: Optional[dict[str, Any]] = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ProjectNotFoundError(PatchMindError):
    """Raised when a requested project does not exist."""


class InvalidProjectError(PatchMindError):
    """Raised when a project is structurally invalid or exceeds limits."""


class MissingTestCommandError(PatchMindError):
    """Raised when a run request does not specify a test command."""


class RunNotFoundError(PatchMindError):
    """Raised when a requested run ID does not exist."""


class RunCancelledError(PatchMindError):
    """Raised when a run is cancelled by the user."""


class SecurityValidationError(PatchMindError):
    """Raised when security boundaries (path traversal, dangerous commands) are violated."""


class PatchValidationError(PatchMindError):
    """Raised when an AI-generated patch fails safety, AST, or boundary checks."""


class BaselineTimeoutError(PatchMindError):
    """Raised when baseline test reproduction exceeds timeout."""


class AIEngineTimeoutError(PatchMindError):
    """Raised when AI diagnosis or patch synthesis times out."""


class MalformedAIResponseError(PatchMindError):
    """Raised when AI response cannot be parsed or validated against schemas."""


class RunnerUnavailableError(PatchMindError):
    """Raised when the execution sandbox/runner cannot be contacted."""


class DockerTimeoutError(PatchMindError):
    """Raised when execution inside sandbox exceeds allowed wall-clock duration."""


class VerificationInconclusiveError(PatchMindError):
    """Raised when verification results cannot be determined definitively."""
