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

from typing import Any, Optional, Protocol

from app.v2.models import (
    ArtifactRevision,
    Artifact,
    Branch,
    HarmonyExploration,
    Session,
    TutorMessage,
)


class RevisionConflictError(Exception):
    pass


class NotFoundError(Exception):
    """Raised when a session/branch doesn't exist or isn't owned by the caller."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex


def _dump_fields(fields: dict[str, Any]) -> dict[str, Any]:
    from pydantic import BaseModel as _BM
    return {k: (v.model_dump() if isinstance(v, _BM) else v) for k, v in fields.items()}


def _branch_defaults(fields: dict[str, Any]) -> dict[str, Any]:
    """A Branch needs at least one workspace (Spec §5.1). A conversational fork
    with none specified opens an empty Harmony Exploration, matching "new session"."""
    fields = dict(fields)
    if fields.get("harmony_exploration") is None and fields.get("progression_workspace") is None:
        fields["harmony_exploration"] = HarmonyExploration()
        fields.setdefault("active_workspace", "harmony")
    return fields


def _revised(artifact: Artifact, payload: dict[str, Any], save: bool) -> Artifact:
    if payload == artifact.payload and (not save or artifact.saved_at):
        return artifact
    now = _now()
    revisions = list(artifact.revisions)
    if artifact.saved_at and payload != artifact.payload:
        revisions.append(ArtifactRevision(revision=artifact.updated_at, payload=deepcopy(artifact.payload)))
    # ponytail: snapshots share the artifact JSON row for atomic compare-and-swap.
    # Move history to a separate table if large songs or long histories make rows costly.
    return artifact.model_copy(update={"payload": deepcopy(payload), "title": artifact.title if artifact.kind == "song_study" else payload.get("title", artifact.title), "updated_at": now,
        "saved_at": artifact.saved_at or (now if save else None), "revisions": revisions})


class V2Store(Protocol):
    def create_session(self, user_id: str) -> Session: ...
    def get_session(self, session_id: str, user_id: str) -> Session: ...
    def list_sessions(self, user_id: str) -> list[Session]: ...
    def create_branch(self, session_id: str, user_id: str, **fields: Any) -> Branch: ...
    def update_branch(self, session_id: str, branch_id: str, user_id: str, **fields: Any) -> Branch: ...
    def commit_workspace_turn(self, branch: Branch, user_id: str, music: dict, question: str, content: dict) -> Branch: ...
    def restore_workspace_turn(self, branch: Branch, user_id: str, turn_id: str, *, undo: bool = False) -> Branch: ...
    def save_progression_idea(self, branch: Branch, user_id: str) -> tuple[Branch, Artifact]: ...
    def create_artifact(self, user_id: str, kind: str, title: str, payload: dict[str, Any], saved: bool = True) -> Artifact: ...
    def get_artifact(self, artifact_id: str, user_id: str) -> Artifact: ...
    def list_artifacts(self, user_id: str, kind: Optional[str] = None) -> list[Artifact]: ...
    def update_artifact(self, artifact_id: str, user_id: str, payload: dict[str, Any], expected_updated_at: Optional[str] = None, *, save: bool = False) -> Artifact: ...
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
            harmony_exploration=HarmonyExploration(),
            active_workspace="harmony",
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
        now = _now()
        fields = _branch_defaults(fields)
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
            expected = fields.pop('expected_updated_at', None)
            if expected is not None:
                current = next((b for b in self.get_session(session_id, user_id).branches if b.id == branch_id), None)
                if current is None: raise NotFoundError('Branch not found')
                if current.updated_at != expected: raise RevisionConflictError('Workspace changed')
            return self._update_branch(session_id, branch_id, user_id, **fields)

    def _update_branch(self, session_id: str, branch_id: str, user_id: str, **fields: Any) -> Branch:
        session = self.get_session(session_id, user_id)  # raises NotFoundError if not owned

        for i, branch in enumerate(session.branches):
            if branch.id != branch_id:
                continue
            merged = {**branch.model_dump(), **_dump_fields(fields), "updated_at": _now()}
            updated = Branch.model_validate(merged)  # keeps the workspace invariant
            session.branches[i] = updated
            return updated

        raise NotFoundError(f"Branch {branch_id!r} not found on session {session_id!r}")

    def commit_workspace_turn(self, branch: Branch, user_id: str, music: dict, question: str, content: dict) -> Branch:
        from app.v2.turns import musical_snapshot
        from app.v2.presentation import validate_composition
        with self._branch_lock:
            session = self.get_session(branch.session_id, user_id)
            index = next((i for i, value in enumerate(session.branches) if value.id == branch.id), None)
            if index is None:
                raise NotFoundError('Branch not found')
            current = session.branches[index]
            if current.updated_at != branch.updated_at:
                raise RevisionConflictError('Workspace changed during Tutor turn')
            content = deepcopy(content)
            content.pop('attention', None)
            content['musical_snapshot'] = musical_snapshot(current)
            content['presentation'] = validate_composition(music['active_workspace'], content['presentation']).model_dump()
            now, turn_id = _now(), _new_id()
            updated = Branch.model_validate(current.model_dump() | music | {
                'live_presentation_turn_id': turn_id, 'updated_at': now})
            messages = [TutorMessage(id=_new_id(), tutor_thread_id=current.tutor_thread_id,
                                    role='user', content={'text': question}, created_at=now),
                        TutorMessage(id=turn_id, tutor_thread_id=current.tutor_thread_id,
                                    role='assistant', content=content, created_at=now)]
            # Validate and prepare everything before publishing either value.
            history = self._tutor_messages.get(current.tutor_thread_id, []) + messages
            session.branches[index] = updated
            self._tutor_messages[current.tutor_thread_id] = history
            return deepcopy(updated)

    def restore_workspace_turn(self, branch: Branch, user_id: str, turn_id: str, *, undo: bool = False) -> Branch:
        with self._branch_lock:
            current = next((value for value in self.get_session(branch.session_id, user_id).branches if value.id == branch.id), None)
            if current is None:
                raise NotFoundError('Branch not found')
            if current.updated_at != branch.updated_at:
                raise RevisionConflictError('Workspace changed')
            turn = next((message for message in self.list_tutor_messages(current.tutor_thread_id, user_id)
                         if message.id == turn_id and message.role == 'assistant' and message.content.get('presentation')), None)
            if turn is None:
                raise NotFoundError('Turn not found')
            fields = turn.content['musical_snapshot'] if undo else {'live_presentation_turn_id': turn_id}
            return deepcopy(self._update_branch(branch.session_id, branch.id, user_id, **fields))

    def save_progression_idea(self, branch: Branch, user_id: str) -> tuple[Branch, Artifact]:
        from app.v2.progression_state import artifact_payload, ProgressionWorkspaceState
        with self._branch_lock:
            current = next((b for b in self.get_session(branch.session_id, user_id).branches if b.id == branch.id), None)
            if current is None:
                raise NotFoundError('Branch not found')
            if current.updated_at != branch.updated_at:
                raise RevisionConflictError('Workspace changed')
            workspace = current.progression_workspace
            idea = next((idea for idea in workspace.ideas if idea.id == workspace.active_idea_id), None) if workspace else None
            if idea is None:
                raise ValueError('Choose an idea to save')
            payload = artifact_payload(idea).model_dump()
            # ponytail: memory saves snapshot the artifact map for rollback; journal only
            # the affected row if this development backend grows a large library.
            prior_artifacts, prior_session = deepcopy(self._artifacts), deepcopy(self._sessions[branch.session_id])
            try:
                artifact = self.update_artifact(idea.artifact_id, user_id, payload, idea.base_revision_id, save=True) if idea.artifact_id else self.create_artifact(user_id, 'progression', idea.label, payload)
                data = workspace.model_dump()
                for item in data['ideas']:
                    if item['id'] == idea.id:
                        item.update(artifact_id=artifact.id, base_revision_id=artifact.updated_at, dirty=False)
                updated = self._update_branch(branch.session_id, branch.id, user_id, progression_workspace=ProgressionWorkspaceState.model_validate(data))
                return deepcopy(updated), deepcopy(artifact)
            except Exception:
                self._artifacts, self._sessions[branch.session_id] = prior_artifacts, prior_session
                raise

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
            harmony_exploration=row.get("harmony_exploration"),
            progression_workspace=row.get("progression_workspace"),
            active_workspace=row.get("active_workspace") or "harmony",
            live_presentation_turn_id=row.get("live_presentation_turn_id"),
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
            .insert({
                "session_id": session_row["id"],
                "tutor_thread_id": _new_id(),
                "harmony_exploration": HarmonyExploration().model_dump(),
                "active_workspace": "harmony",
            })
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
        rows = (
            self._client.table("v2_branches")
            .insert({"session_id": session_id, "tutor_thread_id": _new_id(), **_dump_fields(_branch_defaults(fields))})
            .execute()
            .data
        )
        if not rows:
            raise RuntimeError("Supabase did not return the created branch")
        return self._row_to_branch(rows[0])

    def update_branch(self, session_id: str, branch_id: str, user_id: str, **fields: Any) -> Branch:
        self.get_session(session_id, user_id)  # raises NotFoundError if not owned

        expected = fields.pop('expected_updated_at', None)
        fields = _dump_fields(fields)
        if fields: fields["updated_at"] = _now()
        query = self._client.table("v2_branches")
        # PostgREST rejects .update({}) — a no-op PATCH just re-reads the row.
        query = query.update(fields) if fields else query.select("*")
        if expected is not None: query = query.eq("updated_at", expected)
        rows = query.eq("id", branch_id).eq("session_id", session_id).execute().data
        if not rows and expected is not None: raise RevisionConflictError("Workspace changed")
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

    def commit_workspace_turn(self, branch: Branch, user_id: str, music: dict, question: str, content: dict) -> Branch:
        from app.v2.presentation import validate_composition
        Branch.model_validate(branch.model_dump() | music)
        content = deepcopy(content)
        content.pop('attention', None)
        content['presentation'] = validate_composition(music['active_workspace'], content['presentation']).model_dump()
        return self._workspace_turn_rpc(branch, user_id, 'commit', music=music, question=question, content=content)

    def restore_workspace_turn(self, branch: Branch, user_id: str, turn_id: str, *, undo: bool = False) -> Branch:
        return self._workspace_turn_rpc(branch, user_id, 'undo' if undo else 'restore', turn_id=turn_id)

    def _workspace_turn_rpc(self, branch: Branch, user_id: str, action: str, **values) -> Branch:
        from postgrest.exceptions import APIError
        try:
            row = self._client.rpc('v2_workspace_turn', {
                'p_branch_id': branch.id, 'p_user_id': user_id, 'p_expected_updated_at': branch.updated_at,
                'p_action': action, **{'p_' + key: value for key, value in values.items()},
            }).execute().data
        except APIError as exc:
            if exc.code == '40001':
                raise RevisionConflictError('Workspace changed during Tutor turn') from exc
            if exc.code == 'P0002':
                raise NotFoundError('Workspace or turn not found') from exc
            raise
        return self._row_to_branch(row)

    def save_progression_idea(self, branch: Branch, user_id: str) -> tuple[Branch, Artifact]:
        from postgrest.exceptions import APIError
        from app.v2.progression_state import artifact_payload
        workspace = branch.progression_workspace
        idea = next((idea for idea in workspace.ideas if idea.id == workspace.active_idea_id), None) if workspace else None
        if idea is None:
            raise ValueError('Choose an idea to save')
        try:
            result = self._client.rpc('v2_save_progression_idea', {'p_branch_id': branch.id,
                'p_user_id': user_id, 'p_expected_updated_at': branch.updated_at,
                'p_payload': artifact_payload(idea).model_dump()}).execute().data
        except APIError as exc:
            if exc.code == '40001':
                raise RevisionConflictError('Workspace or artifact changed') from exc
            if exc.code == 'P0002':
                raise NotFoundError('Workspace or artifact not found') from exc
            raise
        return self._row_to_branch(result['branch']), self._row_to_artifact(result['artifact'])

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
