from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.config import Settings, get_settings
from app.models.songsterr import SongsterrRevisionResponse
from app.v2.router import get_enrichment_model_factory, router
from app.v2.store import InMemoryV2Store, get_v2_store
from tests.v2.tutor_fakes import ScriptedTutorModel


def _revision(track_index=0, tuning=None):
    return SongsterrRevisionResponse.model_validate(
        {
            "revisionId": 99,
            "songId": 7,
            "artist": "Oasis",
            "title": "Wonderwall",
            "tracks": [
                {
                    "instrumentId": 1,
                    "instrument": "Guitar",
                    "name": "Acoustic Guitar",
                    "tuning": tuning if tuning is not None else [64, 59, 55, 50, 45, 40],
                    "isVocalTrack": False,
                    "isEmpty": False,
                }
            ],
            "image": "v0-abc",
        }
    )


TAB_DATA = {
    "tuning": [64, 59, 55, 50, 45, 40],
    "measures": [
        {"voices": [{"beats": [{"notes": [{"string": 0, "fret": 3}, {"string": 1, "fret": 3}]}]}]},
        {"voices": [{"beats": [{"notes": [{"string": 1, "fret": 0}]}]}]},
        {"voices": [{"beats": [{"notes": [{"string": 2, "fret": 2}]}]}]},
    ],
}


@pytest.fixture
def store():
    return InMemoryV2Store()


@pytest.fixture
def client(store):
    app = FastAPI()
    app.include_router(router, prefix="/api/v2")
    app.dependency_overrides[get_current_user] = lambda: "user_1"
    app.dependency_overrides[get_v2_store] = lambda: store
    app.dependency_overrides[get_settings] = lambda: Settings(v2_tutor_provider="openai", openai_api_key="k")
    return TestClient(app)


@pytest.fixture
def session_and_branch(client):
    created = client.post("/api/v2/sessions").json()
    return created["id"], created["branches"][0]["id"]


@patch("app.v2.router.songsterr.get_tab_data", new_callable=AsyncMock)
@patch("app.v2.router.songsterr.get_song_revision", new_callable=AsyncMock)
def test_create_song_study_returns_full_track_measures_immediately(
    get_song_revision, get_tab_data, client, session_and_branch,
):
    session_id, branch_id = session_and_branch
    get_song_revision.return_value = _revision()
    get_tab_data.return_value = TAB_DATA

    response = client.post(
        "/api/v2/song-studies",
        json={"session_id": session_id, "branch_id": branch_id, "song_id": 7, "track_index": 0},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["kind"] == "song_study"
    assert body["payload"]["song_id"] == 7
    assert body["payload"]["track"]["tuning"] == [64, 59, 55, 50, 45, 40]
    # All three measures present with no further tutor/agent call needed.
    assert len(body["payload"]["tab_data"]["measures"]) == 3
    get_tab_data.assert_awaited_once()


@patch("app.v2.router.songsterr.get_tab_data", new_callable=AsyncMock)
@patch("app.v2.router.songsterr.get_song_revision", new_callable=AsyncMock)
def test_create_song_study_includes_shapes_projected_with_track_tuning(
    get_song_revision, get_tab_data, client, session_and_branch,
):
    session_id, branch_id = session_and_branch
    drop_d = [64, 59, 55, 50, 45, 38]
    get_song_revision.return_value = _revision(tuning=drop_d)
    get_tab_data.return_value = {
        "tuning": [64, 59, 55, 50, 45, 40],
        "measures": [
            {"voices": [{"beats": [{"notes": [{"string": 0, "fret": 3}, {"string": 1, "fret": 3}]}]}]},
        ],
    }

    response = client.post(
        "/api/v2/song-studies",
        json={"session_id": session_id, "branch_id": branch_id, "song_id": 7, "track_index": 0},
    )

    assert response.status_code == 201
    assert response.json()["payload"]["shape_events"] == [
        {
            "label": None,
            "positions": [{"string": 1, "fret": 3}, {"string": 2, "fret": 3}],
            "tuning": drop_d,
            "sources": [{"measure_index": 0, "beat_index": 0}],
        }
    ]


@patch("app.v2.router.songsterr.get_tab_data", new_callable=AsyncMock)
@patch("app.v2.router.songsterr.get_song_revision", new_callable=AsyncMock)
def test_create_song_study_sets_it_as_current_artifact_on_branch(
    get_song_revision, get_tab_data, client, session_and_branch,
):
    session_id, branch_id = session_and_branch
    get_song_revision.return_value = _revision()
    get_tab_data.return_value = TAB_DATA

    created = client.post(
        "/api/v2/song-studies",
        json={"session_id": session_id, "branch_id": branch_id, "song_id": 7, "track_index": 0},
    ).json()

    branch = client.get(f"/api/v2/sessions/{session_id}").json()["branches"][0]
    assert branch["current_artifact_kind"] == "song_study"
    assert branch["current_artifact_id"] == created["id"]


@patch("app.v2.router.songsterr.get_song_revision", new_callable=AsyncMock)
def test_create_song_study_404_for_out_of_range_track(get_song_revision, client, session_and_branch):
    session_id, branch_id = session_and_branch
    get_song_revision.return_value = _revision()

    response = client.post(
        "/api/v2/song-studies",
        json={"session_id": session_id, "branch_id": branch_id, "song_id": 7, "track_index": 5},
    )

    assert response.status_code == 400


@patch("app.v2.router.songsterr.get_song_revision", new_callable=AsyncMock)
def test_create_song_study_404_when_no_tab_image(get_song_revision, client, session_and_branch):
    session_id, branch_id = session_and_branch
    revision = _revision()
    revision = revision.model_copy(update={"image": None})
    get_song_revision.return_value = revision

    response = client.post(
        "/api/v2/song-studies",
        json={"session_id": session_id, "branch_id": branch_id, "song_id": 7, "track_index": 0},
    )

    assert response.status_code == 404


@patch("app.v2.router.songsterr.get_song_revision", new_callable=AsyncMock)
def test_create_song_study_502_when_songsterr_errors(get_song_revision, client, session_and_branch):
    session_id, branch_id = session_and_branch
    get_song_revision.side_effect = RuntimeError("boom")

    response = client.post(
        "/api/v2/song-studies",
        json={"session_id": session_id, "branch_id": branch_id, "song_id": 7, "track_index": 0},
    )

    assert response.status_code == 502


def test_create_song_study_404_for_unknown_branch(client):
    with patch("app.v2.router.songsterr.get_song_revision", new_callable=AsyncMock) as get_song_revision, \
         patch("app.v2.router.songsterr.get_tab_data", new_callable=AsyncMock) as get_tab_data:
        get_song_revision.return_value = _revision()
        get_tab_data.return_value = TAB_DATA

        response = client.post(
            "/api/v2/song-studies",
            json={"session_id": "nope", "branch_id": "nope", "song_id": 7, "track_index": 0},
        )

    assert response.status_code == 404


def test_create_song_study_404_for_unknown_branch_skips_fetch_and_artifact(client, store, session_and_branch):
    # session_id is real (owned) but branch_id is not one of its branches —
    # must 404 before touching Songsterr or the artifact store at all.
    session_id, _real_branch_id = session_and_branch
    with patch("app.v2.router.songsterr.get_song_revision", new_callable=AsyncMock) as get_song_revision, \
         patch("app.v2.router.songsterr.get_tab_data", new_callable=AsyncMock) as get_tab_data:
        response = client.post(
            "/api/v2/song-studies",
            json={"session_id": session_id, "branch_id": "nope", "song_id": 7, "track_index": 0},
        )

        assert response.status_code == 404
        get_song_revision.assert_not_awaited()
        get_tab_data.assert_not_awaited()
    assert store._artifacts == {}


def test_create_song_study_422_for_negative_track_index(client, session_and_branch):
    session_id, branch_id = session_and_branch

    response = client.post(
        "/api/v2/song-studies",
        json={"session_id": session_id, "branch_id": branch_id, "song_id": 7, "track_index": -1},
    )

    assert response.status_code == 422


@patch("app.v2.router.songsterr.get_tab_data", new_callable=AsyncMock)
@patch("app.v2.router.songsterr.get_song_revision", new_callable=AsyncMock)
def test_get_song_study_returns_previously_created_artifact(
    get_song_revision, get_tab_data, client, session_and_branch,
):
    session_id, branch_id = session_and_branch
    get_song_revision.return_value = _revision()
    get_tab_data.return_value = TAB_DATA
    created = client.post(
        "/api/v2/song-studies",
        json={"session_id": session_id, "branch_id": branch_id, "song_id": 7, "track_index": 0},
    ).json()

    response = client.get(f"/api/v2/song-studies/{created['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_song_study_404_for_unknown_id(client):
    response = client.get("/api/v2/song-studies/does-not-exist")
    assert response.status_code == 404


@patch("app.v2.router.songsterr.get_tab_data", new_callable=AsyncMock)
@patch("app.v2.router.songsterr.get_song_revision", new_callable=AsyncMock)
def test_get_song_study_404_for_other_user(get_song_revision, get_tab_data, client, session_and_branch):
    session_id, branch_id = session_and_branch
    get_song_revision.return_value = _revision()
    get_tab_data.return_value = TAB_DATA
    created = client.post(
        "/api/v2/song-studies",
        json={"session_id": session_id, "branch_id": branch_id, "song_id": 7, "track_index": 0},
    ).json()

    client.app.dependency_overrides[get_current_user] = lambda: "someone_else"
    response = client.get(f"/api/v2/song-studies/{created['id']}")

    assert response.status_code == 404


def _create_raw_song_study(client, session_and_branch):
    session_id, branch_id = session_and_branch
    with patch("app.v2.router.songsterr.get_song_revision", new_callable=AsyncMock) as revision, patch(
        "app.v2.router.songsterr.get_tab_data", new_callable=AsyncMock
    ) as tab:
        revision.return_value = _revision()
        tab.return_value = TAB_DATA
        artifact = client.post(
            "/api/v2/song-studies",
            json={"session_id": session_id, "branch_id": branch_id, "song_id": 7, "track_index": 0},
        ).json()
    return artifact


def _enrichment_model(*ranges):
    return ScriptedTutorModel(outcomes=[{"ranges": list(ranges)}])


def _range(label="Intro", confidence="medium"):
    return {
        "start_measure": 1,
        "end_measure": 2,
        "section": label,
        "lyrics": ["Today is gonna be the day"],
        "broad_harmony": ["G"],
        "detailed_harmony": ["Gsus4", "G"],
        "confidence": confidence,
    }


@patch("app.v2.router.songsterr.get_chordpro", new_callable=AsyncMock)
def test_enhance_song_study_preserves_raw_sources_and_persists_derived_ranges(get_chordpro, client, session_and_branch):
    raw = _create_raw_song_study(client, session_and_branch)
    raw_tab = raw["payload"]["tab_data"]
    get_chordpro.return_value = "{section: Intro}\n[G]Today is gonna be the day"
    model = _enrichment_model(_range())
    client.app.dependency_overrides[get_enrichment_model_factory] = lambda: (lambda *_args, **_kwargs: model)

    response = client.post(f"/api/v2/song-studies/{raw['id']}/enrichment")

    assert response.status_code == 200
    payload = response.json()["payload"]
    assert payload["tab_data"] == raw_tab
    assert payload["chordpro"] == get_chordpro.return_value
    assert payload["enrichment"]["ranges"][0] == {
        **_range(),
        "provenance": "ai", "kind": "phrase", "repeat_group": None, "annotation": None,
    }
    assert payload["enrichment"]["source_sections"] == []
    assert client.get(f"/api/v2/song-studies/{raw['id']}").json()["payload"] == payload


@patch("app.v2.router.songsterr.get_chordpro", new_callable=AsyncMock)
def test_regenerate_replaces_only_enrichment_and_reuses_preserved_chordpro(get_chordpro, client, session_and_branch):
    raw = _create_raw_song_study(client, session_and_branch)
    get_chordpro.return_value = "{section: Intro}\n[G]Today"
    first_model = _enrichment_model(_range("Intro", "low"))
    client.app.dependency_overrides[get_enrichment_model_factory] = lambda: (lambda *_args, **_kwargs: first_model)
    first = client.post(f"/api/v2/song-studies/{raw['id']}/enrichment").json()

    second_model = _enrichment_model(_range("Verse", "high"))
    client.app.dependency_overrides[get_enrichment_model_factory] = lambda: (lambda *_args, **_kwargs: second_model)
    second = client.post(f"/api/v2/song-studies/{raw['id']}/enrichment")

    assert second.status_code == 200
    assert second.json()["payload"]["enrichment"]["ranges"][0]["section"] == "Verse"
    assert second.json()["payload"]["tab_data"] == raw["payload"]["tab_data"]
    assert second.json()["payload"]["chordpro"] == first["payload"]["chordpro"]
    get_chordpro.assert_awaited_once()


@patch("app.v2.router.songsterr.get_chordpro", new_callable=AsyncMock)
def test_remove_enrichment_keeps_tab_and_chordpro_inspectable(get_chordpro, client, session_and_branch):
    raw = _create_raw_song_study(client, session_and_branch)
    get_chordpro.return_value = "{section: Intro}\n[G]Today"
    model = _enrichment_model(_range())
    client.app.dependency_overrides[get_enrichment_model_factory] = lambda: (lambda *_args, **_kwargs: model)
    enhanced = client.post(f"/api/v2/song-studies/{raw['id']}/enrichment").json()

    response = client.delete(f"/api/v2/song-studies/{raw['id']}/enrichment")

    assert response.status_code == 200
    payload = response.json()["payload"]
    assert payload["enrichment"] is None
    assert payload["tab_data"] == raw["payload"]["tab_data"]
    assert payload["chordpro"] == enhanced["payload"]["chordpro"]


@patch("app.v2.router.songsterr.get_chordpro", new_callable=AsyncMock)
def test_failed_ai_enrichment_leaves_raw_sources_usable(get_chordpro, client, session_and_branch):
    raw = _create_raw_song_study(client, session_and_branch)
    get_chordpro.return_value = "{section: Intro}\n[G]Today"
    unsupported = ScriptedTutorModel(outcomes=[], unsupported_tools=True)
    client.app.dependency_overrides[get_enrichment_model_factory] = lambda: (lambda *_args, **_kwargs: unsupported)

    response = client.post(f"/api/v2/song-studies/{raw['id']}/enrichment")

    assert response.status_code == 422
    payload = client.get(f"/api/v2/song-studies/{raw['id']}").json()["payload"]
    assert payload["tab_data"] == raw["payload"]["tab_data"]
    assert payload["shape_events"] == raw["payload"]["shape_events"]
    assert payload["shape_events"]
    assert payload["chordpro"] == get_chordpro.return_value
    assert payload["enrichment"] is None


@pytest.mark.parametrize("fetch_fails", [False, True])
@patch("app.v2.router.songsterr.get_chordpro", new_callable=AsyncMock)
def test_enhance_song_study_succeeds_without_optional_chordpro(
    get_chordpro, fetch_fails, client, session_and_branch,
):
    raw = _create_raw_song_study(client, session_and_branch)
    if fetch_fails:
        get_chordpro.side_effect = RuntimeError("optional source unavailable")
    else:
        get_chordpro.return_value = None
    model = _enrichment_model(
        {
            "start_measure": 1,
            "end_measure": 1,
            "section": "Opening phrase",
            "lyrics": [],
            "broad_harmony": [],
            "detailed_harmony": [],
            "confidence": "low",
        }
    )
    client.app.dependency_overrides[get_enrichment_model_factory] = lambda: (lambda *_args, **_kwargs: model)

    response = client.post(f"/api/v2/song-studies/{raw['id']}/enrichment")

    assert response.status_code == 200
    payload = response.json()["payload"]
    assert payload["chordpro"] is None
    assert payload["enrichment"]["chordpro_fingerprint"] is None
    assert payload["enrichment"]["ranges"][0]["section"] == "Opening phrase"
    assert payload["enrichment"]["ranges"][0]["provenance"] == "ai"
