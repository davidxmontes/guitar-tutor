from unittest.mock import MagicMock, ANY

import pytest

from app.v2.models import HarmonyExploration
from app.v2.store import NotFoundError, SupabaseV2Store
from conftest import make_supabase_chain as _chain


def _session_row(session_id="sess-1", user_id="user_1"):
    return {"id": session_id, "clerk_user_id": user_id, "created_at": "t0", "updated_at": "t0"}


def _branch_row(session_id="sess-1", branch_id="branch-1"):
    return {
        "id": branch_id,
        "session_id": session_id,
        "tutor_thread_id": "thread-1",
        "harmony_exploration": HarmonyExploration().model_dump(),
        "progression_workspace": None,
        "active_workspace": "harmony",
        "live_presentation_turn_id": None,
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
    assert session.branches[0].active_workspace == "harmony"
    inserted = branch_chain.insert.call_args.args[0]
    assert inserted["harmony_exploration"] == HarmonyExploration().model_dump()
    assert inserted["active_workspace"] == "harmony"


def test_get_session_raises_not_found_when_no_rows():
    client = MagicMock()
    client.table.return_value = _chain([])

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.get_session("sess-1", user_id="user_1")


def test_get_session_loads_branches_new_shape():
    client = MagicMock()
    session_chain = _chain([_session_row()])
    branch_chain = _chain([_branch_row() | {
        "title": "Progression fork",
        "progression_workspace": {"ideas": [{"id": "i1", "label": "Idea"}], "active_idea_id": "i1", "focus": None},
        "active_workspace": "progression",
        "live_presentation_turn_id": "turn-9",
        "closed": True,
    }])
    client.table.side_effect = lambda name: {"v2_sessions": session_chain, "v2_branches": branch_chain}[name]

    store = SupabaseV2Store(client)
    session = store.get_session("sess-1", user_id="user_1")

    branch = session.branches[0]
    assert branch.id == "branch-1"
    assert branch.title == "Progression fork"
    assert branch.active_workspace == "progression"
    assert branch.progression_workspace.active_idea_id == "i1"
    assert branch.live_presentation_turn_id == "turn-9"
    assert branch.closed is True


def test_create_branch_checks_session_ownership_before_insert():
    client = MagicMock()
    session_chain = _chain([])
    client.table.return_value = session_chain

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.create_branch("sess-1", user_id="someone_else")

    client.table.assert_called_once_with("v2_sessions")
    session_chain.insert.assert_not_called()


def test_create_branch_conversational_fork_gets_its_own_thread_and_empty_harmony():
    client = MagicMock()
    session_chain = _chain([_session_row()])
    created_row = _branch_row(branch_id="branch-2") | {"tutor_thread_id": "thread-2", "title": "Alternative"}
    inserted_branch = _chain([created_row])
    client.table.side_effect = lambda name: session_chain if name == "v2_sessions" else inserted_branch

    store = SupabaseV2Store(client)
    branch = store.create_branch("sess-1", user_id="user_1", title="Alternative")

    inserted = inserted_branch.insert.call_args.args[0]
    assert inserted["session_id"] == "sess-1"
    assert inserted["tutor_thread_id"] and inserted["tutor_thread_id"] != "thread-1"
    assert inserted["title"] == "Alternative"
    assert inserted["harmony_exploration"] == HarmonyExploration().model_dump()
    assert inserted["active_workspace"] == "harmony"
    assert branch.tutor_thread_id == "thread-2"
    assert branch.active_workspace == "harmony"


def test_create_branch_reports_missing_inserted_row_cleanly():
    client = MagicMock()
    session_chain = _chain([_session_row()])
    empty_insert = _chain([])
    client.table.side_effect = lambda name: session_chain if name == "v2_sessions" else empty_insert

    store = SupabaseV2Store(client)
    with pytest.raises(RuntimeError, match="did not return the created branch"):
        store.create_branch("sess-1", user_id="user_1")


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


def test_update_branch_persists_workspace_fields():
    client = MagicMock()
    session_chain = _chain([_session_row()])
    updated_branch = _chain([_branch_row() | {
        "title": "Progression fork",
        "active_workspace": "progression",
        "progression_workspace": {"ideas": [], "active_idea_id": None, "focus": None},
        "live_presentation_turn_id": "turn-1",
        "closed": True,
    }])
    client.table.side_effect = lambda name: session_chain if name == "v2_sessions" else updated_branch

    store = SupabaseV2Store(client)
    branch = store.update_branch(
        "sess-1", "branch-1", user_id="user_1",
        title="Progression fork", active_workspace="progression",
        progression_workspace={"ideas": [], "active_idea_id": None, "focus": None},
        live_presentation_turn_id="turn-1", closed=True,
    )

    updated_branch.update.assert_called_once_with({
        "updated_at": ANY,
        "title": "Progression fork",
        "active_workspace": "progression",
        "progression_workspace": {"ideas": [], "active_idea_id": None, "focus": None},
        "live_presentation_turn_id": "turn-1",
        "closed": True,
    })
    assert branch.active_workspace == "progression"
    assert branch.live_presentation_turn_id == "turn-1"
    assert branch.closed is True


def test_update_branch_raises_not_found_when_branch_missing():
    client = MagicMock()

    def table(name):
        if name == "v2_sessions":
            return _chain([_session_row()])
        return _chain([])  # no branch rows updated

    client.table.side_effect = table

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.update_branch("sess-1", "branch-1", user_id="user_1", title="x")


# --- Artifact CRUD ---


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
    assert store.get_artifact("art-1", user_id="user_1").id == "art-1"


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
    artifact = store.update_artifact("art-1", user_id="user_1", payload={**row["payload"], "chordpro": "[D]Tomorrow"})

    assert artifact.payload["chordpro"] == "[Em]Today"
    assert artifact.updated_at == "t1"
    update = chain.update.call_args.args[0]
    assert update["payload"]["chordpro"] == "[D]Tomorrow"
    assert update["payload"]["_library"]["saved_at"] is None
    chain.eq.assert_any_call("updated_at", "t1")
    chain.eq.assert_any_call("id", "art-1")
    chain.eq.assert_any_call("clerk_user_id", "user_1")


def test_update_artifact_raises_not_found_when_owned_row_is_missing():
    client = MagicMock()
    client.table.return_value = _chain([])

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.update_artifact("art-1", user_id="user_1", payload={})


# --- Tutor message persistence ---


def _tutor_message_row(message_id="msg-1", thread_id="thread-1", role="user"):
    return {"id": message_id, "tutor_thread_id": thread_id, "role": role, "content": {"text": "hi"}, "created_at": "t0"}


def test_create_tutor_message_inserts_and_returns_it():
    client = MagicMock()
    client.table.return_value = _chain([_tutor_message_row()])

    store = SupabaseV2Store(client)
    message = store.create_tutor_message("thread-1", "user", {"text": "hi"})

    assert message.id == "msg-1"
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
    client.table.return_value = _chain([])

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.list_tutor_messages("thread-1", user_id="user_1")


def test_list_tutor_messages_raises_not_found_when_session_not_owned():
    client = MagicMock()

    def table(name):
        if name == "v2_branches":
            return _chain([{"session_id": "sess-1"}])
        return _chain([])

    client.table.side_effect = table

    store = SupabaseV2Store(client)
    with pytest.raises(NotFoundError):
        store.list_tutor_messages("thread-1", user_id="someone_else")


def test_conditional_artifact_update_rejects_concurrent_change():
    from app.v2.store import RevisionConflictError
    client = MagicMock()
    row = {"id": "p1", "clerk_user_id": "user_1", "kind": "progression", "title": "Idea", "payload": {}, "created_at": "t0", "updated_at": "t1"}
    read = _chain([row])
    write = _chain([])
    client.table.side_effect = [read, write]
    with pytest.raises(RevisionConflictError):
        SupabaseV2Store(client).update_artifact("p1", "user_1", {"chords": []}, "t1")
    assert ("updated_at", "t1") in [call.args for call in write.eq.call_args_list]
    assert ("clerk_user_id", "user_1") in [call.args for call in write.eq.call_args_list]


def test_revision_metadata_survives_store_reconstruction_without_leaking_into_payload():
    from copy import deepcopy
    from types import SimpleNamespace
    client = MagicMock()
    row = {"id": "p1", "clerk_user_id": "user_1", "kind": "progression", "title": "Idea", "payload": {"chords": ["D"]}, "created_at": "t0", "updated_at": "t1"}
    read = _chain([deepcopy(row)])
    write = _chain([])

    def persist():
        row.update(write.update.call_args.args[0])
        return SimpleNamespace(data=[deepcopy(row)])

    write.execute.side_effect = persist
    client.table.side_effect = [read, write]
    SupabaseV2Store(client).update_artifact('p1', 'user_1', {'chords': ['E']}, 't1')
    client.table.side_effect = None
    client.table.return_value = _chain([row])
    restored = SupabaseV2Store(client).get_artifact('p1', 'user_1')
    assert restored.payload == {'chords': ['E']}
    assert restored.revisions[0].payload == {'chords': ['D']}
    assert restored.saved_at == 't0'
    assert 'revisions' not in restored.model_dump()


def test_progression_save_rpc_round_trip_and_conflict():
    from app.v2.models import Branch
    from app.v2.progression_state import ProgressionIdeaDraft, ProgressionWorkspaceState
    from postgrest.exceptions import APIError
    from app.v2.store import RevisionConflictError
    client = MagicMock()
    idea = ProgressionIdeaDraft(id='idea', label='Draft')
    row = _branch_row() | {'progression_workspace': ProgressionWorkspaceState(ideas=[idea], active_idea_id=idea.id).model_dump()}
    store = SupabaseV2Store(client)
    branch = store._row_to_branch(row)
    artifact = {'id': 'a', 'clerk_user_id': 'user_1', 'kind': 'progression', 'title': 'Draft', 'payload': {'title': 'Draft'}, 'created_at': 't0', 'updated_at': 't1'}
    client.rpc.return_value.execute.return_value.data = {'branch': row, 'artifact': artifact}
    updated, saved = store.save_progression_idea(branch, 'user_1')
    assert isinstance(updated, Branch) and saved.title == 'Draft'
    name, args = client.rpc.call_args.args
    assert name == 'v2_save_progression_idea' and args['p_expected_updated_at'] == branch.updated_at
    assert args['p_payload']['title'] == 'Draft'
    client.rpc.return_value.execute.side_effect = APIError({'message': 'stale', 'code': '40001', 'details': '', 'hint': ''})
    with pytest.raises(RevisionConflictError): store.save_progression_idea(branch, 'user_1')


def test_branch_gesture_compare_and_swap_filters_timestamp():
    from app.v2.store import RevisionConflictError
    client = MagicMock(); store = SupabaseV2Store(client)
    store.get_session = MagicMock()
    chain = _chain([]); client.table.return_value = chain
    with pytest.raises(RevisionConflictError):
        store.update_branch('s','b','owner',expected_updated_at='t1',title='Changed')
    assert ('updated_at','t1') in [call.args for call in chain.eq.call_args_list]
    assert 'expected_updated_at' not in chain.update.call_args.args[0]
    assert chain.update.call_args.args[0]['updated_at'] != 't1'
