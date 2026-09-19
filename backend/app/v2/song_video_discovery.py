"""Suggest source-linked recordings; metadata is a clue, never an alignment."""
import asyncio
import re
from math import isfinite
from typing import Literal

import httpx
from pydantic import BaseModel

from app.services import songsterr
from app.models.songsterr import SongsterrRevisionResponse
from app.v2.models import SongStudyPayload
from app.v2.song_video import _beat_duration, SongVideoAnchor, SongVideoPassage
from app.v2.song_shapes import _displayed_beats


class SuggestedVideoTiming(BaseModel):
    source: Literal["songsterr", "estimated"]
    passages: list[SongVideoPassage]
    note: str


class VideoSuggestion(BaseModel):
    video_id: str
    title: str
    channel: str | None
    kind: Literal["musicvideo", "alternative", "backing", "solo", "other"]
    match_note: str
    timing: SuggestedVideoTiming | None = None


class VideoSuggestions(BaseModel):
    candidates: list[VideoSuggestion]
    score_duration_seconds: float | None
    duration_note: str
    estimated_timing: SuggestedVideoTiming | None = None


def _has_navigation(tab: dict, measure: dict) -> bool:
    header = measure.get("header")
    return any(value and any(word in key.casefold() for word in ("repeat", "jump", "coda", "segno", "alternateending", "direction"))
               for container in (tab, measure, header if isinstance(header, dict) else {}) for key, value in container.items())


def _score_measure_times(tab: dict) -> tuple[list[float] | None, str]:
    unavailable = "Score duration unavailable: "
    measures = tab.get("measures")
    automations = tab.get("automations")
    tempos = automations.get("tempo") if isinstance(automations, dict) else None
    if not isinstance(measures, list) or not measures or not isinstance(tempos, list) or not tempos:
        return None, unavailable + "complete rhythm and an explicit starting tempo are required."
    changes = {}
    for tempo in tempos:
        if not isinstance(tempo, dict):
            return None, unavailable + "tempo timing is unsupported."
        index, bpm = tempo.get("measure"), tempo.get("bpm")
        if (tempo.get("type") != 4 or type(index) is not int or not 0 <= index < len(measures) or index in changes
                or type(tempo.get("position")) not in (int, float) or tempo["position"] != 0
                or type(bpm) not in (int, float) or not isfinite(bpm) or bpm <= 0):
            return None, unavailable + "only explicit tempo changes at measure starts are supported."
        changes[index] = bpm
    if 0 not in changes:
        return None, unavailable + "the starting tempo is missing."
    seconds, bpm = 0.0, changes[0]
    times = [seconds]
    for index, measure in enumerate(measures):
        if not isinstance(measure, dict):
            return None, unavailable + "the score has incomplete rhythm."
        # ponytail: written order only; expand repeats/jumps before estimating performed duration.
        if _has_navigation(tab, measure):
            return None, unavailable + "repeat or jump playback order is unsupported."
        try:
            beats = _displayed_beats(measure)
            durations = [_beat_duration(beat) for beat in beats]
        except (TypeError, AttributeError):
            return None, unavailable + "the score has incomplete rhythm."
        if not durations or any(duration is None for duration in durations):
            return None, unavailable + "the score has incomplete rhythm."
        bpm = changes.get(index, bpm)
        seconds += sum(float(duration) for duration in durations) * 60 / bpm
        times.append(seconds)
    if not isfinite(seconds):
        return None, unavailable + "the score timing is invalid."
    return times, "Estimated written score length from rhythm and tempo; matching length does not verify the recording or arrangement."


def estimate_score_duration(tab: dict) -> tuple[float | None, str]:
    times, note = _score_measure_times(tab)
    return (round(times[-1], 2) if times else None), note


def _timing_passages(tab: dict, times: list[float]) -> list[SongVideoPassage]:
    measures = tab["measures"]
    anchors = [SongVideoAnchor(measure_index=index, beat_index=0, edge="start", video_seconds=seconds)
               for index, seconds in enumerate(times[:len(measures)]) if seconds >= 0]
    if len(times) == len(measures) + 1:
        anchors.append(SongVideoAnchor(measure_index=len(measures) - 1,
                                      beat_index=len(_displayed_beats(measures[-1])) - 1,
                                      edge="end", video_seconds=times[-1]))
    # ponytail: keep long scores partially aligned rather than invent repeat occurrences.
    return [SongVideoPassage(id="recording", label="Recording", anchors=anchors[:256])] if len(anchors) >= 2 else []


def provider_video_timing(payload: SongStudyPayload, video_id: str, entry: dict) -> SuggestedVideoTiming | None:
    tab = payload.tab_data
    revision_id = tab.get("revisionId")
    if (type(revision_id) is not int or revision_id <= 0 or tab.get("songId") != payload.song_id
            or type(entry.get("songId")) is not int or type(entry.get("revisionId")) is not int
            or entry.get("videoId") != video_id or entry.get("songId") != payload.song_id or entry.get("revisionId") != revision_id
            or entry.get("status") != "done" or (entry.get("isSyncVerified") is not None and entry.get("isSyncVerified") is not True)
            or any(entry.get(key) for key in ("pointsUncertain", "pointsSuspicious", "problematic", "tracks", "trackHashes"))):
        return None
    points, measures = entry.get("points"), tab.get("measures")
    if not isinstance(measures, list) or not isinstance(points, list) or not 2 <= len(points) <= len(measures):
        return None
    if any(type(value) not in (int, float) or not isfinite(value) or value > 86400 for value in points):
        return None
    if any(a >= b for a, b in zip(points, points[1:])) or sum(value >= 0 for value in points) < 2:
        return None
    # Songsterr indexes points by expanded progression, not necessarily written bars.
    # Until repeat expansion is represented here, only straight written order is safe.
    for measure in measures:
        if not isinstance(measure, dict):
            return None
        if _has_navigation(tab, measure):
            return None
    try:
        if any(not (beats := _displayed_beats(measure)) or any(_beat_duration(beat) is None for beat in beats)
               for measure in measures[:len(points)]):
            return None
    except (TypeError, AttributeError):
        return None
    return SuggestedVideoTiming(source="songsterr", passages=_timing_passages(tab, points),
                                note="Timing supplied by Songsterr for this score revision. Sections beyond its anchors stay unaligned; adjust if needed.")


def estimated_video_timing(tab: dict) -> SuggestedVideoTiming | None:
    times, _ = _score_measure_times(tab)
    if not times or times[-1] > 86400:
        return None
    return SuggestedVideoTiming(source="estimated", passages=_timing_passages(tab, times),
                                note="Initially estimated from score tempo at 0:00. Adjust the timing to match this recording."
                                + (" Only the first 255 measures are mapped; later sections stay unaligned." if len(times) > 256 else ""))


KINDS = {"musicvideo": 0, "alternative": 1, "other": 2, "backing": 3, "solo": 4}
VERSION_WORDS = {"live", "cover", "tutorial", "karaoke", "remix", "acoustic", "instrumental", "8d", "slowed", "sped"}


def _words(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.casefold()))


async def suggest_song_videos(payload: SongStudyPayload) -> VideoSuggestions:
    revision_id = payload.tab_data.get("revisionId")
    pinned = type(revision_id) is int and revision_id > 0 and payload.tab_data.get("songId") == payload.song_id
    if pinned:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{songsterr.SONGSTERR_API}/revision/{revision_id}")
            response.raise_for_status()
            revision = SongsterrRevisionResponse.model_validate(response.json())
        if revision.song_id != payload.song_id or revision.revision_id != revision_id:
            raise ValueError("Recording revision does not match the imported score")
    else:
        revision = await songsterr.get_song_revision(payload.song_id)
    fallback = estimated_video_timing(payload.tab_data)
    linked: dict[str, str] = {}
    for entry in revision.videos:
        video_id = entry.get("videoId")
        if entry.get("status") != "done" or not isinstance(video_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            continue
        kind = entry.get("feature")
        kind = kind if isinstance(kind, str) and kind in KINDS else "other"
        if video_id not in linked or KINDS[kind] < KINDS[linked[video_id]]:
            linked[video_id] = kind
    # ponytail: inspect eight source links at most; paginate only if real songs need more.
    shortlist = sorted(linked.items(), key=lambda item: KINDS[item[1]])[:8]
    artist, title = _words(payload.artist), _words(payload.title)

    async def inspect(client: httpx.AsyncClient, video_id: str, kind: str):
        metadata = None
        try:
            response = await client.get("https://www.youtube.com/oembed", params={
                "url": f"https://www.youtube.com/watch?v={video_id}", "format": "json",
            })
            if response.status_code in (401, 404):
                return None
            response.raise_for_status()
            data = response.json()
            if isinstance(data, dict) and isinstance(data.get("title"), str) and data["title"].strip():
                metadata = data
        except (httpx.HTTPError, ValueError):
            pass
        if metadata is None:
            return 1, KINDS[kind], 0, VideoSuggestion(
                video_id=video_id, title=f"{payload.artist} — {payload.title}", channel=None,
                kind=kind, match_note="Title unavailable. Preview to check.", timing=fallback,
            )
        video_title = metadata["title"][:500]
        channel = metadata.get("author_name")
        channel = channel[:200] if isinstance(channel, str) else None
        title_words = _words(video_title)
        match_words = title_words | _words(channel or "")
        matching = int(bool(artist) and artist <= match_words) + int(bool(title) and title <= title_words)
        versions = sorted((title_words & VERSION_WORDS) - (title | artist))
        note = "Artist and title match. " if matching == 2 else "Check artist and title. "
        if kind in ("backing", "solo"):
            note += f"Marked as {kind}; may omit parts of the full recording. "
        if versions:
            note += f"Possible alternate version: {', '.join(versions)}. "
        mismatch = bool(versions) or matching != 2 or kind in ("backing", "solo")
        return int(mismatch), KINDS[kind], -matching, VideoSuggestion(
            video_id=video_id, title=video_title, channel=channel, kind=kind, match_note=note.strip(), timing=fallback,
        )

    async with httpx.AsyncClient(timeout=5.0) as client:
        provider_entries = []
        if pinned:
            try:
                response = await client.get(f"{songsterr.SONGSTERR_API}/video-points/{payload.song_id}/{revision_id}/list")
                response.raise_for_status()
                data = response.json()
                if isinstance(data, list):
                    provider_entries = [entry for entry in data if isinstance(entry, dict)]
            except (httpx.HTTPError, ValueError):
                pass
        inspected = await asyncio.gather(*(inspect(client, video_id, kind) for video_id, kind in shortlist))
    ranked = sorted((item for item in inspected if item is not None), key=lambda item: item[:3])
    for item in ranked[:6]:
        candidate = item[3]
        entries = [entry for entry in provider_entries if entry.get("videoId") == candidate.video_id]
        # Conflicting duplicate mappings are not resolved arbitrarily.
        if len(entries) == 1:
            candidate.timing = provider_video_timing(payload, candidate.video_id, entries[0]) or fallback
    duration, note = estimate_score_duration(payload.tab_data)
    return VideoSuggestions(candidates=[item[3] for item in ranked[:6]], score_duration_seconds=duration, duration_note=note, estimated_timing=fallback)
