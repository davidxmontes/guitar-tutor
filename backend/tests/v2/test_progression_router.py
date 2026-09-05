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


def test_explore_progression_opens_independent_branch_with_compact_source_context() -> None:
    store = InMemoryV2Store()
    client = _app(store)
    session = client.post("/api/v2/sessions").json()
    source = session["branches"][0]
    store.update_branch(
        session["id"],
        source["id"],
        "user_1",
        title="Little Wing",
        current_artifact_kind="song_study",
        current_artifact_id="song-1",
        selection={"type": "range", "startMeasureIndex": 2, "endMeasureIndex": 5},
        focus={"measureIndex": 2, "windowSize": 4},
        recent_ideas=[{"title": "parent-only idea"}],
    )
    store.create_tutor_message(source["tutor_thread_id"], "user", {"text": "What is happening here?"})

    response = client.post(
        "/api/v2/progressions/explore",
        json={"session_id": session["id"], "branch_id": source["id"], "progression": CANDIDATE},
    )

    assert response.status_code == 201
    opened = response.json()
    assert opened["artifact"]["kind"] == "progression"
    assert opened["artifact"]["payload"] == CANDIDATE
    assert opened["branch"]["title"] == "Wistful I-vi-IV-V"
    assert opened["branch"]["current_artifact_id"] == opened["artifact"]["id"]
    assert opened["branch"]["tutor_thread_id"] != source["tutor_thread_id"]
    assert opened["branch"]["selection"] == {"type": "progression_chord", "index": 0}
    assert opened["branch"]["focus"] == {"type": "progression_chord", "index": 0}
    assert opened["branch"]["recent_ideas"] == []
    assert opened["branch"]["fork_context"] == {
        "source_branch_id": source["id"],
        "source_artifact_kind": "song_study",
        "source_artifact_id": "song-1",
        "source_selection": {"type": "range", "startMeasureIndex": 2, "endMeasureIndex": 5},
        "source_focus": {"measureIndex": 2, "windowSize": 4},
        "intent": "Explore Wistful I-vi-IV-V",
    }
    assert store.list_tutor_messages(opened["branch"]["tutor_thread_id"], "user_1") == []

    restored_source = store.get_session(session["id"], "user_1").branches[0]
    assert restored_source.selection == {"type": "range", "startMeasureIndex": 2, "endMeasureIndex": 5}
    assert restored_source.focus == {"measureIndex": 2, "windowSize": 4}
    assert restored_source.recent_ideas == [{"title": "parent-only idea"}]


def test_get_progression_returns_explored_artifact() -> None:
    store = InMemoryV2Store()
    client = _app(store)
    session = client.post("/api/v2/sessions").json()
    opened = client.post(
        "/api/v2/progressions/explore",
        json={
            "session_id": session["id"],
            "branch_id": session["branches"][0]["id"],
            "progression": CANDIDATE,
        },
    ).json()

    response = client.get(f"/api/v2/progressions/{opened['artifact']['id']}")

    assert response.status_code == 200
    assert response.json() == opened["artifact"]


def test_apply_exact_voicing_is_owned_revision_safe_and_reopens():
    store = InMemoryV2Store()
    client = _app(store)
    original = client.post("/api/v2/progressions", json=CANDIDATE).json()
    proposal = {
        "expected_updated_at": original["updated_at"], "chord_index": 0,
        "chord": {"root": "C", "quality": "unclassified", "voicing": [
            {"string": 6, "fret": 0}, {"string": 3, "fret": 9}, {"string": 1, "fret": 11}
        ], "tuning": [64, 59, 55, 50, 45, 38]},
    }
    url = f"/api/v2/progressions/{original['id']}/voicing"
    applied = client.patch(url, json=proposal)
    assert applied.status_code == 200
    saved = applied.json()
    assert saved["payload"]["chords"][0] == proposal["chord"]
    assert saved["payload"]["chords"][1] == CANDIDATE["chords"][1]
    assert client.get(f"/api/v2/progressions/{original['id']}").json() == saved
    assert client.patch(url, json=proposal).status_code == 409
    proposal["expected_updated_at"] = saved["updated_at"]
    proposal["chord_index"] = 99
    assert client.patch(url, json=proposal).status_code == 422
    assert client.get(f"/api/v2/progressions/{original['id']}").json() == saved
    client.app.dependency_overrides[get_current_user] = lambda: "other"
    assert client.patch(url, json=proposal).status_code == 404


@pytest.mark.parametrize("voicing,tuning", [
    ([{"string": 7, "fret": 2}], "standard"),
    ([{"string": 1, "fret": -1}], "standard"),
    ([{"string": 1, "fret": 2}, {"string": 1, "fret": 4}], "standard"),
    ([{"string": 1, "fret": 2}], "unknown"),
    ([{"string": 1, "fret": 2}], [64, 59]),
    ([], "standard"),
])
def test_invalid_physical_progressions_are_rejected_on_create_and_apply(voicing, tuning):
    client = _app(InMemoryV2Store())
    original = client.post("/api/v2/progressions", json=CANDIDATE).json()
    chord = {"root": "C", "quality": "anything", "voicing": voicing, "tuning": tuning}
    assert client.post("/api/v2/progressions", json={"title": "invalid", "chords": [chord]}).status_code == 422
    assert client.patch(f"/api/v2/progressions/{original['id']}/voicing", json={
        "expected_updated_at": original["updated_at"], "chord_index": 0, "chord": chord,
    }).status_code == 422
    assert client.get(f"/api/v2/progressions/{original['id']}").json() == original


def test_apply_preserves_untouched_legacy_chords():
    store = InMemoryV2Store()
    client = _app(store)
    legacy = {"root": "C", "quality": "major", "tuning": "standard", "voicing": [{"string": 1, "fret": 0}, {"string": 1, "fret": 12}]}
    artifact = store.create_artifact("user_1", "progression", "Old idea", {"title": "Old idea", "chords": [legacy, legacy]})
    response = client.patch(f"/api/v2/progressions/{artifact.id}/voicing", json={"expected_updated_at": artifact.updated_at, "chord_index": 0, "chord": CANDIDATE["chords"][0]})
    assert response.status_code == 200
    assert response.json()["payload"]["chords"] == [CANDIDATE["chords"][0], legacy]
