import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.music.scales import get_diatonic_chords, get_scale_degree
from app.v2.concepts import build_concept_study, get_study_catalog
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


def test_scale_degree_regressions_cover_modes_pentatonic_and_locrian_harmony():
    expected = {
        "dorian": ["1", "2", "b3", "4", "5", "6", "b7"],
        "phrygian": ["1", "b2", "b3", "4", "5", "b6", "b7"],
        "lydian": ["1", "2", "3", "#4", "5", "6", "7"],
        "mixolydian": ["1", "2", "3", "4", "5", "6", "b7"],
        "locrian": ["1", "b2", "b3", "4", "b5", "b6", "b7"],
        "pentatonic_minor": ["1", "b3", "4", "5", "b7"],
    }

    for mode, labels in expected.items():
        study = build_concept_study("C", mode)
        assert [note.interval for note in study.notes] == labels
        assert [get_scale_degree(note.note, "C", mode)[1] for note in study.notes] == labels

    assert [chord["numeral"] for chord in get_diatonic_chords("B", "locrian")] == [
        "i°", "II", "iii", "iv", "V", "VI", "vii"
    ]


def test_study_catalog_is_backend_owned_and_progressively_grouped(client):
    response = client.get("/api/v2/study/catalog")

    assert response.status_code == 200
    catalog = response.json()
    groups = {group["id"]: group["concepts"] for group in catalog["groups"]}
    assert catalog["roots"] == ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    assert {concept["id"] for concept in groups["essentials"]} >= {
        "major", "natural_minor", "pentatonic_major", "pentatonic_minor", "blues"
    }
    assert {concept["id"] for concept in groups["explore_more"]} >= {
        "dorian", "phrygian", "lydian", "mixolydian", "locrian", "harmonic_minor", "melodic_minor"
    }
    assert {concept["id"] for concept in groups["systems"]} == {"intervals"}
    assert all(concept["display_name"] for group in catalog["groups"] for concept in group["concepts"])


def test_study_catalog_groups_supported_chords_by_learning_depth(client):
    catalog = client.get("/api/v2/study/catalog").json()
    groups = {group["id"]: {concept["id"] for concept in group["concepts"]} for group in catalog["groups"]}

    assert groups["essentials"] >= {
        "chord_major", "chord_minor", "chord_dominant7", "chord_major7",
        "chord_minor7", "chord_sus2", "chord_sus4",
    }
    assert groups["explore_more"] >= {
        "chord_diminished", "chord_augmented", "chord_dim7", "chord_m7b5",
        "chord_add9", "chord_madd9", "chord_9", "chord_m9", "chord_maj9",
    }


@pytest.mark.parametrize(
    ("concept_id", "quality", "intervals"),
    [
        ("chord_minor", "minor", ["1", "b3", "5"]),
        ("chord_dominant7", "dominant7", ["1", "3", "5", "b7"]),
        ("chord_augmented", "augmented", ["1", "3", "#5"]),
        ("chord_maj9", "maj9", ["1", "3", "5", "7", "9"]),
    ],
)
def test_chord_studies_build_deterministic_tones_and_physical_shapes(concept_id, quality, intervals):
    study = build_concept_study("C", concept_id)

    assert study.visualization == "chord"
    assert study.quality == quality
    assert [note.interval for note in study.notes] == intervals
    assert study.voicings
    assert all(voicing.positions for voicing in study.voicings)
    assert all(position.note in {note.note for note in study.notes} for position in study.positions)


def test_every_catalog_concept_has_a_validated_visualization():
    for group in get_study_catalog().groups:
        for concept in group.concepts:
            payload = build_concept_study("C", concept.id)
            assert payload.visualization == concept.visualization


def test_transient_visualization_builds_scale_and_interval_without_artifact(client, store, session_and_branch):
    session_id, branch_id = session_and_branch

    scale = client.get("/api/v2/study/visualizations/dorian", params={"root": "D"})
    interval = client.get("/api/v2/study/visualizations/intervals", params={"root": "A"})

    assert scale.status_code == 200
    assert scale.json()["visualization"] == "scale"
    assert scale.json()["display_name"] == "D Dorian"
    assert [note["interval"] for note in scale.json()["notes"]] == ["1", "2", "b3", "4", "5", "6", "b7"]
    assert interval.status_code == 200
    assert interval.json()["visualization"] == "interval"
    assert interval.json()["display_name"] == "Intervals from A"
    assert interval.json()["intervals"][7]["label"] == "5"
    assert store._artifacts == {}
    branch = client.get(f"/api/v2/sessions/{session_id}").json()["branches"][0]
    assert branch["id"] == branch_id
    assert branch["current_artifact_id"] is None


def test_save_concept_study_creates_snapshot_without_replacing_current_branch(client, session_and_branch):
    session_id, branch_id = session_and_branch
    client.patch(
        f"/api/v2/sessions/{session_id}/branches/{branch_id}",
        json={"current_artifact_kind": "song_study", "current_artifact_id": "song-1"},
    )

    response = client.post(
        "/api/v2/concept-studies",
        json={
            "session_id": session_id,
            "branch_id": branch_id,
            "root": "A",
            "concept_id": "pentatonic_minor",
            "comparison_id": "natural_minor",
            "overlay": "intervals",
            "promotion": "save",
        },
    )

    assert response.status_code == 201
    opened = response.json()
    artifact = opened["artifact"]
    assert artifact["kind"] == "concept_study"
    assert artifact["title"] == "A minor pentatonic"
    assert artifact["payload"]["tuning"] == ["E", "B", "G", "D", "A", "E"]
    assert artifact["payload"]["comparison_id"] == "natural_minor"
    assert artifact["payload"]["overlay"] == "intervals"
    assert not ({"scroll_position", "panel_dimensions", "zoom"} & artifact["payload"].keys())

    branch = opened["branch"]
    assert branch["current_artifact_kind"] == "song_study"
    assert branch["current_artifact_id"] == "song-1"

    reopened = client.get(f"/api/v2/concept-studies/{artifact['id']}")
    assert reopened.status_code == 200
    assert reopened.json() == artifact


def test_work_on_concept_promotes_semantic_state_into_a_new_branch(client, session_and_branch):
    session_id, source_branch_id = session_and_branch

    response = client.post(
        "/api/v2/concept-studies",
        json={
            "session_id": session_id,
            "branch_id": source_branch_id,
            "root": "D",
            "concept_id": "dorian",
            "comparison_id": "major",
            "overlay": "notes",
            "promotion": "work_on_this",
        },
    )

    assert response.status_code == 201
    opened = response.json()
    assert opened["artifact"]["title"] == "D Dorian"
    assert opened["artifact"]["payload"]["comparison_id"] == "major"
    assert opened["branch"]["id"] != source_branch_id
    assert opened["branch"]["current_artifact_id"] == opened["artifact"]["id"]

    session = client.get(f"/api/v2/sessions/{session_id}").json()
    assert len(session["branches"]) == 2
    assert session["branches"][0]["current_artifact_id"] is None
    assert session["branches"][1]["tutor_thread_id"] != session["branches"][0]["tutor_thread_id"]


def test_chord_promotion_restores_selected_voicing_and_comparison_without_layout(client, session_and_branch):
    session_id, source_branch_id = session_and_branch
    response = client.post(
        "/api/v2/concept-studies",
        json={
            "session_id": session_id,
            "branch_id": source_branch_id,
            "root": "A",
            "concept_id": "chord_minor",
            "selected_voicing": 1,
            "comparison_quality": "major",
            "overlay": "intervals",
            "promotion": "work_on_this",
        },
    )

    assert response.status_code == 201
    payload = response.json()["artifact"]["payload"]
    assert payload["visualization"] == "chord"
    assert payload["quality"] == "minor"
    assert payload["selected_voicing"] == 1
    assert payload["comparison_quality"] == "major"
    assert not ({"scroll_position", "panel_dimensions", "zoom"} & payload.keys())

    artifact_id = response.json()["artifact"]["id"]
    reopened = client.get(f"/api/v2/concept-studies/{artifact_id}")
    assert reopened.json()["payload"] == payload


def test_transient_chord_selection_creates_no_artifact(client, store, session_and_branch):
    response = client.get(
        "/api/v2/study/visualizations/chord_minor7",
        params={"root": "D", "selected_voicing": 2, "comparison_quality": "minor"},
    )

    assert response.status_code == 200
    assert response.json()["selected_voicing"] == 2
    assert response.json()["comparison_quality"] == "minor"
    assert store._artifacts == {}


def test_saved_concept_studies_can_be_listed_and_reopened_without_copying_layout_state(client, session_and_branch):
    session_id, branch_id = session_and_branch
    saved = client.post(
        "/api/v2/concept-studies",
        json={
            "session_id": session_id,
            "branch_id": branch_id,
            "root": "E",
            "concept_id": "intervals",
            "selected_interval": 3,
            "overlay": "intervals",
            "promotion": "save",
        },
    ).json()["artifact"]

    listed = client.get("/api/v2/concept-studies")
    assert listed.status_code == 200
    assert [artifact["id"] for artifact in listed.json()] == [saved["id"]]

    opened = client.post(
        f"/api/v2/concept-studies/{saved['id']}/work-on-this",
        json={"session_id": session_id, "branch_id": branch_id},
    )
    assert opened.status_code == 201
    body = opened.json()
    assert body["artifact"] == saved
    assert body["branch"]["current_artifact_id"] == saved["id"]
    assert body["artifact"]["payload"]["selected_interval"] == 3


def test_listing_concept_studies_excludes_other_users_artifacts(client, store):
    store.create_artifact("someone_else", "concept_study", "Private", {"visualization": "scale"})
    assert client.get("/api/v2/concept-studies").json() == []


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


def test_transient_intervals_reject_an_out_of_range_selection(client):
    response = client.get(
        "/api/v2/study/visualizations/intervals",
        params={"root": "A", "selected_interval": 99},
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
            "promotion": "save",
        },
    )
    assert response.status_code == 404
    assert store._artifacts == {}
