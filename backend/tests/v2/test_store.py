import pytest

from app.v2.store import InMemoryV2Store, NotFoundError


@pytest.fixture
def store():
    return InMemoryV2Store()


def test_create_session_has_one_branch_with_tutor_thread(store):
    session = store.create_session(user_id="user_1")

    assert session.user_id == "user_1"
    assert len(session.branches) == 1
    branch = session.branches[0]
    assert branch.session_id == session.id
    assert branch.tutor_thread_id
    assert branch.current_artifact_kind is None
    assert branch.recent_ideas == []


def test_get_session_returns_same_session_for_owning_user(store):
    created = store.create_session(user_id="user_1")

    fetched = store.get_session(created.id, user_id="user_1")

    assert fetched == created


def test_get_session_raises_not_found_for_other_user(store):
    created = store.create_session(user_id="user_1")

    with pytest.raises(NotFoundError):
        store.get_session(created.id, user_id="someone_else")


def test_get_session_raises_not_found_for_unknown_id(store):
    with pytest.raises(NotFoundError):
        store.get_session("does-not-exist", user_id="user_1")


def test_list_sessions_returns_only_that_users_sessions_newest_first(store):
    store.create_session(user_id="user_1")
    other = store.create_session(user_id="user_2")
    newest = store.create_session(user_id="user_1")

    sessions = store.list_sessions(user_id="user_1")

    assert [s.id for s in sessions] == [newest.id, sessions[1].id]
    assert other.id not in [s.id for s in sessions]


def test_update_branch_persists_selection_and_artifact_reference(store):
    session = store.create_session(user_id="user_1")
    branch_id = session.branches[0].id

    updated = store.update_branch(
        session.id,
        branch_id,
        user_id="user_1",
        current_artifact_kind="progression",
        current_artifact_id="artifact-1",
        selection={"range": [0, 4]},
        focus={"target": "chord-2"},
    )

    assert updated.current_artifact_kind == "progression"
    assert updated.current_artifact_id == "artifact-1"
    assert updated.selection == {"range": [0, 4]}
    assert updated.focus == {"target": "chord-2"}

    refetched = store.get_session(session.id, user_id="user_1")
    assert refetched.branches[0].current_artifact_kind == "progression"


def test_update_branch_rejects_invalid_artifact_kind(store):
    session = store.create_session(user_id="user_1")
    branch_id = session.branches[0].id

    with pytest.raises(ValueError):
        store.update_branch(
            session.id,
            branch_id,
            user_id="user_1",
            current_artifact_kind="not_a_real_kind",
        )


def test_update_branch_raises_not_found_for_other_user(store):
    session = store.create_session(user_id="user_1")
    branch_id = session.branches[0].id

    with pytest.raises(NotFoundError):
        store.update_branch(session.id, branch_id, user_id="someone_else", selection={})
