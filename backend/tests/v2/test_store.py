import pytest

from app.v2.models import Branch, HarmonyExploration, ProgressionWorkspaceState
from app.v2.store import InMemoryV2Store, NotFoundError


@pytest.fixture
def store():
    return InMemoryV2Store()


# --- Branch shape (Spec #100 §5.1) — ticket #101 --------------------------


def test_create_session_opens_one_branch_with_an_empty_harmony_exploration(store):
    session = store.create_session(user_id="user_1")

    assert session.user_id == "user_1"
    assert len(session.branches) == 1
    branch = session.branches[0]
    assert branch.session_id == session.id
    assert branch.tutor_thread_id
    assert branch.active_workspace == "harmony"
    assert branch.harmony_exploration == HarmonyExploration()
    assert branch.progression_workspace is None
    assert branch.live_presentation_turn_id is None


def test_branch_has_no_legacy_concept_fields():
    assert not hasattr(Branch(id="b", session_id="s", tutor_thread_id="t",
                              harmony_exploration=HarmonyExploration(),
                              created_at="now", updated_at="now"), "working_draft")
    for gone in ("current_artifact_kind", "current_artifact_id", "saved_artifact_revision",
                 "selection", "focus", "recent_ideas", "fork_context"):
        assert gone not in Branch.model_fields


def test_branch_requires_a_workspace_and_active_names_a_present_one():
    with pytest.raises(ValueError):
        Branch(id="b", session_id="s", tutor_thread_id="t", created_at="n", updated_at="n")
    with pytest.raises(ValueError):
        Branch(id="b", session_id="s", tutor_thread_id="t", active_workspace="progression",
               harmony_exploration=HarmonyExploration(), created_at="n", updated_at="n")


def test_new_branch_round_trips_the_new_shape_through_the_store(store):
    session = store.create_session(user_id="user_1")
    branch_id = session.branches[0].id

    updated = store.update_branch(
        session.id, branch_id, user_id="user_1",
        progression_workspace=ProgressionWorkspaceState(ideas=[{"id": "i1", "label": "Idea"}], active_idea_id="i1"),
        active_workspace="progression",
        live_presentation_turn_id="turn-1",
    )
    assert updated.active_workspace == "progression"
    assert updated.progression_workspace.active_idea_id == "i1"
    assert updated.live_presentation_turn_id == "turn-1"
    assert updated.harmony_exploration == HarmonyExploration()

    reloaded = store.get_session(session.id, user_id="user_1").branches[0]
    assert reloaded == updated
    assert reloaded.progression_workspace.ideas == [{"id": "i1", "label": "Idea"}]


def test_update_branch_rejects_making_active_workspace_absent(store):
    session = store.create_session(user_id="user_1")
    branch_id = session.branches[0].id
    with pytest.raises(ValueError):
        store.update_branch(session.id, branch_id, user_id="user_1", active_workspace="progression")


def test_create_branch_conversational_fork_opens_its_own_empty_harmony_exploration(store):
    session = store.create_session(user_id="user_1")
    fork = store.create_branch(session.id, user_id="user_1", title="Alternative")

    assert fork.id != session.branches[0].id
    assert fork.tutor_thread_id != session.branches[0].tutor_thread_id
    assert fork.active_workspace == "harmony"
    assert fork.harmony_exploration == HarmonyExploration()
    assert store.get_session(session.id, "user_1").branches[-1].id == fork.id


def test_close_and_reopen_branch_survives_reload(store):
    session = store.create_session(user_id="user_1")
    branch_id = session.branches[0].id

    store.update_branch(session.id, branch_id, "user_1", closed=True)
    assert store.get_session(session.id, "user_1").branches[0].closed is True
    store.update_branch(session.id, branch_id, "user_1", closed=False)
    assert store.get_session(session.id, "user_1").branches[0].closed is False


def test_get_session_scoped_per_user(store):
    created = store.create_session(user_id="user_1")
    with pytest.raises(NotFoundError):
        store.get_session(created.id, user_id="someone_else")
    with pytest.raises(NotFoundError):
        store.get_session("does-not-exist", user_id="user_1")


def test_list_sessions_returns_only_that_users_sessions_newest_first(store):
    store.create_session(user_id="user_1")
    other = store.create_session(user_id="user_2")
    newest = store.create_session(user_id="user_1")

    sessions = store.list_sessions(user_id="user_1")

    assert [s.id for s in sessions] == [newest.id, sessions[1].id]
    assert other.id not in [s.id for s in sessions]


def test_update_branch_raises_not_found_for_other_user(store):
    session = store.create_session(user_id="user_1")
    branch_id = session.branches[0].id
    with pytest.raises(NotFoundError):
        store.update_branch(session.id, branch_id, user_id="someone_else", title="x")


# --- Artifact CRUD -----------------------------------------------------


def test_create_artifact_returns_owned_artifact_with_payload(store):
    artifact = store.create_artifact(
        user_id="user_1", kind="song_study", title="Oasis - Wonderwall",
        payload={"song_id": 7, "tab_data": {"measures": [{}]}},
    )
    assert artifact.user_id == "user_1"
    assert artifact.kind == "song_study"
    assert artifact.payload["song_id"] == 7
    assert artifact.id and artifact.created_at


def test_get_artifact_scoped_to_owner(store):
    created = store.create_artifact(user_id="user_1", kind="song_study", title="t", payload={"a": 1})
    assert store.get_artifact(created.id, user_id="user_1") == created
    with pytest.raises(NotFoundError):
        store.get_artifact(created.id, user_id="someone_else")
    with pytest.raises(NotFoundError):
        store.get_artifact("does-not-exist", user_id="user_1")


def test_list_artifacts_filters_by_owner_and_kind_newest_first(store):
    older = store.create_artifact("user_1", "progression", "First", {})
    store.create_artifact("user_1", "song_study", "Song", {})
    store.create_artifact("user_2", "progression", "Private", {})
    newer = store.create_artifact("user_1", "progression", "Second", {})

    assert [a.id for a in store.list_artifacts("user_1", "progression")] == [newer.id, older.id]


def test_update_artifact_replaces_payload_without_changing_identity(store):
    created = store.create_artifact(user_id="user_1", kind="song_study", title="Wonderwall",
                                    payload={"tab_data": {"measures": [{}]}})
    updated = store.update_artifact(created.id, user_id="user_1",
                                    payload={"tab_data": {"measures": [{}]}, "chordpro": "[Em]Today"})
    assert updated.id == created.id and updated.title == created.title
    assert updated.payload["chordpro"] == "[Em]Today"
    assert store.get_artifact(created.id, "user_1") == updated
    with pytest.raises(NotFoundError):
        store.update_artifact(created.id, user_id="someone_else", payload={"x": True})
