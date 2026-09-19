"""Owned read-only discovery through real revision parsing and oEmbed transport."""
from copy import deepcopy

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.v2.router import router
from app.v2.song_video_discovery import estimate_score_duration
from app.v2.store import InMemoryV2Store, get_v2_store


@pytest.fixture
def discovery(monkeypatch):
    store = InMemoryV2Store()
    song = store.create_artifact("owner", "song_study", "Artist - Song", {
        "song_id": 7, "artist": "Artist", "title": "Song",
        "track": {"index": 0, "name": "Guitar", "instrument": "Guitar"}, "tab_data": {},
    }, saved=False)
    videos, metadata, requests = [], {}, []

    def respond(request):
        requests.append(request)
        if request.url.path == "/api/meta/7/revisions":
            return httpx.Response(200, json=[{"revisionId": 3, "isBlocked": True}, {"revisionId": 2}])
        if request.url.path == "/api/revision/2":
            return httpx.Response(200, json={"revisionId": 2, "songId": 7, "artist": "Artist", "title": "Song", "tracks": [], "videos": videos})
        assert request.url.host == "www.youtube.com" and request.url.path == "/oembed"
        video_id = request.url.params["url"].split("v=")[1]
        result = metadata.get(video_id, {"title": "Artist - Song", "author_name": "Artist", "html": "<script>ignore</script>"})
        if isinstance(result, Exception):
            raise result
        return httpx.Response(result if isinstance(result, int) else 200, json={} if isinstance(result, int) else result)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs))
    app = FastAPI()
    app.include_router(router, prefix="/api/v2")
    app.dependency_overrides[get_current_user] = lambda: "owner"
    app.dependency_overrides[get_v2_store] = lambda: store
    with TestClient(app) as client:
        yield client, store, song, videos, metadata, requests


def entry(index, feature="musicvideo", status="done"):
    return {"videoId": f"video{index:06}", "feature": feature, "status": status}


def get(discovery):
    return discovery[0].get(f"/api/v2/song-studies/{discovery[2].id}/video-suggestions")


def test_rank_validate_dedupe_without_saving(discovery):
    _, store, song, videos, metadata, requests = discovery
    videos.extend([entry(0, "solo"), entry(1, "backing"), entry(2, "alternative"), entry(3), entry(4),
                   entry(3, "solo"), entry(5, status="processing"), {"status": "done", "videoId": "https://evil.test/"}])
    metadata["video000004"] = {"title": "Artist - Song (Live cover)", "author_name": "Another player"}
    response = get(discovery)
    assert response.status_code == 200, response.text
    candidates = response.json()["candidates"]
    assert [v["video_id"] for v in candidates] == ["video000003", "video000002", "video000004", "video000001", "video000000"]
    assert "cover, live" in candidates[2]["match_note"]
    assert "may omit" in candidates[-1]["match_note"]
    assert "html" not in response.text
    assert len(requests) == 7
    assert store.get_artifact(song.id, "owner") == song


@pytest.mark.parametrize("video_title", ["Artist - Song 8D", "Artist - Song slowed", "Artist - Song sped up", "Unrelated artist and title"])
def test_plain_matching_alternative_outranks_mismatched_musicvideo(discovery, video_title):
    discovery[3].extend([entry(0), entry(1, "alternative")])
    discovery[4]["video000000"] = {"title": video_title, "author_name": "Someone else"}
    candidates = get(discovery).json()["candidates"]
    assert candidates[0]["video_id"] == "video000001"
    assert candidates[0]["match_note"] == "Artist and title match."
    assert "alternate version" in candidates[1]["match_note"] or "Check artist" in candidates[1]["match_note"]


def test_metadata_failures_degrade_and_unavailable_links_are_skipped(discovery):
    *_, videos, metadata, requests = discovery
    videos.extend(entry(i) for i in range(6))
    metadata.update({"video000000": 404, "video000001": 401, "video000002": 503,
                     "video000003": httpx.ReadTimeout("private error"), "video000004": ["malformed"]})
    response = get(discovery)
    candidates = response.json()["candidates"]
    assert len(candidates) == 4 and candidates[0]["video_id"] == "video000005"
    assert all("unavailable" in c["match_note"] for c in candidates[1:])
    assert "private error" not in response.text


def test_bounded_calls_and_results(discovery):
    discovery[3].extend(entry(i) for i in range(100))
    assert len(get(discovery).json()["candidates"]) == 6
    assert len(discovery[-1]) == 10


def test_empty_links_and_foreign_ownership(discovery):
    client, store, _, _, _, requests = discovery
    assert get(discovery).json()["candidates"] == []
    requests.clear()
    foreign = store.create_artifact("someone-else", "song_study", "Private", {}, saved=False)
    assert client.get(f"/api/v2/song-studies/{foreign.id}/video-suggestions").status_code == 404
    assert requests == []


def test_malformed_kind_and_revision(discovery):
    discovery[3].append({"videoId": "video000000", "status": "done", "feature": []})
    assert get(discovery).json()["candidates"][0]["kind"] == "other"
    discovery[3].append(None)
    response = get(discovery)
    assert response.status_code == 200
    assert response.json()["candidates"][0]["video_id"] == "video000000"


def test_live_in_song_title_is_not_an_alternate_version(discovery):
    _, store, song, videos, metadata, _ = discovery
    store.update_artifact(song.id, "owner", {**song.payload, "title": "Live"}, song.updated_at)
    videos.append(entry(0))
    metadata["video000000"] = {"title": "Artist - Live", "author_name": "Artist"}
    assert "alternate version" not in get(discovery).text


TAB = {"automations": {"tempo": [{"type": 4, "position": 0, "measure": 0, "bpm": 88}]},
       "measures": [{"signature": [4, 4], "voices": [{"beats": [{"duration": [1, 1], "rest": True}]}]}]}


def test_real_constant_tempo_shape_and_pickup_rests_meter_change():
    assert estimate_score_duration(TAB)[0] == round(240 / 88, 2)
    tab = deepcopy(TAB)
    tab["measures"][0]["voices"][0]["beats"] = [{"duration": [1, 8], "rest": True}]
    tab["measures"].append({"signature": [3, 8], "voices": [{"beats": [{"duration": [3, 8]}]}]})
    tab["automations"]["tempo"].append({"type": 4, "position": 0, "measure": 1, "bpm": 120})
    assert estimate_score_duration(tab)[0] == round(.5 * 60 / 88 + 1.5 * 60 / 120, 2)


@pytest.mark.parametrize("change", [
    lambda tab: tab.pop("automations"),
    lambda tab: tab["automations"]["tempo"][0].update(type=5),
    lambda tab: tab["measures"][0].update(voices=[None]),
    lambda tab: tab["automations"]["tempo"][0].update(position=.5),
    lambda tab: tab["automations"]["tempo"][0].update(bpm=0),
    lambda tab: tab["automations"]["tempo"][0].update(measure=1),
    lambda tab: tab["measures"][0].update(repeatClose=2),
    lambda tab: tab["measures"][0].update(header={"isRepeatOpen": True}),
    lambda tab: tab["measures"][0].update(jump="DaCapo"),
    lambda tab: tab["measures"][0]["voices"][0]["beats"][0].pop("duration"),
    lambda tab: tab["measures"][0]["voices"][0].update(beats=[]),
])
def test_uncertain_score_duration_stays_unknown(change):
    tab = deepcopy(TAB)
    change(tab)
    seconds, note = estimate_score_duration(tab)
    assert seconds is None and "unavailable" in note
