from app.services.songsterr import (
    TABS_CDN_HOSTS,
    TABS_PART_CDN_HOSTS,
    TABS_STAGE_CDN_HOST,
    _build_tab_candidate_urls,
    _extract_first_playable_beat_index,
    _extract_search_records,
)


def test_extract_search_records_from_list():
    payload = [{"songId": 1, "title": "Test"}]
    records = _extract_search_records(payload)
    assert records == payload


def test_extract_search_records_from_records_wrapper():
    payload = {"records": [{"songId": 1, "title": "Test"}], "total": 1}
    records = _extract_search_records(payload)
    assert records == payload["records"]


def test_extract_search_records_from_results_wrapper():
    payload = {"results": [{"songId": 1, "title": "Test"}]}
    records = _extract_search_records(payload)
    assert records == payload["results"]


def test_extract_search_records_raises_for_invalid_shape():
    payload = {"records": "not-a-list"}
    try:
        _extract_search_records(payload)
    except ValueError as exc:
        assert "Unexpected Songsterr search response format" in str(exc)
    else:
        assert False, "Expected ValueError for invalid search payload"


def test_build_tab_candidate_urls_stage_image_uses_stage_host_first():
    urls = _build_tab_candidate_urls(
        song_id=1,
        revision_id=2,
        image="v0-foo-stage",
        track_index=3,
    )
    assert urls[0] == f"https://{TABS_STAGE_CDN_HOST}.cloudfront.net/1/2/v0-foo-stage/3.json"
    assert any(f"https://{host}.cloudfront.net/1/2/v0-foo-stage/3.json" in urls for host in TABS_CDN_HOSTS)


def test_build_tab_candidate_urls_non_stage_image_uses_regular_hosts():
    urls = _build_tab_candidate_urls(
        song_id=1,
        revision_id=2,
        image="v0-foo",
        track_index=3,
    )
    assert all(url.endswith("/1/2/v0-foo/3.json") for url in urls)
    assert len(urls) == len(TABS_CDN_HOSTS)


def test_build_tab_candidate_urls_without_image_uses_part_hosts():
    urls = _build_tab_candidate_urls(
        song_id=1,
        revision_id=2,
        image=None,
        track_index=3,
    )
    assert urls == [f"https://{host}.cloudfront.net/part/2/3" for host in TABS_PART_CDN_HOSTS]


def test_extract_first_playable_beat_index_prefers_sounding_notes():
    tab_data = {
        "measures": [
            {
                "voices": [
                    {
                        "beats": [
                            {"notes": [{"rest": True}]},
                            {"notes": [{"string": 0, "fret": 3}]},
                        ]
                    }
                ]
            }
        ]
    }

    assert _extract_first_playable_beat_index(tab_data, 0) == 1


def test_extract_first_playable_beat_index_returns_zero_for_all_rests():
    tab_data = {
        "measures": [
            {
                "voices": [
                    {
                        "beats": [
                            {"notes": [{"rest": True}]},
                            {"notes": [{"dead": True}]},
                        ]
                    }
                ]
            }
        ]
    }

    assert _extract_first_playable_beat_index(tab_data, 0) == 0



def test_revision_lookup_skips_rejected_and_unpublished_edits(monkeypatch):
    import asyncio
    import httpx
    from app.services import songsterr

    # Rejected one-track edit precedes the accepted arrangement shown by search.
    revisions = [
        {"revisionId": 8361295, "tracksCount": 1, "isBlocked": True},
        {"revisionId": 8336755, "isDeleted": True},
        {"revisionId": 8235342, "isOnModeration": True},
        {"revisionId": 8047059, "tracksCount": 14, "isBlocked": False},
    ]
    urls = []
    def respond(request):
        urls.append(request.url.path)
        if request.url.path.endswith('/revisions'):
            return httpx.Response(200, json=revisions)
        assert request.url.path == '/api/revision/8047059'
        return httpx.Response(200, json={
            "songId": 2, "revisionId": 8047059, "artist": "Oasis", "title": "Wonderwall",
            "tracks": [{"instrumentId": 25, "instrument": "Acoustic Guitar"}] * 14,
            "videos": [{"videoId": "qNHcVevz7wo", "status": "done", "feature": "alternative"}],
        })
    sync_client, async_client = httpx.Client, httpx.AsyncClient
    transport = httpx.MockTransport(respond)
    monkeypatch.setattr(httpx, 'Client', lambda **kw: sync_client(transport=transport, **kw))
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kw: async_client(transport=transport, **kw))
    for result in (songsterr.get_song_revision_sync(2), asyncio.run(songsterr.get_song_revision(2))):
        assert result.revision_id == 8047059
        assert len(result.tracks) == 14
        assert result.videos[0]['videoId'] == 'qNHcVevz7wo'
    assert urls == ['/api/meta/2/revisions', '/api/revision/8047059'] * 2


def test_revision_selection_does_not_fall_back_to_rejected_edits():
    import pytest
    from app.services.songsterr import _latest_available_revision_id

    for revisions in ([], [{"revisionId": 1, "isBlocked": True}]):
        with pytest.raises(ValueError, match='No available revisions'):
            _latest_available_revision_id(revisions, 2)
    assert _latest_available_revision_id([{"revisionId": 3}], 2) == 3
