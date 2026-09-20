"""Patch Application & Security Validation for PatchMind Runner.

Core Principle:
The AI-generated patch is untrusted.
Validate strictly:
✓ Valid unified diff structure
✓ Target file exists inside workspace
✓ Path remains inside workspace
✓ No absolute paths
✓ No path traversal (../../)
✓ No unexpected binary files / binary diffs
✓ Patch size within limit

If invalid: PATCH_REJECTED. Never apply or execute an unsafe patch.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

MAX_PATCH_SIZE_BYTES = 512 * 1024  # 512 KB limit

PATH_TRAVERSAL_PATTERN = re.compile(r"(^|[/\\])\.\.([/\\]|$)")
UNSAFE_PREFIXES = (
    "/etc", "/root", "/var", "/bin", "/sbin", "/usr", "/sys", "/proc", "/dev",
    "\\windows", "\\system32"
)


class PatchSecurityError(Exception):
    """Raised when an untrusted patch fails safety or validation criteria."""
    pass


def extract_diff_target_files(diff_text: str) -> List[str]:
    """Extracts target file paths from unified diff headers (--- and +++)."""
    target_files = []
    for line in diff_text.splitlines():
        if line.startswith("+++ "):
            raw = line[4:].strip()
            # Strip 'b/' or 'a/' prefix common in git diffs
            if raw.startswith("b/") or raw.startswith("a/"):
                raw = raw[2:]
            # Strip timestamp / tab if present
            raw = raw.split("\t")[0].strip()
            if raw and raw != "/dev/null":
                target_files.append(raw)
    return list(dict.fromkeys(target_files))


def validate_patch_safety(project_path: str | Path, diff_text: str) -> Tuple[bool, str, List[str]]:
    """Validates unified diff security against path traversal, absolute paths, and binary data."""
    if not diff_text or not diff_text.strip():
        return False, "Patch is empty.", []

    if len(diff_text.encode("utf-8")) > MAX_PATCH_SIZE_BYTES:
        return False, f"Patch size exceeds maximum limit of {MAX_PATCH_SIZE_BYTES} bytes.", []

    # Check for binary diff signatures
    if "GIT binary patch" in diff_text or "\x00" in diff_text:
        return False, "Binary patches are strictly prohibited.", []

    # Verify unified diff format (must contain header and hunk markers)
    has_header = False
    has_hunk = False
    for line in diff_text.splitlines():
        if line.startswith("--- ") or line.startswith("+++ "):
            has_header = True
        if line.startswith("@@"):
            has_hunk = True

    if not (has_header and has_hunk):
        return False, "Malformed patch: Missing standard unified diff headers or hunk markers (@@).", []

    target_files = extract_diff_target_files(diff_text)
    if not target_files:
        return False, "No target files identified in unified diff.", []

    proj = Path(project_path).resolve()

    for rel_path in target_files:
        # 1. Reject absolute paths
        if os.path.isabs(rel_path) or rel_path.startswith("/") or rel_path.startswith("\\"):
            return False, f"PATCH_REJECTED: Absolute path is forbidden '{rel_path}'", target_files

        # 2. Reject path traversal
        if PATH_TRAVERSAL_PATTERN.search(rel_path) or ".." in rel_path:
            return False, f"PATCH_REJECTED: Path traversal detected '{rel_path}'", target_files

        # 3. Reject unsafe prefixes
        lower_path = rel_path.lower()
        if any(lower_path.startswith(prefix.lstrip("/")) for prefix in UNSAFE_PREFIXES):
            return False, f"PATCH_REJECTED: Access to restricted system path forbidden '{rel_path}'", target_files

        # 4. Ensure path resolves strictly inside project workspace
        try:
            resolved_target = (proj / rel_path).resolve()
            if not str(resolved_target).startswith(str(proj)):
                return False, f"PATCH_REJECTED: Target path '{rel_path}' escapes workspace boundary.", target_files
        except Exception as e:
            return False, f"PATCH_REJECTED: Path resolution error '{rel_path}': {e}", target_files

        # 5. Target file must exist within project workspace
        candidate = proj / rel_path
        # Also check relative to immediate filename if path includes leading repo name
        if not candidate.exists():
            basename_candidate = proj / Path(rel_path).name
            if not basename_candidate.exists():
                return False, f"PATCH_REJECTED: Target file '{rel_path}' does not exist in workspace.", target_files

    return True, "Patch passed security checks.", target_files


def _apply_pure_python_hunk(file_path: Path, diff_text: str) -> bool:
    """Fallback surgical hunk applier that works without external tools."""
    if not file_path.exists():
        return False

    content = file_path.read_text(encoding="utf-8", errors="replace")

    old_lines: List[str] = []
    new_lines: List[str] = []

    for line in diff_text.splitlines():
        if line.startswith("---") or line.startswith("+++") or line.startswith("@@"):
            continue
        if line.startswith("-"):
            old_lines.append(line[1:])
        elif line.startswith("+"):
            new_lines.append(line[1:])
        elif line.startswith(" "):
            old_lines.append(line[1:])
            new_lines.append(line[1:])

    old_block = "\n".join(old_lines)
    new_block = "\n".join(new_lines)

    # 1. Try full hunk block replacement
    if old_block and old_block in content:
        content = content.replace(old_block, new_block, 1)
        file_path.write_text(content, encoding="utf-8")
        return True

    # 2. Try line-by-line surgical replacement
    modified = False
    for old_l, new_l in zip(old_lines, new_lines):
        if old_l in content:
            content = content.replace(old_l, new_l, 1)
            modified = True

    if modified:
        file_path.write_text(content, encoding="utf-8")
        return True

    return False


def apply_patch(project_path: str | Path, diff_text: str) -> Dict[str, Any]:
    """Validates and applies a unified diff patch to the project workspace.
    
    Returns structured result:
    {
      "status": "PATCH_APPLIED" | "PATCH_REJECTED",
      "applied_files": ["..."],
      "message": "..."
    }
    """
    proj = Path(project_path).resolve()
    is_safe, safety_msg, target_files = validate_patch_safety(proj, diff_text)
    if not is_safe:
        return {
            "status": "PATCH_REJECTED",
            "applied_files": [],
            "message": safety_msg,
        }

    # Write temporary patch file inside project workspace
    patch_file = proj / ".candidate_patch.diff"
    try:
        patch_file.write_text(diff_text, encoding="utf-8")

        applied = False

        # Attempt 1: patch utility
        for strip_level in ("-p1", "-p0"):
            try:
                res = subprocess.run(
                    ["patch", strip_level, "--input", str(patch_file)],
                    cwd=str(proj),
                    capture_output=True,
                    text=True,
                    timeout=15,
                )
                if res.returncode == 0:
                    applied = True
                    break
            except Exception:
                pass

        # Attempt 2: git apply
        if not applied:
            for strip_opt in (["--ignore-whitespace"], ["-p1", "--ignore-whitespace"], ["-p0", "--ignore-whitespace"]):
                try:
                    res = subprocess.run(
                        ["git", "apply"] + strip_opt + [str(patch_file)],
                        cwd=str(proj),
                        capture_output=True,
                        text=True,
                        timeout=15,
                    )
                    if res.returncode == 0:
                        applied = True
                        break
                except Exception:
                    pass

        # Attempt 3: Pure-python hunk applier
        if not applied:
            for rel in target_files:
                target = proj / rel
                if not target.exists():
                    target = proj / Path(rel).name
                if _apply_pure_python_hunk(target, diff_text):
                    applied = True

        if applied:
            return {
                "status": "PATCH_APPLIED",
                "applied_files": target_files,
                "message": f"Successfully applied patch to {len(target_files)} file(s).",
            }
        else:
            return {
                "status": "PATCH_REJECTED",
                "applied_files": [],
                "message": "PATCH_REJECTED: Failed to apply unified diff hunks cleanly to workspace files.",
            }

    finally:
        if patch_file.exists():
            try:
                patch_file.unlink()
            except Exception:
                pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply and validate candidate patch inside workspace")
    parser.add_argument("--project", required=True, help="Workspace project directory")
    parser.add_argument("--patch-file", help="Path to unified diff file")
    parser.add_argument("--patch-string", help="Unified diff string")
    args = parser.parse_args()

    diff_text = ""
    if args.patch_file:
        try:
            with open(args.patch_file, "r", encoding="utf-8") as f:
                diff_text = f.read()
        except Exception as exc:
            print(json.dumps({"status": "PATCH_REJECTED", "message": f"Cannot read patch file: {exc}"}))
            sys.exit(1)
    elif args.patch_string:
        diff_text = args.patch_string
    else:
        # Read from stdin
        diff_text = sys.stdin.read()

    res = apply_patch(args.project, diff_text)
    print(json.dumps(res, indent=2))
    if res["status"] != "PATCH_APPLIED":
        sys.exit(1)


if __name__ == "__main__":
    main()
