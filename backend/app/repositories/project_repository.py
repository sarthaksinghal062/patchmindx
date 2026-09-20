"""Repository for Project database operations."""

from __future__ import annotations

import datetime
import uuid
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.project import Project


class ProjectRepository:
    def __init__(self, db: Optional[Session] = None) -> None:
        self.db = db
        # In-memory fallback cache if db session is not active
        self._memory_store: dict[str, Project] = {}

    def get(self, project_id: str) -> Optional[Project]:
        if self.db:
            return self.db.query(Project).filter(Project.id == project_id).first()
        return self._memory_store.get(project_id)

    def list_all(self) -> List[Project]:
        if self.db:
            return self.db.query(Project).order_by(Project.created_at.desc()).all()
        return list(self._memory_store.values())

    def create(
        self,
        name: str,
        description: str = "",
        repository_source: str = "",
        runtime: str = "python",
        test_command: str = "pytest",
        project_id: Optional[str] = None
    ) -> Project:
        pid = project_id or f"proj-{uuid.uuid4().hex[:8]}"
        project = Project(
            id=pid,
            name=name,
            description=description,
            repository_source=repository_source,
            runtime=runtime,
            test_command=test_command,
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow(),
        )
        if self.db:
            self.db.add(project)
            self.db.commit()
            self.db.refresh(project)
        else:
            self._memory_store[pid] = project
        return project

    def update(self, project_id: str, **kwargs) -> Optional[Project]:
        project = self.get(project_id)
        if not project:
            return None
        for key, value in kwargs.items():
            if hasattr(project, key) and value is not None:
                setattr(project, key, value)
        project.updated_at = datetime.datetime.utcnow()
        if self.db:
            self.db.commit()
            self.db.refresh(project)
        return project

    def delete(self, project_id: str) -> bool:
        project = self.get(project_id)
        if not project:
            return False
        if self.db:
            self.db.delete(project)
            self.db.commit()
        else:
            self._memory_store.pop(project_id, None)
        return True
