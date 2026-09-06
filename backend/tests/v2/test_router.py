import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.v2.router import router
from app.v2.store import InMemoryV2Store, get_v2_store


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router, prefix="/api/v2")
    store = InMemoryV2Store()
    app.dependency_overrides[get_current_user] = lambda: "user_1"
    app.dependency_overrides[get_v2_store] = lambda: store
    return TestClient(app)


def test_create_session_returns_session_with_one_branch(client):
    response = client.post("/api/v2/sessions")

    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == "user_1"
    assert len(body["branches"]) == 1


def test_list_sessions_returns_created_sessions(client):
    client.post("/api/v2/sessions")
    client.post("/api/v2/sessions")

    response = client.get("/api/v2/sessions")

    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_session_resumes_it(client):
    created = client.post("/api/v2/sessions").json()

    response = client.get(f"/api/v2/sessions/{created['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_session_404_for_unknown_id(client):
    response = client.get("/api/v2/sessions/does-not-exist")
    assert response.status_code == 404


def test_update_branch_sets_title_and_workspace_navigation(client):
    created = client.post("/api/v2/sessions").json()
    branch_id = created["branches"][0]["id"]

    resolved = client.patch(
        f"/api/v2/sessions/{created['id']}/branches/{branch_id}",
        json={"title": "Renamed", "live_presentation_turn_id": "turn-1"},
    )

    assert resolved.status_code == 200
    body = resolved.json()
    assert body["title"] == "Renamed"
    assert body["live_presentation_turn_id"] == "turn-1"
    assert body["active_workspace"] == "harmony"


def test_update_branch_422_when_active_workspace_names_an_absent_one(client):
    created = client.post("/api/v2/sessions").json()
    branch_id = created["branches"][0]["id"]

    resolved = client.patch(
        f"/api/v2/sessions/{created['id']}/branches/{branch_id}",
        json={"active_workspace": "progression"},
    )

    assert resolved.status_code == 422


def test_update_branch_can_explicitly_clear_a_nullable_field(client):
    created = client.post("/api/v2/sessions").json()
    branch_id = created["branches"][0]["id"]
    client.patch(
        f"/api/v2/sessions/{created['id']}/branches/{branch_id}",
        json={"live_presentation_turn_id": "turn-1"},
    )

    resolved = client.patch(
        f"/api/v2/sessions/{created['id']}/branches/{branch_id}",
        json={"live_presentation_turn_id": None},
    )

    assert resolved.status_code == 200
    assert resolved.json()["live_presentation_turn_id"] is None


def test_create_conversational_fork_branch(client):
    created = client.post("/api/v2/sessions").json()
    forked = client.post(f"/api/v2/sessions/{created['id']}/branches", json={"title": "Alternative"})
    assert forked.status_code == 201
    body = forked.json()
    assert body["title"] == "Alternative"
    assert body["active_workspace"] == "harmony"
    assert body["harmony_exploration"] is not None
    reloaded = client.get(f"/api/v2/sessions/{created['id']}").json()
    assert [b["id"] for b in reloaded["branches"]] == [created["branches"][0]["id"], body["id"]]


def test_update_branch_no_op_patch_returns_current_state(client):
    created = client.post("/api/v2/sessions").json()
    branch_id = created["branches"][0]["id"]

    response = client.patch(f"/api/v2/sessions/{created['id']}/branches/{branch_id}", json={})

    assert response.status_code == 200
    assert response.json()["id"] == branch_id


def test_close_and_reopen_branch_survives_session_reload(client):
    created = client.post("/api/v2/sessions").json()
    branch_id = created["branches"][0]["id"]

    closed = client.patch(
        f"/api/v2/sessions/{created['id']}/branches/{branch_id}",
        json={"closed": True},
    )
    reloaded = client.get(f"/api/v2/sessions/{created['id']}")

    assert closed.status_code == 200
    assert reloaded.json()["branches"][0]["closed"] is True

    reopened = client.patch(
        f"/api/v2/sessions/{created['id']}/branches/{branch_id}",
        json={"closed": False},
    )

    assert reopened.status_code == 200
    assert reopened.json()["closed"] is False


def test_sessions_are_isolated_per_user(client):
    created = client.post("/api/v2/sessions").json()

    client.app.dependency_overrides[get_current_user] = lambda: "someone_else"
    response = client.get(f"/api/v2/sessions/{created['id']}")

    assert response.status_code == 404
