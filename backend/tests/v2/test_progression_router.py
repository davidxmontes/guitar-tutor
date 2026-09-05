"""HTTP-level tests for the Progression save endpoint (ticket #14):
POST /api/v2/progressions persists a candidate as a durable Progression
artifact via the existing generic store.create_artifact, without touching
any Branch's current_artifact_kind/current_artifact_id -- the SongStudy
branch the user saved from must stay current/active.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

from app.dependencies.auth import get_current_user
from app.v2.router import router
from app.v2.store import InMemoryV2Store, NotFoundError, V2Store, get_v2_store


def _app(store: V2Store) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/api/v2")
    app.dependency_overrides[get_current_user] = lambda: "user_1"
    app.dependency_overrides[get_v2_store] = lambda: store
    return TestClient(app)


CANDIDATE = {
    "title": "Wistful I-vi-IV-V",
    "chords": [
        {"root": "C", "quality": "major", "voicing": [{"string": 1, "fret": 0}], "tuning": "standard"},
        {"root": "A", "quality": "minor", "voicing": None, "tuning": None},
    ],
    "inspired_by": {"artifact_id": "a1", "artifact_kind": "song_study", "artifact_title": "Artist - Title"},
}


def test_create_progression_persists_a_progression_artifact() -> None:
    store = InMemoryV2Store()
    client = _app(store)

    response = client.post("/api/v2/progressions", json=CANDIDATE)

    assert response.status_code == 201
    body = response.json()
    assert body["kind"] == "progression"
    assert body["title"] == "Wistful I-vi-IV-V"
    assert body["payload"]["chords"][0]["voicing"] == [{"string": 1, "fret": 0}]
    assert body["payload"]["chords"][1]["voicing"] is None
    assert body["payload"]["inspired_by"]["artifact_id"] == "a1"

    saved = store.get_artifact(body["id"], "user_1")
    assert saved.kind == "progression"


def test_create_progression_does_not_change_any_branch_current_artifact() -> None:
    """Explicit acceptance criterion: saving a Progression must not move the
    SongStudy branch away from being current/active."""
    store = InMemoryV2Store()
    client = _app(store)
    created = client.post("/api/v2/sessions").json()
    session_id, branch_id = created["id"], created["branches"][0]["id"]
    store.update_branch(session_id, branch_id, "user_1", current_artifact_kind="song_study", current_artifact_id="song-1")

    response = client.post("/api/v2/progressions", json=CANDIDATE)
    assert response.status_code == 201

    branch = store.get_session(session_id, "user_1").branches[0]
    assert branch.current_artifact_kind == "song_study"
    assert branch.current_artifact_id == "song-1"


def test_create_progression_is_scoped_to_the_authenticated_user() -> None:
    store = InMemoryV2Store()
    client = _app(store)
    created = client.post("/api/v2/progressions", json=CANDIDATE).json()

    assert created["user_id"] == "user_1"
    with pytest.raises(NotFoundError):
        store.get_artifact(created["id"], "someone_else")
