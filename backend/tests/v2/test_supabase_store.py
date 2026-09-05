from unittest.mock import MagicMock

import pytest

from app.v2.store import NotFoundError, SupabaseV2Store
from conftest import make_supabase_chain as _chain


def _session_row(session_id="sess-1", user_id="user_1"):
    return {"id": session_id, "clerk_user_id": user_id, "created_at": "t0", "updated_at": "t0"}


def _branch_row(session_id="sess-1", branch_id="branch-1"):
    return {
        "id": branch_id,
        "session_id": session_id,
        "tutor_thread_id": "thread-1",
        "current_artifact_kind": None,
        "current_artifact_id": None,
        "selection": None,
        "focus": None,
        "recent_ideas": [],
        "created_at": "t0",
        "updated_at": "t0",
    }


def test_create_session_inserts_session_and_one_branch():
    client = MagicMock()
    session_chain = _chain([_session_row()])
    branch_chain = _chain([_branch_row()])
    client.table.side_effect = lambda name: {"v2_sessions": session_chain, "v2_branches": branch_chain}[name]

    store = SupabaseV2Store(client)
    session = store.create_session(user_id="user_1")

    assert session.id == "sess-1"
    assert len(session.branches) == 1
    assert session.branches[0].tutor_thread_id == "thread-1"


def test_get_session_raises_not_found_when_no_rows():
    client = MagicMock()
    client.table.return_value = _chain([])

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.get_session("sess-1", user_id="user_1")


def test_get_session_loads_branches():
    client = MagicMock()
    session_chain = _chain([_session_row()])
    branch_chain = _chain([_branch_row()])
    client.table.side_effect = lambda name: {"v2_sessions": session_chain, "v2_branches": branch_chain}[name]

    store = SupabaseV2Store(client)
    session = store.get_session("sess-1", user_id="user_1")

    assert session.id == "sess-1"
    assert session.branches[0].id == "branch-1"


def test_update_branch_rejects_invalid_kind():
    client = MagicMock()
    session_chain = _chain([_session_row()])
    branch_chain = _chain([_branch_row()])
    client.table.side_effect = lambda name: {"v2_sessions": session_chain, "v2_branches": branch_chain}[name]

    store = SupabaseV2Store(client)
    with pytest.raises(ValueError):
        store.update_branch("sess-1", "branch-1", user_id="user_1", current_artifact_kind="nope")


def test_update_branch_with_no_fields_selects_instead_of_updating():
    """PostgREST rejects .update({}) — a no-op PATCH must read, not write."""
    client = MagicMock()
    session_chain = _chain([_session_row()])
    branch_chain = _chain([_branch_row()])
    client.table.side_effect = lambda name: {"v2_sessions": session_chain, "v2_branches": branch_chain}[name]

    store = SupabaseV2Store(client)
    branch = store.update_branch("sess-1", "branch-1", user_id="user_1")

    assert branch.id == "branch-1"
    branch_chain.update.assert_not_called()
    branch_chain.select.assert_called_with("*")


def test_update_branch_raises_not_found_when_branch_missing():
    client = MagicMock()

    def table(name):
        if name == "v2_sessions":
            return _chain([_session_row()])
        return _chain([])  # no branch rows updated

    client.table.side_effect = table

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.update_branch("sess-1", "branch-1", user_id="user_1", selection={})


# --- Artifact CRUD (SongStudy, ticket #12) ---


def _artifact_row(artifact_id="art-1", user_id="user_1"):
    return {
        "id": artifact_id,
        "clerk_user_id": user_id,
        "kind": "song_study",
        "title": "Oasis - Wonderwall",
        "payload": {"song_id": 7},
        "created_at": "t0",
        "updated_at": "t0",
    }


def test_create_artifact_inserts_and_returns_it():
    client = MagicMock()
    client.table.return_value = _chain([_artifact_row()])

    store = SupabaseV2Store(client)
    artifact = store.create_artifact(user_id="user_1", kind="song_study", title="Oasis - Wonderwall", payload={"song_id": 7})

    assert artifact.id == "art-1"
    assert artifact.kind == "song_study"
    assert artifact.payload == {"song_id": 7}
    client.table.assert_called_with("v2_artifacts")


def test_get_artifact_returns_owned_row():
    client = MagicMock()
    client.table.return_value = _chain([_artifact_row()])

    store = SupabaseV2Store(client)
    artifact = store.get_artifact("art-1", user_id="user_1")

    assert artifact.id == "art-1"


def test_get_artifact_raises_not_found_when_no_rows():
    client = MagicMock()
    client.table.return_value = _chain([])

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.get_artifact("art-1", user_id="user_1")


def test_update_artifact_updates_only_the_owned_row():
    client = MagicMock()
    row = _artifact_row()
    row["payload"] = {"song_id": 7, "chordpro": "[Em]Today"}
    row["updated_at"] = "t1"
    chain = _chain([row])
    client.table.return_value = chain

    store = SupabaseV2Store(client)
    artifact = store.update_artifact("art-1", user_id="user_1", payload=row["payload"])

    assert artifact.payload["chordpro"] == "[Em]Today"
    assert artifact.updated_at == "t1"
    update = chain.update.call_args.args[0]
    assert update["payload"] == row["payload"]
    assert update["updated_at"] != "t0"
    chain.eq.assert_any_call("id", "art-1")
    chain.eq.assert_any_call("clerk_user_id", "user_1")


def test_update_artifact_raises_not_found_when_owned_row_is_missing():
    client = MagicMock()
    client.table.return_value = _chain([])

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.update_artifact("art-1", user_id="user_1", payload={})


# --- Tutor message persistence (ticket #13) ---


def _tutor_message_row(message_id="msg-1", thread_id="thread-1", role="user"):
    return {"id": message_id, "tutor_thread_id": thread_id, "role": role, "content": {"text": "hi"}, "created_at": "t0"}


def test_create_tutor_message_inserts_and_returns_it():
    client = MagicMock()
    client.table.return_value = _chain([_tutor_message_row()])

    store = SupabaseV2Store(client)
    message = store.create_tutor_message("thread-1", "user", {"text": "hi"})

    assert message.id == "msg-1"
    assert message.tutor_thread_id == "thread-1"
    assert message.role == "user"
    client.table.assert_called_with("v2_tutor_messages")


def test_list_tutor_messages_returns_owned_thread_rows():
    client = MagicMock()

    def table(name):
        if name == "v2_branches":
            return _chain([{"session_id": "sess-1"}])
        if name == "v2_sessions":
            return _chain([{"id": "sess-1"}])
        return _chain([_tutor_message_row()])

    client.table.side_effect = table

    store = SupabaseV2Store(client)
    messages = store.list_tutor_messages("thread-1", user_id="user_1")

    assert len(messages) == 1
    assert messages[0].id == "msg-1"


def test_list_tutor_messages_raises_not_found_when_thread_has_no_branch():
    client = MagicMock()
    client.table.return_value = _chain([])  # no branch row for this thread_id

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.list_tutor_messages("thread-1", user_id="user_1")


def test_list_tutor_messages_raises_not_found_when_session_not_owned():
    client = MagicMock()

    def table(name):
        if name == "v2_branches":
            return _chain([{"session_id": "sess-1"}])
        return _chain([])  # session row filtered out — not owned by this user

    client.table.side_effect = table

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.list_tutor_messages("thread-1", user_id="someone_else")
