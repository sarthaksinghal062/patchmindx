"""Repository for Patch database operations."""

from __future__ import annotations

import datetime
import json
import uuid
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.patch import Patch


class PatchRepository:
    def __init__(self, db: Optional[Session] = None) -> None:
        self.db = db
        self._memory_patches: dict[str, Patch] = {}

    def get(self, patch_id: str) -> Optional[Patch]:
        if self.db:
            return self.db.query(Patch).filter(Patch.id == patch_id).first()
        return self._memory_patches.get(patch_id)

    def get_by_run(self, run_id: str) -> Optional[Patch]:
        if self.db:
            return self.db.query(Patch).filter(Patch.run_id == run_id).order_by(Patch.created_at.desc()).first()
        for p in reversed(list(self._memory_patches.values())):
            if p.run_id == run_id:
                return p
        return None

    def create(
        self,
        run_id: str,
        unified_diff: str,
        explanation: str = "",
        affected_files: Optional[List[str]] = None,
        is_syntactically_valid: bool = False,
        validation_details: str = "",
        patch_id: Optional[str] = None
    ) -> Patch:
        pid = patch_id or f"patch-{uuid.uuid4().hex[:10]}"
        patch = Patch(
            id=pid,
            run_id=run_id,
            unified_diff=unified_diff,
            explanation=explanation,
            affected_files_json=json.dumps(affected_files or []),
            is_syntactically_valid=is_syntactically_valid,
            validation_details=validation_details,
            created_at=datetime.datetime.utcnow(),
        )
        if self.db:
            self.db.add(patch)
            self.db.commit()
            self.db.refresh(patch)
        else:
            self._memory_patches[pid] = patch
        return patch
