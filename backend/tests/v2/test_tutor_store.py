"""Store tests for tutor-message persistence (ticket #13) — same pattern as
the Artifact CRUD tests in test_store.py."""

import pytest

from app.v2.store import InMemoryV2Store, NotFoundError


@pytest.fixture
def store():
    return InMemoryV2Store()


def test_create_tutor_message_persists_it(store):
    session = store.create_session(user_id="user_1")
    thread_id = session.branches[0].tutor_thread_id

    message = store.create_tutor_message(thread_id, "user", {"text": "hello"})

    assert message.tutor_thread_id == thread_id
    assert message.role == "user"
    assert message.content == {"text": "hello"}
    assert message.id
    assert message.created_at


def test_list_tutor_messages_returns_them_in_insertion_order(store):
    session = store.create_session(user_id="user_1")
    thread_id = session.branches[0].tutor_thread_id
    store.create_tutor_message(thread_id, "user", {"text": "first"})
    store.create_tutor_message(thread_id, "assistant", {"text": "second"})

    messages = store.list_tutor_messages(thread_id, user_id="user_1")

    assert [m.content["text"] for m in messages] == ["first", "second"]


def test_list_tutor_messages_raises_not_found_for_other_user(store):
    session = store.create_session(user_id="user_1")
    thread_id = session.branches[0].tutor_thread_id
    store.create_tutor_message(thread_id, "user", {"text": "hello"})

    with pytest.raises(NotFoundError):
        store.list_tutor_messages(thread_id, user_id="someone_else")


def test_list_tutor_messages_raises_not_found_for_unknown_thread(store):
    with pytest.raises(NotFoundError):
        store.list_tutor_messages("does-not-exist", user_id="user_1")


def test_list_tutor_messages_empty_for_a_thread_with_no_messages_yet(store):
    session = store.create_session(user_id="user_1")
    thread_id = session.branches[0].tutor_thread_id

    assert store.list_tutor_messages(thread_id, user_id="user_1") == []
