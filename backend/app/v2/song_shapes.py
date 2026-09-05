"""Deterministic physical chord-like events projected from raw Songsterr tab."""

from typing import Any, Optional

from app.v2.models import SongShapeEvent, SongShapePosition, SongShapeSource


def _displayed_beats(measure: dict[str, Any]) -> list[dict[str, Any]]:
    voices = measure.get("voices") or []
    best: list[dict[str, Any]] = []
    best_score = -1
    for voice in voices:
        beats = voice.get("beats") or []
        score = sum(
            1
            for beat in beats
            for note in beat.get("notes") or []
            if not note.get("rest") and not note.get("dead")
        )
        if score > best_score:
            best = beats
            best_score = score
    return best


def project_song_shapes(
    tab_data: dict[str, Any],
    tuning: Optional[list[int]],
    start_measure_index: int = 0,
    end_measure_index: Optional[int] = None,
) -> list[SongShapeEvent]:
    """Return ordered, playable multi-string events for an inclusive range."""
    if not tuning:
        return []

    measures = tab_data.get("measures") or []
    start = max(0, start_measure_index)
    end = min(len(measures) - 1, end_measure_index if end_measure_index is not None else len(measures) - 1)
    if end < start:
        return []

    events: list[SongShapeEvent] = []
    previous_shape: tuple[tuple[int, int], ...] | None = None
    for measure_index in range(start, end + 1):
        measure = measures[measure_index]
        if not isinstance(measure, dict):
            continue
        for beat_index, beat in enumerate(_displayed_beats(measure)):
            positions = {
                (note["string"] + 1, note["fret"])
                for note in beat.get("notes") or []
                if not note.get("rest")
                and not note.get("dead")
                and isinstance(note.get("string"), int)
                and isinstance(note.get("fret"), int)
                and 0 <= note["string"] < len(tuning)
                and note["fret"] >= 0
            }
            if len({string for string, _fret in positions}) < 2:
                continue

            shape = tuple(sorted(positions))
            source = SongShapeSource(measure_index=measure_index, beat_index=beat_index)
            if events and shape == previous_shape:
                events[-1].sources.append(source)
                continue

            chord = beat.get("chord") or {}
            label = chord.get("text") if isinstance(chord.get("text"), str) else None
            events.append(
                SongShapeEvent(
                    label=label or None,
                    positions=[SongShapePosition(string=string, fret=fret) for string, fret in shape],
                    tuning=list(tuning),
                    sources=[source],
                )
            )
            previous_shape = shape
    return events
