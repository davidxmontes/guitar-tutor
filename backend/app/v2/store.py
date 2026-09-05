"""V2 persistence — Session/Branch/Artifact storage.

Two backends, selected by Settings.v2_storage_backend:
- "memory" (default): process-lifetime, good enough for local dev and the
  browser acceptance test — no external credentials required.
- "supabase": durable, for deployments that already have Supabase configured
  (see docs/agents/project.md and the saved_progressions table for the same
  pattern — DDL lives in a doc, not an automated migration).
"""

import uuid
from copy import deepcopy
from datetime import datetime, timezone
from functools import lru_cache
from threading import RLock

from app.v2.workspace import ConceptWorkspace
from typing import Any, Optional, Protocol

from app.v2.models import ARTIFACT_KINDS, ArtifactRevision, Artifact, Branch, Session, TutorMessage


class RevisionConflictError(Exception):
    pass


class NotFoundError(Exception):
    """Raised when a session/branch doesn't exist or isn't owned by the caller."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex


def _validate_artifact_kind(kind: Optional[str]) -> None:
    if kind is not None and kind not in ARTIFACT_KINDS:
        raise ValueError(f"Unknown artifact kind: {kind!r}. Supported: {ARTIFACT_KINDS}")


def _revised(artifact: Artifact, payload: dict[str, Any], save: bool) -> Artifact:
    if payload == artifact.payload and (not save or artifact.saved_at):
        return artifact
    now = _now()
    revisions = list(artifact.revisions)
    if artifact.saved_at and payload != artifact.payload:
        revisions.append(ArtifactRevision(revision=artifact.updated_at, payload=deepcopy(artifact.payload)))
    # ponytail: snapshots share the artifact JSON row for atomic compare-and-swap.
    # Move history to a separate table if large songs or long histories make rows costly.
    return artifact.model_copy(update={"payload": deepcopy(payload), "updated_at": now,
        "title": payload.get("display_name", payload.get("title", artifact.title)) if artifact.kind == "concept_study" else artifact.title,
        "saved_at": artifact.saved_at or (now if save else None), "revisions": revisions})


class V2Store(Protocol):
    def create_session(self, user_id: str) -> Session: ...
    def get_session(self, session_id: str, user_id: str) -> Session: ...
    def list_sessions(self, user_id: str) -> list[Session]: ...
    def create_branch(self, session_id: str, user_id: str, **fields: Any) -> Branch: ...
    def update_branch(self, session_id: str, branch_id: str, user_id: str, **fields: Any) -> Branch: ...
    def create_artifact(self, user_id: str, kind: str, title: str, payload: dict[str, Any], saved: bool = True) -> Artifact: ...
    def get_artifact(self, artifact_id: str, user_id: str) -> Artifact: ...
    def list_artifacts(self, user_id: str, kind: Optional[str] = None) -> list[Artifact]: ...
    def update_artifact(self, artifact_id: str, user_id: str, payload: dict[str, Any], expected_updated_at: Optional[str] = None, *, save: bool = False) -> Artifact: ...
    def save_workspace_study(self, session_id: str, branch_id: str, user_id: str, *, expected_version: int, title: str, as_new: bool = False) -> Branch: ...
    def commit_workspace_turn(self, session_id: str, branch_id: str, user_id: str, *, expected_version: int, workspace: Optional[ConceptWorkspace], user_text: Optional[str], assistant: dict[str, Any], undo_message_id: Optional[str] = None, restore_message_id: Optional[str] = None) -> tuple[Branch, TutorMessage]: ...
    def create_tutor_message(self, tutor_thread_id: str, role: str, content: dict[str, Any]) -> TutorMessage: ...
    def list_tutor_messages(self, tutor_thread_id: str, user_id: str) -> list[TutorMessage]: ...


class InMemoryV2Store:
    def __init__(self) -> None:
        self._branch_lock = RLock()
        self._sessions: dict[str, Session] = {}
        self._artifacts: dict[str, Artifact] = {}
        self._tutor_messages: dict[str, list[TutorMessage]] = {}

    def create_session(self, user_id: str) -> Session:
        now = _now()
        session_id = _new_id()
        branch = Branch(
            id=_new_id(),
            session_id=session_id,
            tutor_thread_id=_new_id(),
            created_at=now,
            updated_at=now,
        )
        session = Session(id=session_id, user_id=user_id, branches=[branch], created_at=now, updated_at=now)
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str, user_id: str) -> Session:
        with self._branch_lock:
            session = self._sessions.get(session_id)
            if session is None or session.user_id != user_id:
                raise NotFoundError(f"Session {session_id!r} not found for this user")
            return session

    def list_sessions(self, user_id: str) -> list[Session]:
        owned = [s for s in self._sessions.values() if s.user_id == user_id]
        return sorted(owned, key=lambda s: s.created_at, reverse=True)

    def create_branch(self, session_id: str, user_id: str, **fields: Any) -> Branch:
        session = self.get_session(session_id, user_id)
        _validate_artifact_kind(fields.get("current_artifact_kind"))
        now = _now()
        branch = Branch(
            id=_new_id(),
            session_id=session_id,
            tutor_thread_id=_new_id(),
            created_at=now,
            updated_at=now,
            **fields,
        )
        session.branches.append(branch)
        session.updated_at = now
        return branch

    def update_branch(self, session_id: str, branch_id: str, user_id: str, **fields: Any) -> Branch:
        # ponytail: one memory-store lock; split by branch only if contention matters.
        with self._branch_lock:
            return self._update_branch(session_id, branch_id, user_id, **fields)

    def _update_branch(self, session_id: str, branch_id: str, user_id: str, **fields: Any) -> Branch:
        session = self.get_session(session_id, user_id)  # raises NotFoundError if not owned

        if "current_artifact_kind" in fields:
            _validate_artifact_kind(fields["current_artifact_kind"])

        for i, branch in enumerate(session.branches):
            if branch.id != branch_id:
                continue
            expected = fields.pop("expected_workspace_version", None)
            if expected is not None and (branch.working_draft is None or branch.working_draft.version != expected):
                raise RevisionConflictError("Draft changed elsewhere; your edits have not been applied")
            if "working_draft" in fields:
                fields["working_draft"] = ConceptWorkspace.model_validate(fields["working_draft"])
            updated = branch.model_copy(update={**fields, "updated_at": _now()})
            session.branches[i] = updated
            return updated

        raise NotFoundError(f"Branch {branch_id!r} not found on session {session_id!r}")

    def create_artifact(self, user_id: str, kind: str, title: str, payload: dict[str, Any], saved: bool = True) -> Artifact:
        now = _now()
        artifact = Artifact(
            id=_new_id(),
            user_id=user_id,
            kind=kind,
            title=title,
            payload=deepcopy(payload),
            saved_at=now if saved else None,
            created_at=now,
            updated_at=now,
        )
        self._artifacts[artifact.id] = artifact
        return artifact

    def get_artifact(self, artifact_id: str, user_id: str) -> Artifact:
        artifact = self._artifacts.get(artifact_id)
        if artifact is None or artifact.user_id != user_id:
            raise NotFoundError(f"Artifact {artifact_id!r} not found for this user")
        return artifact

    def list_artifacts(self, user_id: str, kind: Optional[str] = None) -> list[Artifact]:
        artifacts = [
            artifact for artifact in self._artifacts.values()
            if artifact.user_id == user_id and (kind is None or artifact.kind == kind)
        ]
        return sorted(artifacts, key=lambda artifact: artifact.created_at, reverse=True)

    def update_artifact(self, artifact_id: str, user_id: str, payload: dict[str, Any], expected_updated_at: Optional[str] = None, *, save: bool = False) -> Artifact:
        with self._branch_lock:
            artifact = self.get_artifact(artifact_id, user_id)
            if expected_updated_at is not None and artifact.updated_at != expected_updated_at:
                raise RevisionConflictError("Artifact changed; reload before saving or restoring")
            updated = _revised(artifact, payload, save)
            self._artifacts[artifact_id] = updated
            return updated

    def save_workspace_study(self, session_id: str, branch_id: str, user_id: str, *, expected_version: int, title: str, as_new: bool = False) -> Branch:
        with self._branch_lock:
            session = self.get_session(session_id, user_id)
            branch = next((b for b in session.branches if b.id == branch_id), None)
            if branch is None or branch.working_draft is None:
                raise NotFoundError('Workspace not found')
            if branch.working_draft.version != expected_version:
                raise RevisionConflictError('Draft changed elsewhere. Reload this branch before saving.')
            draft = branch.working_draft.model_copy(update={'title': title,
                'version': expected_version + (title != branch.working_draft.title)})
            if branch.current_artifact_id and not as_new:
                artifact = self.get_artifact(branch.current_artifact_id, user_id)
                if artifact.kind != 'concept_study' or artifact.updated_at != branch.saved_artifact_revision:
                    raise RevisionConflictError('This study has a newer saved version. Your draft is intact. Save as a new study, or open the latest study from My Stuff.')
                artifact = _revised(artifact, draft.model_dump(), True)
            else:
                now = _now()
                artifact = Artifact(id=_new_id(), user_id=user_id, kind='concept_study', title=title,
                    payload=draft.model_dump(), saved_at=now, created_at=now, updated_at=now)
            updated = branch.model_copy(update={'title': title, 'working_draft': draft, 'current_artifact_kind': 'concept_study',
                'current_artifact_id': artifact.id, 'saved_artifact_revision': artifact.updated_at, 'updated_at': _now()})
            self._artifacts[artifact.id] = artifact
            session.branches[session.branches.index(branch)] = updated
            return updated

    def commit_workspace_turn(self, session_id: str, branch_id: str, user_id: str, *, expected_version: int,
        workspace: Optional[ConceptWorkspace], user_text: Optional[str], assistant: dict[str, Any],
        undo_message_id: Optional[str] = None, restore_message_id: Optional[str] = None) -> tuple[Branch, TutorMessage]:
        with self._branch_lock:
            session = self.get_session(session_id, user_id)
            index = next((i for i, b in enumerate(session.branches) if b.id == branch_id), None)
            if index is None or session.branches[index].working_draft is None:
                raise NotFoundError('Workspace not found')
            branch = session.branches[index]
            before = branch.working_draft
            history = self._tutor_messages.get(branch.tutor_thread_id, [])
            content = deepcopy(assistant)
            change = content.setdefault('workspace_change', {'status': 'unchanged', 'reason': None})
            if restore_message_id:
                target = next((m for m in history if m.id == restore_message_id and m.role == 'assistant' and m.content.get('workspace_after')), None)
                if target is None:
                    raise NotFoundError('Turn snapshot not found')
                if before.version != expected_version:
                    raise RevisionConflictError('The current draft changed. Return to current and reload before restoring.')
                workspace = ConceptWorkspace.model_validate(target.content['workspace_after'])
                content['focus'] = deepcopy(target.content.get('focus'))
                change.update(status='restored', restore_of=restore_message_id)
            elif undo_message_id:
                latest = next((m for m in reversed(history) if m.content.get('workspace_change', {}).get('status') in ('applied', 'undone', 'restored')), None)
                if before.version != expected_version or latest is None or latest.id != undo_message_id or latest.content['workspace_change']['status'] != 'applied' or not latest.content.get('workspace_before'):
                    raise RevisionConflictError('Undo is no longer current. Reload the workspace before trying again.')
                workspace = ConceptWorkspace.model_validate(latest.content['workspace_before'])
                change.update(status='undone', undo_of=undo_message_id)
            elif workspace is not None and before.version != expected_version:
                workspace = None
                change.update(status='rejected', reason='The draft changed while the Tutor was responding. No change was applied; ask again.')
            updated = branch
            if workspace is not None:
                workspace = workspace.model_copy(update={'version': before.version + 1})
                updated = branch.model_copy(update={'working_draft': workspace, 'updated_at': _now()})
                content['workspace_before'] = before.model_dump()
            else:
                content['workspace_before'] = None
            content['workspace_after'] = updated.working_draft.model_dump()
            now = _now()
            messages = [] if user_text is None else [TutorMessage(id=_new_id(), tutor_thread_id=branch.tutor_thread_id, role='user', content={'text': user_text}, created_at=now)]
            message = TutorMessage(id=_new_id(), tutor_thread_id=branch.tutor_thread_id, role='assistant', content=content, created_at=_now())
            # Build every value first; readers use the same lock as this two-value commit.
            session.branches[index] = updated
            self._tutor_messages[branch.tutor_thread_id] = [*history, *messages, message]
            return updated, message

    def _assert_thread_owned(self, tutor_thread_id: str, user_id: str) -> None:
        for session in self._sessions.values():
            if session.user_id != user_id:
                continue
            if any(b.tutor_thread_id == tutor_thread_id for b in session.branches):
                return
        raise NotFoundError(f"Tutor thread {tutor_thread_id!r} not found for this user")

    def create_tutor_message(self, tutor_thread_id: str, role: str, content: dict[str, Any]) -> TutorMessage:
        message = TutorMessage(
            id=_new_id(),
            tutor_thread_id=tutor_thread_id,
            role=role,
            content=content,
            created_at=_now(),
        )
        self._tutor_messages.setdefault(tutor_thread_id, []).append(message)
        return message

    def list_tutor_messages(self, tutor_thread_id: str, user_id: str) -> list[TutorMessage]:
        with self._branch_lock:
            self._assert_thread_owned(tutor_thread_id, user_id)
            return deepcopy(self._tutor_messages.get(tutor_thread_id, []))


class SupabaseV2Store:
    """Durable backend. Schema: docs/agents/v2-schema.sql (Supabase has no
    tracked migrations in this repo yet — same pattern as saved_progressions).
    """

    def __init__(self, client: Any) -> None:
        self._client = client

    def _row_to_branch(self, row: dict[str, Any]) -> Branch:
        return Branch(
            id=row["id"],
            session_id=row["session_id"],
            tutor_thread_id=row["tutor_thread_id"],
            title=row.get("title") or "New workspace",
            current_artifact_kind=row.get("current_artifact_kind"),
            current_artifact_id=row.get("current_artifact_id"),
            working_draft=row.get("working_draft"),
            saved_artifact_revision=row.get("saved_artifact_revision"),
            selection=row.get("selection"),
            focus=row.get("focus"),
            recent_ideas=row.get("recent_ideas") or [],
            fork_context=row.get("fork_context"),
            closed=row.get("closed", False),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _load_session(self, session_row: dict[str, Any]) -> Session:
        branch_rows = (
            self._client.table("v2_branches")
            .select("*")
            .eq("session_id", session_row["id"])
            .order("created_at")
            .execute()
            .data
        )
        return Session(
            id=session_row["id"],
            user_id=session_row["clerk_user_id"],
            branches=[self._row_to_branch(r) for r in branch_rows],
            created_at=session_row["created_at"],
            updated_at=session_row["updated_at"],
        )

    def create_session(self, user_id: str) -> Session:
        # ponytail: two sequential inserts, not a transaction — a failure
        # between them leaves an orphaned zero-branch session row. Upgrade to
        # a Postgres function/RPC if that's ever observed in practice; the
        # Supabase Python client has no multi-table transaction API.
        session_row = (
            self._client.table("v2_sessions").insert({"clerk_user_id": user_id}).execute().data[0]
        )
        branch_row = (
            self._client.table("v2_branches")
            .insert({"session_id": session_row["id"], "tutor_thread_id": _new_id()})
            .execute()
            .data[0]
        )
        return Session(
            id=session_row["id"],
            user_id=user_id,
            branches=[self._row_to_branch(branch_row)],
            created_at=session_row["created_at"],
            updated_at=session_row["updated_at"],
        )

    def get_session(self, session_id: str, user_id: str) -> Session:
        rows = (
            self._client.table("v2_sessions")
            .select("*")
            .eq("id", session_id)
            .eq("clerk_user_id", user_id)
            .execute()
            .data
        )
        if not rows:
            raise NotFoundError(f"Session {session_id!r} not found for this user")
        return self._load_session(rows[0])

    def list_sessions(self, user_id: str) -> list[Session]:
        rows = (
            self._client.table("v2_sessions")
            .select("*")
            .eq("clerk_user_id", user_id)
            .order("created_at", desc=True)
            .execute()
            .data
        )
        return [self._load_session(r) for r in rows]

    def create_branch(self, session_id: str, user_id: str, **fields: Any) -> Branch:
        self.get_session(session_id, user_id)
        _validate_artifact_kind(fields.get("current_artifact_kind"))
        rows = (
            self._client.table("v2_branches")
            .insert({"session_id": session_id, "tutor_thread_id": _new_id(), **fields})
            .execute()
            .data
        )
        if not rows:
            raise RuntimeError("Supabase did not return the created branch")
        return self._row_to_branch(rows[0])

    def update_branch(self, session_id: str, branch_id: str, user_id: str, **fields: Any) -> Branch:
        self.get_session(session_id, user_id)  # raises NotFoundError if not owned

        if "current_artifact_kind" in fields:
            _validate_artifact_kind(fields["current_artifact_kind"])

        expected = fields.pop("expected_workspace_version", None)
        query = self._client.table("v2_branches")
        # PostgREST rejects .update({}) — a no-op PATCH just re-reads the row.
        query = query.update(fields) if fields else query.select("*")
        if expected is not None:
            query = query.eq("working_draft->>version", str(expected))
        rows = query.eq("id", branch_id).eq("session_id", session_id).execute().data
        if not rows and expected is not None:
            raise RevisionConflictError("Draft changed elsewhere; your edits have not been applied")
        if not rows:
            raise NotFoundError(f"Branch {branch_id!r} not found on session {session_id!r}")
        return self._row_to_branch(rows[0])

    def _row_to_artifact(self, row: dict[str, Any]) -> Artifact:
        return Artifact(
            id=row["id"],
            user_id=row["clerk_user_id"],
            kind=row["kind"],
            title=row["title"],
            payload={k: v for k, v in (row.get("payload") or {}).items() if k != "_library"},
            saved_at=(row.get("payload") or {}).get("_library", {"saved_at": row["created_at"] if row["kind"] != "song_study" else None}).get("saved_at"),
            revisions=(row.get("payload") or {}).get("_library", {}).get("revisions", []),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def create_artifact(self, user_id: str, kind: str, title: str, payload: dict[str, Any], saved: bool = True) -> Artifact:
        row = (
            self._client.table("v2_artifacts")
            .insert({"clerk_user_id": user_id, "kind": kind, "title": title, "payload": {**payload, "_library": {"saved_at": _now() if saved else None, "revisions": []}}})
            .execute()
            .data[0]
        )
        return self._row_to_artifact(row)

    def get_artifact(self, artifact_id: str, user_id: str) -> Artifact:
        rows = (
            self._client.table("v2_artifacts")
            .select("*")
            .eq("id", artifact_id)
            .eq("clerk_user_id", user_id)
            .execute()
            .data
        )
        if not rows:
            raise NotFoundError(f"Artifact {artifact_id!r} not found for this user")
        return self._row_to_artifact(rows[0])

    def list_artifacts(self, user_id: str, kind: Optional[str] = None) -> list[Artifact]:
        query = self._client.table("v2_artifacts").select("*").eq("clerk_user_id", user_id)
        if kind is not None:
            query = query.eq("kind", kind)
        rows = query.order("created_at", desc=True).execute().data
        return [self._row_to_artifact(row) for row in rows]

    def update_artifact(self, artifact_id: str, user_id: str, payload: dict[str, Any], expected_updated_at: Optional[str] = None, *, save: bool = False) -> Artifact:
        artifact = self.get_artifact(artifact_id, user_id)
        if expected_updated_at is not None and artifact.updated_at != expected_updated_at:
            raise RevisionConflictError("Artifact changed; reload before saving or restoring")
        updated = _revised(artifact, payload, save)
        if updated is artifact:
            return artifact
        query = (
            self._client.table("v2_artifacts")
            .update({"title": updated.title, "payload": {**updated.payload, "_library": {"saved_at": updated.saved_at, "revisions": [r.model_dump() for r in updated.revisions]}}, "updated_at": updated.updated_at})
            .eq("id", artifact_id)
            .eq("clerk_user_id", user_id)
        )
        query = query.eq("updated_at", artifact.updated_at)
        rows = query.execute().data
        if not rows:
            raise RevisionConflictError("Artifact changed; reload before saving or restoring")
        return self._row_to_artifact(rows[0])

    def save_workspace_study(self, session_id: str, branch_id: str, user_id: str, *, expected_version: int, title: str, as_new: bool = False) -> Branch:
        result = self._client.rpc('v2_save_workspace_study', {'p_session_id': session_id, 'p_branch_id': branch_id,
            'p_user_id': user_id, 'p_expected_version': expected_version, 'p_title': title, 'p_as_new': as_new}).execute().data
        if result.get('error') == 'not_found':
            raise NotFoundError('Workspace or study not found')
        if result.get('error') == 'conflict':
            raise RevisionConflictError('The draft or saved study changed. Your draft is intact. Save as a new study, or open the latest study from My Stuff.')
        return self._row_to_branch(result['branch'])

    def commit_workspace_turn(self, session_id: str, branch_id: str, user_id: str, *, expected_version: int,
        workspace: Optional[ConceptWorkspace], user_text: Optional[str], assistant: dict[str, Any],
        undo_message_id: Optional[str] = None, restore_message_id: Optional[str] = None) -> tuple[Branch, TutorMessage]:
        # Ownership, row lock, CAS, snapshots and both messages share one Postgres transaction.
        result = self._client.rpc('v2_commit_workspace_turn', {
            'p_session_id': session_id, 'p_branch_id': branch_id, 'p_user_id': user_id,
            'p_expected_version': expected_version, 'p_workspace': workspace.model_dump() if workspace else None,
            'p_user_text': user_text, 'p_assistant': assistant, 'p_undo_message_id': undo_message_id, 'p_restore_message_id': restore_message_id,
        }).execute().data
        if result.get('error') == 'not_found':
            raise NotFoundError('Workspace not found')
        if result.get('error') == 'conflict':
            raise RevisionConflictError('The current draft changed. Return to current and reload before restoring or undoing.')
        return self._row_to_branch(result['branch']), self._row_to_tutor_message(result['message'])

    def _row_to_tutor_message(self, row: dict[str, Any]) -> TutorMessage:
        return TutorMessage(
            id=row["id"],
            tutor_thread_id=row["tutor_thread_id"],
            role=row["role"],
            content=row.get("content") or {},
            created_at=row["created_at"],
        )

    def create_tutor_message(self, tutor_thread_id: str, role: str, content: dict[str, Any]) -> TutorMessage:
        row = (
            self._client.table("v2_tutor_messages")
            .insert({"tutor_thread_id": tutor_thread_id, "role": role, "content": content})
            .execute()
            .data[0]
        )
        return self._row_to_tutor_message(row)

    def list_tutor_messages(self, tutor_thread_id: str, user_id: str) -> list[TutorMessage]:
        # Ownership check: two lookups (branch -> session) rather than a
        # join — same "no multi-table transaction/join API" tradeoff as
        # create_session above; this path is a read, not a race-prone write.
        branch_rows = (
            self._client.table("v2_branches").select("session_id").eq("tutor_thread_id", tutor_thread_id).execute().data
        )
        if not branch_rows:
            raise NotFoundError(f"Tutor thread {tutor_thread_id!r} not found for this user")
        session_rows = (
            self._client.table("v2_sessions")
            .select("id")
            .eq("id", branch_rows[0]["session_id"])
            .eq("clerk_user_id", user_id)
            .execute()
            .data
        )
        if not session_rows:
            raise NotFoundError(f"Tutor thread {tutor_thread_id!r} not found for this user")

        rows = (
            self._client.table("v2_tutor_messages")
            .select("*")
            .eq("tutor_thread_id", tutor_thread_id)
            .order("created_at")
            .execute()
            .data
        )
        return [self._row_to_tutor_message(r) for r in rows]


@lru_cache
def get_v2_store() -> V2Store:
    """Process-wide singleton store, backend chosen by Settings.v2_storage_backend.
    lru_cache (same pattern as app.config.get_settings) memoizes this safely
    across FastAPI's threadpool — a manual "if _store is None" global has a
    check-then-set race under concurrent first requests.
    """
    from app.config import get_settings  # local import avoids a config->store->config cycle

    settings = get_settings()
    if settings.v2_storage_backend == "supabase":
        from app.db import get_supabase_client

        client = get_supabase_client()
        if client is None:
            raise RuntimeError(
                "v2_storage_backend=supabase but Supabase is not configured "
                "(SUPABASE_URL / SUPABASE_SERVICE_KEY missing)"
            )
        return SupabaseV2Store(client)
    return InMemoryV2Store()
