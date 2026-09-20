"""Security enforcement layer for PatchMind Backend.

Treats all uploaded code, repo files, test output, and AI patches as untrusted.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, List, Optional

from .exceptions import SecurityValidationError

# Patterns for redacting sensitive credentials from logs and outputs
SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret|token|password|auth|bearer)\s*[:=]\s*['\"]?([a-zA-Z0-9_\-\.]{8,})['\"]?"),
    re.compile(r"sk-[a-zA-Z0-9]{20,}", re.IGNORECASE),
    re.compile(r"AIzaSy[a-zA-Z0-9_\-]{33}"),
]

# Forbidden path substrings or patterns
DANGEROUS_PATH_SEGMENTS = ["..", "~", "/etc", "/root", "/var/run/docker.sock", "/sys", "/proc", "/dev"]


def redact_secrets(text: Optional[str]) -> str:
    """Sanitize strings by redacting API keys, passwords, and tokens."""
    if not text:
        return ""
    sanitized = str(text)
    # 1. Key-value pairs: e.g. api_key: "secret123"
    kv_pattern = re.compile(r"(?i)(api[_-]?key|secret|token|password|auth|bearer)\s*([:=])\s*['\"]?([a-zA-Z0-9_\-\.]{8,})['\"]?")
    sanitized = kv_pattern.sub(r"\1\2 '***REDACTED***'", sanitized)

    # 2. Standalone API keys
    sanitized = re.sub(r"sk-[a-zA-Z0-9]{20,}", "***REDACTED***", sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r"AIzaSy[a-zA-Z0-9_\-]{33}", "***REDACTED***", sanitized)
    return sanitized


def validate_safe_relative_path(path_str: str, base_dir: Optional[Path] = None) -> Path:
    """Validate that a relative path does not escape boundaries via traversal.
    
    Raises SecurityValidationError if suspicious.
    """
    if not path_str or not path_str.strip():
        raise SecurityValidationError("Path string cannot be empty.")

    clean_str = path_str.strip()

    # Reject absolute root access
    if clean_str.startswith("/") or clean_str.startswith("\\"):
        # If absolute, must be strictly under an allowed base_dir if base_dir provided
        if base_dir:
            try:
                resolved = Path(clean_str).resolve()
                base_resolved = base_dir.resolve()
                if not str(resolved).startswith(str(base_resolved)):
                    raise SecurityValidationError(f"Path '{clean_str}' escapes allowed directory '{base_dir}'.")
                return resolved
            except Exception as exc:
                raise SecurityValidationError(f"Invalid path traversal: {exc}")
        raise SecurityValidationError(f"Absolute path '{clean_str}' is forbidden.")

    # Reject dangerous traversal segments
    parts = Path(clean_str).parts
    if ".." in parts:
        raise SecurityValidationError(f"Directory traversal sequence '..' detected in '{clean_str}'.")

    for danger in DANGEROUS_PATH_SEGMENTS:
        if danger in clean_str:
            raise SecurityValidationError(f"Dangerous path segment '{danger}' detected in '{clean_str}'.")

    if base_dir:
        resolved = (base_dir / clean_str).resolve()
        base_resolved = base_dir.resolve()
        if not str(resolved).startswith(str(base_resolved)):
            raise SecurityValidationError(f"Resolved path escapes boundary: {clean_str}")
        return resolved

    return Path(clean_str)


def validate_patch_security(diff_text: str) -> List[str]:
    """Inspect unified diff to ensure no absolute paths or directory escapes.
    
    Returns list of affected relative file paths if safe.
    Raises SecurityValidationError if malicious paths detected.
    """
    if not diff_text or not diff_text.strip():
        raise SecurityValidationError("Patch content cannot be empty.")

    affected_files: List[str] = []

    for line in diff_text.splitlines():
        # Look for headers: --- a/path/to/file or +++ b/path/to/file
        if line.startswith("--- ") or line.startswith("+++ "):
            raw_path = line[4:].strip()
            # Ignore /dev/null
            if raw_path == "/dev/null":
                continue
            # Strip standard git diff prefixes
            if raw_path.startswith("a/") or raw_path.startswith("b/"):
                clean_path = raw_path[2:]
            else:
                clean_path = raw_path

            # Check for path traversal or absolute system path
            if clean_path.startswith("/") or ".." in Path(clean_path).parts:
                raise SecurityValidationError(f"Malicious or escaping file target in patch: '{clean_path}'")

            for danger in ["/etc", "/var/run", "docker.sock", ".ssh", ".env"]:
                if danger in clean_path:
                    raise SecurityValidationError(f"Targeting sensitive file '{danger}' in patch is forbidden.")

            if clean_path not in affected_files:
                affected_files.append(clean_path)

    return affected_files


def sanitize_test_command(cmd: str) -> str:
    """Ensure test command does not contain shell escape chains like ';' or '&& rm -rf /'."""
    clean = cmd.strip()
    # Check for chained bash injection characters outside quotes
    dangerous_tokens = [";", "|", "&", "`", "$", "(", ")", ">", "<"]
    for token in dangerous_tokens:
        if token in clean:
            # We enforce standard single command invocation e.g. pytest or pytest tests/
            raise SecurityValidationError(f"Dangerous command chaining token '{token}' in test command: '{cmd}'")
    return clean
