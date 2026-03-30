"""Service layer for Songsterr API integration.

Proxies requests to Songsterr's search, revision, tab CDN, and ChordPro endpoints.
"""

import gzip
import json
import zlib
from typing import Any

import httpx

from app.models.songsterr import (
    SongsterrChordsResponse,
    SongsterrRecord,
    SongsterrRevisionResponse,
    SongsterrRevisionTrack,
)

SONGSTERR_API = "https://www.songsterr.com/api"
CHORDPRO_CDN = "https://chordpro2.songsterr.com"

# Mirrors Songsterr web client tab CDN routing logic.
TABS_CDN_HOSTS = [
    "dqsljvtekg760",
    "d34shlm8p2ums2",
    "d3cqchs6g3b5ew",
]
TABS_STAGE_CDN_HOST = "d3d3l6a6rcgkaf"
TABS_PART_CDN_HOSTS = [
    "d3rrfvx08uyjp1",
    "dodkcbujl0ebx",
    "dj1usja78sinh",
]


def _decompress(data: bytes) -> str:
    """Decode response data — handles plain text, gzip, and zlib."""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        pass
    try:
        return gzip.decompress(data).decode("utf-8")
    except gzip.BadGzipFile:
        pass
    return zlib.decompress(data).decode("utf-8")


def _extract_search_records(payload: Any) -> list[dict[str, Any]]:
    """Normalize Songsterr search payload into a list of record objects.

    Songsterr has returned both:
      - a raw list of records
      - an object wrapper (e.g. {"records": [...]})
    """
    if isinstance(payload, list):
        if all(isinstance(item, dict) for item in payload):
            return payload
        raise ValueError("Unexpected Songsterr search list format")

    if isinstance(payload, dict):
        for key in ("records", "results", "songs", "data"):
            value = payload.get(key)
            if isinstance(value, list) and all(isinstance(item, dict) for item in value):
                return value

    raise ValueError("Unexpected Songsterr search response format")


def _build_tab_candidate_urls(song_id: int, revision_id: int, image: str | None, track_index: int) -> list[str]:
    candidate_urls: list[str] = []
    if image:
        if image.endswith("-stage"):
            candidate_urls.append(
                f"https://{TABS_STAGE_CDN_HOST}.cloudfront.net/"
                f"{song_id}/{revision_id}/{image}/{track_index}.json"
            )
        candidate_urls.extend(
            f"https://{host}.cloudfront.net/{song_id}/{revision_id}/{image}/{track_index}.json"
            for host in TABS_CDN_HOSTS
        )
    else:
        candidate_urls.extend(
            f"https://{host}.cloudfront.net/part/{revision_id}/{track_index}"
            for host in TABS_PART_CDN_HOSTS
        )
    return candidate_urls


def _extract_first_playable_beat_index(tab_data: dict, measure_index: int) -> int | None:
    """Return the first beat index in a measure that has playable notes."""
    measures = tab_data.get("measures") or []
    if measure_index < 0 or measure_index >= len(measures):
        return None

    measure = measures[measure_index] or {}
    voices = measure.get("voices") or []
    if not voices:
        return None

    # Pick the voice with the most sounding notes.
    best_beats: list[dict] = []
    best_score = -1
    for voice in voices:
        beats = voice.get("beats") or []
        score = 0
        for beat in beats:
            notes = beat.get("notes") or []
            score += sum(1 for n in notes if not n.get("rest") and not n.get("dead"))
        if score > best_score:
            best_score = score
            best_beats = beats

    for idx, beat in enumerate(best_beats):
        notes = beat.get("notes") or []
        if any(not n.get("rest") and not n.get("dead") for n in notes):
            return idx
    return 0 if best_beats else None


async def search_songs(query: str) -> list[SongsterrRecord]:
    """Search Songsterr for songs matching the query."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{SONGSTERR_API}/search", params={"pattern": query})
        resp.raise_for_status()
        records_payload = _extract_search_records(resp.json())
        return [SongsterrRecord.model_validate(r) for r in records_payload]


def search_songs_sync(query: str) -> list[SongsterrRecord]:
    """Synchronous song search for agent-side tool usage."""
    with httpx.Client(timeout=15.0) as client:
        resp = client.get(f"{SONGSTERR_API}/search", params={"pattern": query})
        resp.raise_for_status()
        records_payload = _extract_search_records(resp.json())
        return [SongsterrRecord.model_validate(r) for r in records_payload]


async def get_song_revision(song_id: int) -> SongsterrRevisionResponse:
    """Get the latest revision for a song."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        rev_resp = await client.get(f"{SONGSTERR_API}/meta/{song_id}/revisions")
        rev_resp.raise_for_status()
        revisions = rev_resp.json()
        if not revisions:
            raise ValueError(f"No revisions found for song {song_id}")

        revision_id = revisions[0]["revisionId"]
        resp = await client.get(f"{SONGSTERR_API}/revision/{revision_id}")
        resp.raise_for_status()
        return SongsterrRevisionResponse.model_validate(resp.json())


def get_song_revision_sync(song_id: int) -> SongsterrRevisionResponse:
    """Synchronous latest revision lookup for agent-side tool usage."""
    with httpx.Client(timeout=15.0) as client:
        rev_resp = client.get(f"{SONGSTERR_API}/meta/{song_id}/revisions")
        rev_resp.raise_for_status()
        revisions = rev_resp.json()
        if not revisions:
            raise ValueError(f"No revisions found for song {song_id}")

        revision_id = revisions[0]["revisionId"]
        resp = client.get(f"{SONGSTERR_API}/revision/{revision_id}")
        resp.raise_for_status()
        return SongsterrRevisionResponse.model_validate(resp.json())


async def get_tab_data(
    song_id: int,
    revision_id: int,
    image: str,
    track_index: int,
) -> dict:
    """Fetch and decompress tab JSON from the CDN."""
    candidate_urls = _build_tab_candidate_urls(song_id, revision_id, image, track_index)

    if not candidate_urls:
        raise ValueError("No candidate tab URLs could be built")

    async with httpx.AsyncClient(timeout=15.0) as client:
        last_error: Exception | None = None
        for url in candidate_urls:
            try:
                resp = await client.get(url)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                return json.loads(_decompress(resp.content))
            except Exception as exc:
                last_error = exc
                continue

    attempted = ", ".join(candidate_urls)
    if last_error:
        raise RuntimeError(
            f"All tab CDN candidates failed for song={song_id}, rev={revision_id}, "
            f"track={track_index}. Attempted: {attempted}",
        ) from last_error
    raise RuntimeError(
        f"Tab data not found for song={song_id}, rev={revision_id}, track={track_index}. "
        f"Attempted: {attempted}",
    )


def get_tab_data_sync(
    song_id: int,
    revision_id: int,
    image: str | None,
    track_index: int,
) -> dict:
    """Synchronous tab fetch and decompression for agent-side tool usage."""
    candidate_urls = _build_tab_candidate_urls(song_id, revision_id, image, track_index)

    if not candidate_urls:
        raise ValueError("No candidate tab URLs could be built")

    with httpx.Client(timeout=15.0) as client:
        last_error: Exception | None = None
        for url in candidate_urls:
            try:
                resp = client.get(url)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                return json.loads(_decompress(resp.content))
            except Exception as exc:
                last_error = exc
                continue

    attempted = ", ".join(candidate_urls)
    if last_error:
        raise RuntimeError(
            f"All tab CDN candidates failed for song={song_id}, rev={revision_id}, "
            f"track={track_index}. Attempted: {attempted}",
        ) from last_error
    raise RuntimeError(
        f"Tab data not found for song={song_id}, rev={revision_id}, track={track_index}. "
        f"Attempted: {attempted}",
    )


def resolve_measure_focus_sync(
    song_id: int,
    track_index: int,
    requested_measure_index: int,
) -> tuple[int, int | None]:
    """Resolve a valid (measure_index, beat_index) focus target for a song track."""
    revision = get_song_revision_sync(song_id)
    tab_data = get_tab_data_sync(
        song_id=revision.song_id,
        revision_id=revision.revision_id,
        image=revision.image,
        track_index=track_index,
    )
    measures = tab_data.get("measures") or []
    if not measures:
        return 0, None

    clamped_measure = max(0, min(requested_measure_index, len(measures) - 1))
    beat_index = _extract_first_playable_beat_index(tab_data, clamped_measure)
    return clamped_measure, beat_index


async def get_chordpro(song_id: int) -> str | None:
    """Get ChordPro text (lyrics + chords) for a song. Returns None if unavailable."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{SONGSTERR_API}/chords/{song_id}")
        if resp.status_code != 200:
            return None

        chords = SongsterrChordsResponse.model_validate(resp.json())
        cp_url = (
            f"{CHORDPRO_CDN}/{chords.song_id}"
            f"/{chords.chords_revision_id}/{chords.chordpro}.chordpro"
        )
        cp_resp = await client.get(cp_url)
        if cp_resp.status_code != 200:
            return None

        return _decompress(cp_resp.content)


async def get_lyrics(
    song_id: int,
    revision: SongsterrRevisionResponse,
) -> str | None:
    """Fetch lyrics from the vocal track if available."""
    vocal_idx: int | None = None
    for i, t in enumerate(revision.tracks):
        if isinstance(t, SongsterrRevisionTrack) and t.is_vocal_track:
            vocal_idx = i
            break
    if vocal_idx is None or not revision.image:
        return None

    tab = await get_tab_data(
        revision.song_id, revision.revision_id, revision.image, vocal_idx,
    )
    new_lyrics = tab.get("newLyrics", [])
    if new_lyrics and new_lyrics[0].get("text"):
        return new_lyrics[0]["text"]
    return None
