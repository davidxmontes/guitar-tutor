"""Suggest source-linked recordings; metadata is a clue, never an alignment."""
import asyncio
import re
from math import isfinite
from typing import Literal

import httpx
from pydantic import BaseModel

from app.services import songsterr
from app.v2.models import SongStudyPayload
from app.v2.song_video import _beat_duration
from app.v2.song_shapes import _displayed_beats


class VideoSuggestion(BaseModel):
    video_id: str
    title: str
    channel: str | None
    kind: Literal["musicvideo", "alternative", "backing", "solo", "other"]
    match_note: str


class VideoSuggestions(BaseModel):
    candidates: list[VideoSuggestion]
    score_duration_seconds: float | None
    duration_note: str


def estimate_score_duration(tab: dict) -> tuple[float | None, str]:
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
    for index, measure in enumerate(measures):
        if not isinstance(measure, dict):
            return None, unavailable + "the score has incomplete rhythm."
        # ponytail: written order only; expand repeats/jumps before estimating performed duration.
        header = measure.get("header")
        containers = [tab, measure, header if isinstance(header, dict) else {}]
        if any(value and any(word in key.casefold() for word in ("repeat", "jump", "coda", "segno", "alternateending", "direction"))
               for container in containers for key, value in container.items()):
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
    if not isfinite(seconds):
        return None, unavailable + "the score timing is invalid."
    return round(seconds, 2), "Estimated written score length from rhythm and tempo; matching length does not verify the recording or arrangement."


KINDS = {"musicvideo": 0, "alternative": 1, "other": 2, "backing": 3, "solo": 4}
VERSION_WORDS = {"live", "cover", "tutorial", "karaoke", "remix", "acoustic", "instrumental"}


def _words(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.casefold()))


async def suggest_song_videos(payload: SongStudyPayload) -> VideoSuggestions:
    revision = await songsterr.get_song_revision(payload.song_id)
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
            return KINDS[kind], 1, 0, VideoSuggestion(
                video_id=video_id, title=f"{payload.artist} — {payload.title}", channel=None,
                kind=kind, match_note="Linked by Songsterr; YouTube title unavailable. Preview to check availability and arrangement.",
            )
        video_title = metadata["title"][:500]
        channel = metadata.get("author_name")
        channel = channel[:200] if isinstance(channel, str) else None
        title_words = _words(video_title)
        match_words = title_words | _words(channel or "")
        matching = int(bool(artist) and artist <= match_words) + int(bool(title) and title <= title_words)
        versions = sorted((title_words & VERSION_WORDS) - (title | artist))
        note = "Linked by Songsterr. "
        note += "Artist and title match. " if matching == 2 else "Check the artist and title. "
        if kind in ("backing", "solo"):
            note += f"Marked as {kind}; may omit parts of the full recording. "
        if versions:
            note += f"Possible alternate version: {', '.join(versions)}. "
        note += "Confirm the recording and arrangement by listening."
        return KINDS[kind], int(bool(versions)), -matching, VideoSuggestion(
            video_id=video_id, title=video_title, channel=channel, kind=kind, match_note=note,
        )

    async with httpx.AsyncClient(timeout=5.0) as client:
        inspected = await asyncio.gather(*(inspect(client, video_id, kind) for video_id, kind in shortlist))
    ranked = sorted((item for item in inspected if item is not None), key=lambda item: item[:3])
    duration, note = estimate_score_duration(payload.tab_data)
    return VideoSuggestions(candidates=[item[3] for item in ranked[:6]], score_duration_seconds=duration, duration_note=note)
