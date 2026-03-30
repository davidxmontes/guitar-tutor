"""Load and adapt chords-db guitar voicings into app chord voicing schema."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.music.chords import (
    CHORD_INTERVALS,
    STANDARD_TUNING,
    _get_quality_suffix,
    get_note_at_position,
    note_to_index,
)

DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "chords_db.json"

QUALITY_TO_SUFFIX = {
    "major": "major",
    "minor": "minor",
    "diminished": "dim",
    "augmented": "aug",
    "dominant7": "7",
    "major7": "maj7",
    "minor7": "m7",
    "dim7": "dim7",
    "m7b5": "m7b5",
    "sus2": "sus2",
    "sus4": "sus4",
    "add9": "add9",
    "7sus4": "7sus4",
    "6": "6",
    "m6": "m6",
    "9": "9",
    "m9": "m9",
    "maj9": "maj9",
    "madd9": "madd9",
}

ROOT_TO_DB_KEY = {
    "C": "C",
    "C#": "Csharp",
    "Db": "Csharp",
    "D": "D",
    "D#": "Eb",
    "Eb": "Eb",
    "E": "E",
    "F": "F",
    "F#": "Fsharp",
    "Gb": "Fsharp",
    "G": "G",
    "G#": "Ab",
    "Ab": "Ab",
    "A": "A",
    "A#": "Bb",
    "Bb": "Bb",
    "B": "B",
}


def _load_chord_index() -> dict[tuple[str, str], dict[str, Any]]:
    data = json.loads(DATA_PATH.read_text())
    index: dict[tuple[str, str], dict[str, Any]] = {}

    for db_key, chord_entries in data["chords"].items():
        for entry in chord_entries:
            index[(db_key, entry["suffix"])] = entry

    return index


_CHORD_INDEX = _load_chord_index()


def _interval_name_map(quality: str) -> dict[int, str]:
    chord_data = CHORD_INTERVALS[quality]
    return {
        semitones % 12: name
        for semitones, name in zip(chord_data["intervals"], chord_data["names"])
    }


def _lookup_entry(root: str, quality: str) -> dict[str, Any] | None:
    suffix = QUALITY_TO_SUFFIX.get(quality)
    if suffix is None:
        return None

    db_key = ROOT_TO_DB_KEY.get(root)
    if db_key is None:
        return None

    return _CHORD_INDEX.get((db_key, suffix))


def has_chord(root: str, quality: str) -> bool:
    """Return True when a chord exists in chords-db for the requested root/quality."""
    return _lookup_entry(root, quality) is not None


def get_voicing_positions(
    root: str,
    quality: str,
    max_fret: int = 22,
    tuning: dict[int, int] | None = None,
) -> list[dict[str, Any]] | None:
    """
    Get voicings for a chord from chords-db converted to app format.

    Returns None when the chord is not available in chords-db.
    """
    entry = _lookup_entry(root, quality)
    if entry is None:
        return None

    effective_tuning = tuning or STANDARD_TUNING
    # Per-string semitone offset: positive means target string is lower → fret must increase
    string_offsets = {
        s: STANDARD_TUNING[s] - effective_tuning[s] for s in range(1, 7)
    }
    is_transposed = any(v != 0 for v in string_offsets.values())

    root_index = note_to_index(root)
    interval_map = _interval_name_map(quality)
    quality_suffix = _get_quality_suffix(quality)

    voicings: list[dict[str, Any]] = []

    for position_index, db_position in enumerate(entry["positions"], start=1):
        base_fret = int(db_position["baseFret"])
        positions: list[dict[str, Any]] = []
        voicing_valid = True

        # chords-db frets are ordered low-E to high-E. App strings are 1=high-E, 6=low-E.
        for db_string_index, fret_value in enumerate(db_position["frets"]):
            if fret_value == -1:
                continue

            string_number = 6 - db_string_index
            if fret_value == 0:
                actual_fret = 0
            else:
                actual_fret = base_fret + fret_value - 1

            # Transpose for non-standard tuning
            if is_transposed:
                actual_fret = actual_fret + string_offsets[string_number]
                if actual_fret < 0:
                    voicing_valid = False
                    break

            note_name = get_note_at_position(string_number, actual_fret, effective_tuning)
            semitone_distance = (note_to_index(note_name) - root_index) % 12
            interval_name = interval_map.get(semitone_distance)

            if interval_name is None:
                if is_transposed:
                    voicing_valid = False
                    break
                continue

            positions.append(
                {
                    "string": string_number,
                    "fret": actual_fret,
                    "note": note_name,
                    "interval": interval_name,
                    "is_root": semitone_distance == 0,
                }
            )

        if not voicing_valid or not positions:
            continue

        replicated_positions = list(positions)
        seen_positions = {(p["string"], p["fret"]) for p in positions}

        # Replicate each shape 12 frets higher when it stays on the visible fretboard.
        for pos in positions:
            octave_fret = pos["fret"] + 12
            if octave_fret > max_fret:
                continue

            key = (pos["string"], octave_fret)
            if key in seen_positions:
                continue

            replicated_positions.append(
                {
                    "string": pos["string"],
                    "fret": octave_fret,
                    "note": get_note_at_position(pos["string"], octave_fret, effective_tuning),
                    "interval": pos["interval"],
                    "is_root": pos["is_root"],
                }
            )
            seen_positions.add(key)

        replicated_positions.sort(key=lambda p: (p["string"], p["fret"]))
        played_frets = [p["fret"] for p in replicated_positions]
        transposed_base = base_fret + string_offsets.get(6, 0) if is_transposed else base_fret
        voicing_label = f"Pos {position_index}"
        voicings.append(
            {
                "label": voicing_label,
                "name": f"{root}{quality_suffix} ({voicing_label})",
                "color": "accent",
                "base_fret": max(transposed_base, 1),
                "min_fret": min(played_frets),
                "max_fret": max(played_frets),
                "positions": replicated_positions,
            }
        )

    return voicings or None
