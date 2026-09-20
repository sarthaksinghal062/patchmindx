"""Cleanup Utility for PatchMind Sandbox Runner.

Guarantees full resource cleanup after every execution:
- Destroy container (if Docker used)
- Delete temporary scratch workspace
- Remove temporary patch files and cached bytecode
- Remove temporary process logs
Uses safe exception handling so failed tests never leave running resources or disk leaks.
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Generator, Optional

logger = logging.getLogger("patchmind.runner.cleanup")


def cleanup_container(container_id: str, timeout: int = 5) -> bool:
    """Safely kills and removes a running or stopped Docker container."""
    if not container_id or not container_id.strip():
        return True

    clean_id = container_id.strip()
    try:
        # Check if docker is present
        subprocess.run(
            ["docker", "rm", "-f", clean_id],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return True
    except (subprocess.SubprocessError, FileNotFoundError):
        return False
    except Exception as exc:
        logger.warning(f"Failed to cleanup container {clean_id}: {exc}")
        return False


def cleanup_workspace(workspace_dir: str | Path) -> bool:
    """Safely removes an ephemeral sandbox directory and all child artifacts."""
    if not workspace_dir:
        return True

    target = Path(workspace_dir)
    if not target.exists():
        return True

    # Security precaution: do not delete root or root system dirs
    resolved = str(target.resolve())
    if resolved in ("/", "/root", "/workspace", "/home", "/app", "/app/applet"):
        logger.warning(f"Refusing to delete system-protected directory: {resolved}")
        return False

    try:
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        else:
            target.unlink(missing_ok=True)
        return True
    except Exception as exc:
        logger.warning(f"Error during workspace cleanup of {workspace_dir}: {exc}")
        return False


class SandboxContext:
    """Context manager providing an ephemeral isolated scratch workspace with guaranteed cleanup."""

    def __init__(self, prefix: str = "pm_sandbox_", source_project: Optional[str | Path] = None) -> None:
        self.prefix = prefix
        self.source_project = Path(source_project) if source_project else None
        self.temp_dir: Optional[str] = None
        self.container_id: Optional[str] = None

    def __enter__(self) -> Path:
        self.temp_dir = tempfile.mkdtemp(prefix=self.prefix)
        sandbox_path = Path(self.temp_dir)

        if self.source_project and self.source_project.exists():
            # Copy source project into isolated scratch directory
            for item in self.source_project.iterdir():
                if item.name in (".git", "__pycache__", ".pytest_cache", "node_modules", ".candidate_patch.diff"):
                    continue
                dest = sandbox_path / item.name
                if item.is_dir():
                    shutil.copytree(
                        item,
                        dest,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache"),
                    )
                else:
                    shutil.copy2(item, dest)

        return sandbox_path

    def register_container(self, container_id: str) -> None:
        self.container_id = container_id

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if self.container_id:
            cleanup_container(self.container_id)
            self.container_id = None

        if self.temp_dir:
            cleanup_workspace(self.temp_dir)
            self.temp_dir = None


def main() -> None:
    parser = argparse.ArgumentParser(description="Cleanup sandbox runner resources")
    parser.add_argument("--workspace", help="Path to temporary workspace to remove")
    parser.add_argument("--container", help="Container ID or name to destroy")
    args = parser.parse_args()

    success = True
    if args.container:
        res = cleanup_container(args.container)
        print(f"Container cleanup '{args.container}': {'SUCCESS' if res else 'SKIPPED/FAILED'}")
        if not res:
            success = False

    if args.workspace:
        res = cleanup_workspace(args.workspace)
        print(f"Workspace cleanup '{args.workspace}': {'SUCCESS' if res else 'FAILED'}")
        if not res:
            success = False

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
