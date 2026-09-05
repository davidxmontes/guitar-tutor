"""HTTP-level tests for GET /api/v2/tutor/threads/{tutor_thread_id}/messages
(frontend history load, ticket #13) — same auth/ownership/404 pattern as
test_tutor_router.py's existing routes.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.v2.router import router
from app.v2.store import InMemoryV2Store, V2Store, get_v2_store


def _app(store: V2Store, user_id: str = "user_1") -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/api/v2")
    app.dependency_overrides[get_current_user] = lambda: user_id
    app.dependency_overrides[get_v2_store] = lambda: store
    return TestClient(app)


def test_list_tutor_messages_returns_persisted_history_in_order() -> None:
    store = InMemoryV2Store()
    client = _app(store)
    session = client.post("/api/v2/sessions").json()
    thread_id = session["branches"][0]["tutor_thread_id"]

    store.create_tutor_message(thread_id, "user", {"text": "Hi"})
    store.create_tutor_message(thread_id, "assistant", {"text": "Hello", "focus": None})

    response = client.get(f"/api/v2/tutor/threads/{thread_id}/messages")

    assert response.status_code == 200
    body = response.json()
    assert [m["role"] for m in body] == ["user", "assistant"]
    assert body[0]["content"]["text"] == "Hi"
    assert body[1]["content"]["text"] == "Hello"


def test_list_tutor_messages_returns_empty_list_for_a_fresh_thread() -> None:
    store = InMemoryV2Store()
    client = _app(store)
    session = client.post("/api/v2/sessions").json()
    thread_id = session["branches"][0]["tutor_thread_id"]

    response = client.get(f"/api/v2/tutor/threads/{thread_id}/messages")

    assert response.status_code == 200
    assert response.json() == []


def test_list_tutor_messages_404s_for_a_thread_owned_by_someone_else() -> None:
    store = InMemoryV2Store()
    owner_client = _app(store, user_id="user_1")
    session = owner_client.post("/api/v2/sessions").json()
    thread_id = session["branches"][0]["tutor_thread_id"]

    other_client = _app(store, user_id="someone_else")
    response = other_client.get(f"/api/v2/tutor/threads/{thread_id}/messages")

    assert response.status_code == 404


def test_list_tutor_messages_404s_for_an_unknown_thread() -> None:
    store = InMemoryV2Store()
    client = _app(store)
    client.post("/api/v2/sessions")

    response = client.get("/api/v2/tutor/threads/does-not-exist/messages")

    assert response.status_code == 404
