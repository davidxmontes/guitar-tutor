import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.v2.concepts import build_concept_study
from app.v2.router import router
from app.v2.store import InMemoryV2Store, get_v2_store


@pytest.fixture
def store():
    return InMemoryV2Store()


@pytest.fixture
def client(store):
    app = FastAPI()
    app.include_router(router, prefix="/api/v2")
    app.dependency_overrides[get_current_user] = lambda: "user_1"
    app.dependency_overrides[get_v2_store] = lambda: store
    return TestClient(app)


@pytest.fixture
def session_and_branch(client):
    session = client.post("/api/v2/sessions").json()
    return session["id"], session["branches"][0]["id"]


def test_minor_pentatonic_facts_and_comparison_are_deterministic():
    study = build_concept_study("A", "pentatonic_minor")

    assert study.display_name == "A minor pentatonic"
    assert [(note.note, note.interval) for note in study.notes] == [
        ("A", "1"),
        ("C", "b3"),
        ("D", "4"),
        ("E", "5"),
        ("G", "b7"),
    ]
    assert [(note.note, note.interval) for note in study.relationships[0].notes] == [
        ("B", "2"),
        ("F", "b6"),
    ]
    assert all(5 <= position.fret <= 8 for position in study.positions)


def test_create_concept_study_saves_artifact_and_opens_it_on_current_branch(client, session_and_branch):
    session_id, branch_id = session_and_branch

    response = client.post(
        "/api/v2/concept-studies",
        json={
            "session_id": session_id,
            "branch_id": branch_id,
            "root": "A",
            "concept_id": "pentatonic_minor",
        },
    )

    assert response.status_code == 201
    opened = response.json()
    artifact = opened["artifact"]
    assert artifact["kind"] == "concept_study"
    assert artifact["title"] == "A minor pentatonic"
    assert artifact["payload"]["tuning"] == ["E", "B", "G", "D", "A", "E"]

    branch = opened["branch"]
    assert branch["current_artifact_kind"] == "concept_study"
    assert branch["current_artifact_id"] == artifact["id"]

    reopened = client.get(f"/api/v2/concept-studies/{artifact['id']}")
    assert reopened.status_code == 200
    assert reopened.json() == artifact


def test_work_on_concept_explicitly_opens_a_new_branch(client, session_and_branch):
    session_id, source_branch_id = session_and_branch

    response = client.post(
        "/api/v2/concept-studies",
        json={
            "session_id": session_id,
            "branch_id": source_branch_id,
            "root": "D",
            "concept_id": "major_triad",
            "open_in_new_branch": True,
        },
    )

    assert response.status_code == 201
    opened = response.json()
    assert opened["artifact"]["title"] == "D major triad"
    assert opened["branch"]["id"] != source_branch_id
    assert opened["branch"]["current_artifact_id"] == opened["artifact"]["id"]

    session = client.get(f"/api/v2/sessions/{session_id}").json()
    assert len(session["branches"]) == 2
    assert session["branches"][0]["current_artifact_id"] is None
    assert session["branches"][1]["tutor_thread_id"] != session["branches"][0]["tutor_thread_id"]


@pytest.mark.parametrize("payload", [
    {"root": "H", "concept_id": "pentatonic_minor"},
    {"root": "A", "concept_id": "not-a-concept"},
])
def test_create_concept_study_rejects_unknown_music(client, session_and_branch, payload):
    session_id, branch_id = session_and_branch
    response = client.post(
        "/api/v2/concept-studies",
        json={"session_id": session_id, "branch_id": branch_id, **payload},
    )
    assert response.status_code == 422


def test_create_concept_study_validates_branch_before_writing(client, store, session_and_branch):
    session_id, _ = session_and_branch
    response = client.post(
        "/api/v2/concept-studies",
        json={
            "session_id": session_id,
            "branch_id": "missing",
            "root": "A",
            "concept_id": "pentatonic_minor",
        },
    )
    assert response.status_code == 404
    assert store._artifacts == {}
