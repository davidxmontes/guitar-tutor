from app.services.songsterr import (
    TABS_CDN_HOSTS,
    TABS_PART_CDN_HOSTS,
    TABS_STAGE_CDN_HOST,
    _build_tab_candidate_urls,
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
