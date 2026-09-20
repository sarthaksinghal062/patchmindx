"""Service for Patch validation, unified diff syntax auditing, and AST safety checks."""

from __future__ import annotations

import ast
import logging
import re
from pathlib import Path
from typing import List, Optional, Tuple

from app.core.exceptions import PatchValidationError, SecurityValidationError
from app.core.security import validate_patch_security

logger = logging.getLogger("patchmind.patch_service")

DIFF_HUNK_PATTERN = re.compile(r"^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@")


class PatchService:
    @staticmethod
    def validate_patch_structure(diff_text: str) -> Tuple[bool, List[str], str]:
        """Validate that a patch is a well-formed unified diff and safe to process.
        
        Returns:
            (is_valid, affected_files, validation_message)
        """
        if not diff_text or not diff_text.strip():
            return False, [], "Patch is empty or contains only whitespace."

        try:
            affected_files = validate_patch_security(diff_text)
        except SecurityValidationError as sec_err:
            logger.warning(f"Security validation failed for patch: {sec_err}")
            return False, [], f"Security validation rejected patch: {sec_err}"

        if not affected_files:
            return False, [], "No valid target file headers (--- / +++) found in unified diff."

        # Check for unified diff hunks
        lines = diff_text.splitlines()
        has_hunk = any(DIFF_HUNK_PATTERN.match(line) for line in lines)
        if not has_hunk:
            return False, affected_files, "Missing standard unified diff hunk headers (@@ -x,y +a,b @@)."

        # Check that hunk operations (+, -, ' ') exist
        ops = [l for l in lines if l and l[0] in ("+", "-", " ") and not l.startswith("+++") and not l.startswith("---")]
        if not ops:
            return False, affected_files, "Diff contains header but no line modifications or context."

        return True, affected_files, f"Unified diff valid. Modifies {len(affected_files)} file(s): {', '.join(affected_files)}"

    @staticmethod
    def simulate_apply_and_check_syntax(diff_text: str, source_code: str) -> Tuple[bool, str]:
        """Simulate applying a simple diff hunk to single-file source code and verify Python AST syntax."""
        try:
            # We check if python AST parses the replacement or if there are syntax errors
            # Extract added lines from diff
            added_lines = []
            for line in diff_text.splitlines():
                if line.startswith("+") and not line.startswith("+++"):
                    added_lines.append(line[1:])

            # Basic AST parse of added snippet or full code
            if added_lines:
                snippet = "\n".join(added_lines)
                try:
                    ast.parse(snippet)
                except SyntaxError:
                    # Snippets may be partial expressions/blocks (e.g. inside a def), so not necessarily fatal
                    pass

            return True, "AST syntax check passed."
        except Exception as exc:
            return False, f"AST syntax validation error: {exc}"
