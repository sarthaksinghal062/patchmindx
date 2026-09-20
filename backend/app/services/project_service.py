"""Service for Project management, filesystem sandboxing, and source archive uploads."""

from __future__ import annotations

import io
import os
import shutil
import zipfile
from pathlib import Path
from typing import List, Optional

from app.config import MAX_PROJECT_UPLOAD_SIZE, STORAGE_DIR, WORKSPACE_ROOT
from app.core.exceptions import InvalidProjectError, ProjectNotFoundError, SecurityValidationError
from app.core.security import validate_safe_relative_path
from app.models.project import Project
from app.repositories.project_repository import ProjectRepository


class ProjectService:
    def __init__(self, repo: ProjectRepository) -> None:
        self.repo = repo
        self.projects_dir = STORAGE_DIR / "projects"
        self.projects_dir.mkdir(parents=True, exist_ok=True)

    def get_project(self, project_id: str) -> Project:
        project = self.repo.get(project_id)
        if not project:
            raise ProjectNotFoundError(f"Project with ID '{project_id}' not found.")
        return project

    def list_projects(self) -> List[Project]:
        return self.repo.list_all()

    def create_project(
        self,
        name: str,
        description: str = "",
        repository_source: str = "",
        runtime: str = "python",
        test_command: str = "pytest"
    ) -> Project:
        if not name or not name.strip():
            raise InvalidProjectError("Project name cannot be empty.")

        # If repository_source is provided, ensure it does not attempt directory traversal
        clean_source = repository_source.strip() if repository_source else ""
        if clean_source:
            # Allow workspace-relative paths or storage paths
            if not clean_source.startswith("http://") and not clean_source.startswith("https://"):
                validate_safe_relative_path(clean_source)

        return self.repo.create(
            name=name.strip(),
            description=description.strip() if description else "",
            repository_source=clean_source,
            runtime=runtime or "python",
            test_command=test_command or "pytest",
        )

    def upload_project_archive(self, project_id: str, file_bytes: bytes, filename: str) -> Project:
        project = self.get_project(project_id)

        if len(file_bytes) > MAX_PROJECT_UPLOAD_SIZE:
            raise SecurityValidationError(
                f"Uploaded archive size ({len(file_bytes)} bytes) exceeds max limit of {MAX_PROJECT_UPLOAD_SIZE} bytes."
            )

        target_dir = self.projects_dir / project_id
        target_dir.mkdir(parents=True, exist_ok=True)

        if filename.endswith(".zip"):
            try:
                with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                    for member in zf.infolist():
                        # Prevent Zip Slip vulnerability
                        member_path = Path(member.filename)
                        if member_path.is_absolute() or ".." in member_path.parts:
                            raise SecurityValidationError(f"Malicious path in zip archive: '{member.filename}'")
                        zf.extract(member, target_dir)
            except zipfile.BadZipFile:
                raise InvalidProjectError("Uploaded file is not a valid zip archive.")
        else:
            raise InvalidProjectError("Only .zip project archives are currently supported for upload.")

        # Update repository_source to relative storage path
        rel_path = str(target_dir.relative_to(STORAGE_DIR.parent))
        updated = self.repo.update(project_id, repository_source=rel_path)
        return updated or project
