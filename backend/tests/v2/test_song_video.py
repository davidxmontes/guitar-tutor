"""Owned recording/alignment saves against real SongStudy routes and storage."""
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.dependencies.auth import get_current_user
from app.v2.router import get_enrichment_model_factory, router
from app.v2.store import InMemoryV2Store, get_v2_store
from tests.v2.tutor_fakes import ScriptedTutorModel


TAB = {"measures": [
    {"header": {"timeSignature": {"numerator": 3, "denominator": 8}}, "voices": [{"beats": [
        {"duration": [1, 8], "notes": [{"string": 0, "fret": 3}]},
        {"duration": [1, 16], "rest": True, "notes": []},
    ]}]},  # A short pickup; do not fill the written meter.
    {"header": {"timeSignature": {"numerator": 6, "denominator": 8}}, "voices": [
        {"beats": [{"duration": [1, 1], "rest": True, "notes": []}]},
        {"beats": [
            {"duration": [1, 3], "notes": [{"string": 1, "fret": 2}]},
            {"duration": [1, 6], "notes": [{"string": 1, "fret": 4}]},
        ]},
    ]},
]}


def anchor(measure=0, beat=0, edge="start", seconds=10):
    return {"measure_index": measure, "beat_index": beat, "edge": edge, "video_seconds": seconds}


def alignment():
    return {"video_id": "M7lc1UVf-VE", "recording_confirmed": True, "passages": [
        {"id": "opening", "label": "Opening", "anchors": [anchor(), anchor(1, 1, "end", 20)]},
    ]}


@pytest.fixture
def song_client():
    store = InMemoryV2Store()
    song = store.create_artifact("owner", "song_study", "Artist - Song", {
        "song_id": 7, "artist": "Artist", "title": "Song",
        "track": {"index": 0, "name": "Guitar", "instrument": "Guitar"},
        "tab_data": deepcopy(TAB), "chordpro": "[C]Raw source",
    }, saved=False)
    app = FastAPI()
    app.include_router(router, prefix="/api/v2")
    app.dependency_overrides[get_current_user] = lambda: "owner"
    app.dependency_overrides[get_v2_store] = lambda: store
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, v2_tutor_provider="openai", openai_api_key="fake")
    with TestClient(app) as client:
        yield client, store, song


def save(client, song, binding):
    return client.put(f"/api/v2/song-studies/{song.id}/video-alignment", json={
        "expected_updated_at": song.updated_at, "video_alignment": binding,
    })


def test_confirmed_recording_save_reopens_in_library_and_history_recovers_removal(song_client):
    client, store, song = song_client
    assert client.get("/api/v2/library").json() == []
    saved = save(client, song, alignment())
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["saved_at"] and body["title"] == "Artist - Song"
    assert body["payload"]["video_alignment"] == alignment()
    assert body["payload"]["tab_data"] == TAB
    assert [item["id"] for item in client.get("/api/v2/library").json()] == [song.id]
    assert client.get(f"/api/v2/song-studies/{song.id}").json() == body
    current = store.get_artifact(song.id, "owner")
    assert save(client, current, alignment()).json()["updated_at"] == current.updated_at

    removed = save(client, current, None)
    assert removed.status_code == 200
    assert removed.json()["payload"]["video_alignment"] is None
    restored = client.post(f"/api/v2/library/{song.id}/restore", json={
        "expected_updated_at": removed.json()["updated_at"], "revision": current.updated_at,
    })
    assert restored.status_code == 200
    assert restored.json()["payload"]["video_alignment"] == alignment()


@pytest.mark.parametrize("passages", [[], [{"id": "later", "label": "Align later", "anchors": []}],
                                     [{"id": "point", "label": "One point", "anchors": [anchor()]}]])
def test_incomplete_alignment_can_be_saved_without_inventing_timing(song_client, passages):
    client, _, song = song_client
    binding = {**alignment(), "passages": passages}
    response = save(client, song, binding)
    assert response.status_code == 200, response.text
    assert response.json()["payload"]["video_alignment"] == binding


def test_repeated_score_passages_and_touching_video_intervals_are_explicit_occurrences(song_client):
    client, _, song = song_client
    binding = alignment()
    binding["passages"].append({"id": "repeat", "label": "Second time", "anchors": [anchor(seconds=20), anchor(1, 1, "end", 31)]})
    response = save(client, song, binding)
    assert response.status_code == 200, response.text
    assert response.json()["payload"]["video_alignment"] == binding


def test_invalid_bindings_cannot_modify_or_promote_song(song_client):
    client, store, song = song_client
    bad_bindings = [
        {**alignment(), "video_id": "https://youtu.be/M7lc1UVf-VE"},
        {**alignment(), "video_id": "M7lc1UVf-VE\n"},
        {**alignment(), "recording_confirmed": False},
        {**alignment(), "recording_confirmed": 1},
        {**alignment(), "passages": [{"id": "x", "label": "  ", "anchors": []}]},
        {**alignment(), "passages": [{"id": "x" * 101, "label": "Name", "anchors": []}]},
        {**alignment(), "passages": [{"id": "x", "label": "x" * 121, "anchors": []}]},
        {**alignment(), "passages": [{"id": str(i), "label": "Name", "anchors": []} for i in range(101)]},
        {**alignment(), "passages": alignment()["passages"] * 2},
    ]
    for binding in bad_bindings:
        assert save(client, song, binding).status_code == 422, binding
    assert store.get_artifact(song.id, "owner") == song
    assert client.get("/api/v2/library").json() == []


@pytest.mark.parametrize("anchors", [
    [anchor(measure=2)], [anchor(beat=2)], [anchor(measure=-1)], [anchor(beat=True)],
    [anchor(edge="middle")], [anchor(seconds=-1)], [anchor(seconds=86401)], [anchor(seconds="12")],
    [anchor(), anchor(1, 1, "end", 10)],  # Video time must advance.
    [anchor(1, 1, "end"), anchor(seconds=20)],  # Score must advance within a passage.
    [anchor(0, 0, "end"), anchor(0, 1, "start", 20)],  # Same score boundary.
    [anchor(0, 1, "end"), anchor(1, 0, "start", 20)],  # No padding of the pickup.
    [anchor()] * 257,
])
def test_invalid_or_nonincreasing_anchors_are_rejected(song_client, anchors):
    client, store, song = song_client
    binding = alignment()
    binding["passages"][0]["anchors"] = anchors
    assert save(client, song, binding).status_code == 422
    assert store.get_artifact(song.id, "owner") == song


@pytest.mark.parametrize("seconds", [float("nan"), float("inf"), -float("inf")])
def test_anchor_model_rejects_nonfinite_video_seconds(seconds):
    from app.v2.song_video import SongVideoAnchor
    with pytest.raises(ValidationError):
        SongVideoAnchor.model_validate(anchor(seconds=seconds))


@pytest.mark.parametrize("second", [
    [anchor(seconds=19), anchor(1, 1, "end", 30)],
    [anchor(seconds=15)],  # A single anchor cannot sit inside another occurrence.
])
def test_overlapping_video_occurrences_are_rejected(song_client, second):
    client, _, song = song_client
    binding = alignment()
    binding["passages"].append({"id": "other", "label": "Other occurrence", "anchors": second})
    assert save(client, song, binding).status_code == 422


@pytest.mark.parametrize("gap", [
    {"voices": []}, {"voices": [{"beats": [{"notes": []}]}]},
    *({"voices": [{"beats": [{"notes": [], "duration": duration}]}]}
      for duration in ([0, 4], [1, 0], [1e-300, 1e300])),
])
def test_unknown_rhythm_blocks_interpolation_but_exact_points_remain_usable(song_client, gap):
    client, store, song = song_client
    tab = deepcopy(TAB)
    tab["measures"].insert(1, gap)
    song = store.update_artifact(song.id, "owner", {**song.payload, "tab_data": tab})
    binding = alignment()
    binding["passages"][0]["anchors"] = [anchor(), anchor(2, 1, "end", 20)]
    assert save(client, song, binding).status_code == 422
    binding["passages"] = [
        {"id": "before", "label": "Before gap", "anchors": [anchor(), anchor(0, 1, "end", 11)]},
        {"id": "after", "label": "After gap", "anchors": [anchor(2, 0, "start", 15), anchor(2, 1, "end", 20)]},
    ]
    if gap["voices"]:
        binding["passages"].insert(1, {"id": "exact", "label": "Exact point only", "anchors": [anchor(1, 0, "end", 12)]})
    response = save(client, song, binding)
    assert response.status_code == 200, response.text


def test_alignment_owner_kind_and_stale_revision_are_checked(song_client):
    client, store, song = song_client
    client.app.dependency_overrides[get_current_user] = lambda: "other"
    assert save(client, song, alignment()).status_code == 404
    client.app.dependency_overrides[get_current_user] = lambda: "owner"
    progression = store.create_artifact("owner", "progression", "Idea", {})
    assert save(client, progression, alignment()).status_code == 404
    newer = store.update_artifact(song.id, "owner", {**song.payload, "chordpro": "[D]Changed source"})
    assert save(client, song, alignment()).status_code == 409
    assert store.get_artifact(song.id, "owner") == newer


def test_alignment_save_does_not_overwrite_a_concurrent_range_edit(song_client, monkeypatch):
    client, store, song = song_client
    original = store.update_artifact
    ranges = [{"label": "Keep this", "start_measure": 1, "end_measure": 1}]

    def intervening_edit(artifact_id, user_id, payload, expected_updated_at=None, **kwargs):
        original(artifact_id, user_id, {**song.payload, "saved_ranges": ranges}, song.updated_at)
        return original(artifact_id, user_id, payload, expected_updated_at, **kwargs)

    monkeypatch.setattr(store, "update_artifact", intervening_edit)
    assert save(client, song, alignment()).status_code == 409
    assert store.get_artifact(song.id, "owner").payload["saved_ranges"] == ranges
    assert store.get_artifact(song.id, "owner").saved_at is None


def test_range_and_enrichment_updates_preserve_saved_video_alignment(song_client, monkeypatch):
    client, _, song = song_client
    saved = save(client, song, alignment())
    assert saved.status_code == 200
    ranged = client.put(f"/api/v2/song-studies/{song.id}/ranges", json={
        "expected_updated_at": saved.json()["updated_at"], "ranges": [{"label": "Pickup", "start_measure": 1, "end_measure": 1}],
    })
    assert ranged.status_code == 200
    assert ranged.json()["payload"]["video_alignment"] == alignment()
    monkeypatch.setattr("app.v2.router.songsterr.get_chordpro", AsyncMock(return_value=None))
    client.app.dependency_overrides[get_enrichment_model_factory] = lambda: (
        lambda *a, **kw: ScriptedTutorModel(outcomes=[{"ranges": []}]))
    enriched = client.post(f"/api/v2/song-studies/{song.id}/enrichment")
    assert enriched.status_code == 200
    assert enriched.json()["payload"]["video_alignment"] == alignment()
    removed = client.delete(f"/api/v2/song-studies/{song.id}/enrichment")
    assert removed.status_code == 200
    assert removed.json()["payload"]["video_alignment"] == alignment()
