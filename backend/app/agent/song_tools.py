"""Song search, matching, and measure-focus tools for the Guitar Tutor agent."""

import logging
import re
from typing import Any, List, Optional

from app.models.songsterr import SongsterrRecord
from app.services import songsterr

logger = logging.getLogger(__name__)


def normalize_search_text(text: str) -> str:
    lowered = text.lower().strip()
    lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def split_query_title_artist(query: str) -> tuple[str, str]:
    cleaned = normalize_search_text(query)
    if " by " in cleaned:
        title, artist = cleaned.split(" by ", 1)
        return title.strip(), artist.strip()
    return cleaned, ""


def score_song_match(record: SongsterrRecord, query: str) -> int:
    query_norm = normalize_search_text(query)
    title_norm = normalize_search_text(record.title)
    artist_norm = normalize_search_text(record.artist)
    combined = f"{title_norm} {artist_norm}".strip()
    q_title, q_artist = split_query_title_artist(query)

    score = 0

    # Strong exact/near-exact signals first.
    if query_norm == combined:
        score += 120
    if q_title and q_title == title_norm:
        score += 90
    if q_artist and q_artist == artist_norm:
        score += 80
    if q_title and title_norm.startswith(q_title):
        score += 40
    if q_artist and artist_norm.startswith(q_artist):
        score += 35

    # Token overlap fallback.
    q_tokens = set(query_norm.split())
    c_tokens = set(combined.split())
    if q_tokens and c_tokens:
        overlap = len(q_tokens & c_tokens)
        score += overlap * 8
        # Penalize extra unrelated tokens for close-title collisions.
        score -= max(0, len(c_tokens - q_tokens)) * 2

    # Small boost for exact title even if artist differs slightly.
    if q_title and title_norm == q_title:
        score += 15

    return score


def choose_best_song_match(
    records: List[SongsterrRecord], query: str
) -> tuple[Optional[SongsterrRecord], int]:
    if not records:
        return None, 0

    scored = [(record, score_song_match(record, query)) for record in records[:25]]
    scored.sort(key=lambda x: x[1], reverse=True)
    best_record, best_score = scored[0]
    return best_record, best_score


def execute_song_search(search_query: str) -> tuple[list[str], list[dict], int | None, int]:
    """Search Songsterr for a song and auto-select the best match.

    Returns (context_lines, actions, selected_song_id, selected_track_index).
    """
    context_lines: list[str] = []
    actions: list[dict] = []
    selected_song_id: int | None = None
    selected_track_index: int = 0

    try:
        records = songsterr.search_songs_sync(search_query)
        if records:
            actions.append({"type": "song.search", "query": search_query})
            best, score = choose_best_song_match(records, search_query)
            if best and score >= 55:
                actions.append({"type": "song.select", "song_id": best.song_id})
                actions.append({"type": "song.track.select", "track_index": 0})
                selected_song_id = best.song_id
                context_lines.append(
                    f"Song search '{search_query}' matched: {best.artist} - {best.title} "
                    f"(song_id={best.song_id}, score={score})."
                )
            else:
                context_lines.append(
                    f"Song search '{search_query}' returned results but no confident auto-select "
                    f"(best score={score})."
                )
        else:
            context_lines.append(f"Song search '{search_query}' returned no results.")
    except Exception as exc:
        context_lines.append(f"Song search failed for '{search_query}': {exc}")

    return context_lines, actions, selected_song_id, selected_track_index


def resolve_measure_focus(
    song_id: int,
    track_index: int,
    focus_measure_index: int,
) -> tuple[list[str], list[dict]]:
    """Resolve a measure focus request into context lines and actions.

    Returns (context_lines, actions).
    """
    context_lines: list[str] = []
    actions: list[dict] = []

    try:
        resolved_measure, resolved_beat = songsterr.resolve_measure_focus_sync(
            song_id=song_id,
            track_index=track_index,
            requested_measure_index=max(0, focus_measure_index),
        )
        action: dict[str, Any] = {
            "type": "song.measure.focus",
            "measure_index": resolved_measure,
        }
        if resolved_beat is not None:
            action["beat_index"] = resolved_beat
        actions.append(action)
        context_lines.append(
            f"Resolved measure focus for song_id={song_id}, track={track_index}: "
            f"measure_index={resolved_measure}, beat_index={resolved_beat}."
        )
    except Exception as exc:
        context_lines.append(
            f"Could not resolve measure focus for song_id={song_id}, "
            f"track={track_index}: {exc}"
        )

    return context_lines, actions
