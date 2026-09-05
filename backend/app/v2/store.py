"""V2 persistence — Session/Branch/Artifact storage.

Two backends, selected by Settings.v2_storage_backend:
- "memory" (default): process-lifetime, good enough for local dev and the
  browser acceptance test — no external credentials required.
- "supabase": durable, for deployments that already have Supabase configured
  (see docs/agents/project.md and the saved_progressions table for the same
  pattern — DDL lives in a doc, not an automated migration).
"""

import uuid
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Optional, Protocol

from app.v2.models import ARTIFACT_KINDS, Artifact, Branch, Session, TutorMessage


class NotFoundError(Exception):
    """Raised when a session/branch doesn't exist or isn't owned by the caller."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex


def _validate_artifact_kind(kind: Optional[str]) -> None:
    if kind is not None and kind not in ARTIFACT_KINDS:
        raise ValueError(f"Unknown artifact kind: {kind!r}. Supported: {ARTIFACT_KINDS}")


class V2Store(Protocol):
    def create_session(self, user_id: str) -> Session: ...
    def get_session(self, session_id: str, user_id: str) -> Session: ...
    def list_sessions(self, user_id: str) -> list[Session]: ...
    def update_branch(self, session_id: str, branch_id: str, user_id: str, **fields: Any) -> Branch: ...
    def create_artifact(self, user_id: str, kind: str, title: str, payload: dict[str, Any]) -> Artifact: ...
    def get_artifact(self, artifact_id: str, user_id: str) -> Artifact: ...
    def create_tutor_message(self, tutor_thread_id: str, role: str, content: dict[str, Any]) -> TutorMessage: ...
    def list_tutor_messages(self, tutor_thread_id: str, user_id: str) -> list[TutorMessage]: ...


class InMemoryV2Store:
    def __init__(self) -> None:
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
        session = self._sessions.get(session_id)
        if session is None or session.user_id != user_id:
            raise NotFoundError(f"Session {session_id!r} not found for this user")
        return session

    def list_sessions(self, user_id: str) -> list[Session]:
        owned = [s for s in self._sessions.values() if s.user_id == user_id]
        return sorted(owned, key=lambda s: s.created_at, reverse=True)

    def update_branch(self, session_id: str, branch_id: str, user_id: str, **fields: Any) -> Branch:
        session = self.get_session(session_id, user_id)  # raises NotFoundError if not owned

        if "current_artifact_kind" in fields:
            _validate_artifact_kind(fields["current_artifact_kind"])

        for i, branch in enumerate(session.branches):
            if branch.id != branch_id:
                continue
            updated = branch.model_copy(update={**fields, "updated_at": _now()})
            session.branches[i] = updated
            return updated

        raise NotFoundError(f"Branch {branch_id!r} not found on session {session_id!r}")

    def create_artifact(self, user_id: str, kind: str, title: str, payload: dict[str, Any]) -> Artifact:
        now = _now()
        artifact = Artifact(
            id=_new_id(),
            user_id=user_id,
            kind=kind,
            title=title,
            payload=payload,
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
        self._assert_thread_owned(tutor_thread_id, user_id)
        return list(self._tutor_messages.get(tutor_thread_id, []))


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
            current_artifact_kind=row.get("current_artifact_kind"),
            current_artifact_id=row.get("current_artifact_id"),
            selection=row.get("selection"),
            focus=row.get("focus"),
            recent_ideas=row.get("recent_ideas") or [],
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

    def update_branch(self, session_id: str, branch_id: str, user_id: str, **fields: Any) -> Branch:
        self.get_session(session_id, user_id)  # raises NotFoundError if not owned

        if "current_artifact_kind" in fields:
            _validate_artifact_kind(fields["current_artifact_kind"])

        query = self._client.table("v2_branches")
        # PostgREST rejects .update({}) — a no-op PATCH just re-reads the row.
        query = query.update(fields) if fields else query.select("*")
        rows = query.eq("id", branch_id).eq("session_id", session_id).execute().data
        if not rows:
            raise NotFoundError(f"Branch {branch_id!r} not found on session {session_id!r}")
        return self._row_to_branch(rows[0])

    def _row_to_artifact(self, row: dict[str, Any]) -> Artifact:
        return Artifact(
            id=row["id"],
            user_id=row["clerk_user_id"],
            kind=row["kind"],
            title=row["title"],
            payload=row.get("payload") or {},
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def create_artifact(self, user_id: str, kind: str, title: str, payload: dict[str, Any]) -> Artifact:
        row = (
            self._client.table("v2_artifacts")
            .insert({"clerk_user_id": user_id, "kind": kind, "title": title, "payload": payload})
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
