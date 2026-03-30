"""Service layer for chord lookups and voicing assembly."""

from app.models.music import ChordResponse, ChordVoicing, ChordVoicingPosition
from app.music.chords import (
    CHORD_INTERVALS,
    _get_quality_suffix,
    get_chord_notes,
)
from app.music.chords_db import get_voicing_positions
from app.music.tunings import get_tuning_notes, notes_to_semitone_map

VALID_ROOTS = [
    "C", "C#", "Db", "D", "D#", "Eb", "E", "F",
    "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
]


def _resolve_tuning_map(
    tuning: str = "standard",
    tuning_notes: str | None = None,
) -> dict[int, int] | None:
    """Resolve tuning to a semitone map, or None for standard."""
    if tuning_notes:
        notes = [n.strip() for n in tuning_notes.split(",")]
        if len(notes) != 6:
            raise ValueError("tuning_notes must have exactly 6 notes")
        return notes_to_semitone_map(notes)
    if tuning != "standard":
        return notes_to_semitone_map(get_tuning_notes(tuning))
    return None


def get_chord(
    root: str,
    quality: str,
    tuning: str = "standard",
    tuning_notes: str | None = None,
) -> ChordResponse:
    """Build a full ChordResponse for the given root/quality/tuning.

    Raises ValueError for invalid input, LookupError if no voicings found.
    """
    if root not in VALID_ROOTS:
        raise ValueError(f"Invalid root note: {root}")
    if quality not in CHORD_INTERVALS:
        raise ValueError(f"Invalid chord quality: {quality}")

    tuning_map = _resolve_tuning_map(tuning, tuning_notes)
    chord_notes = get_chord_notes(root, quality)
    voicing_data = get_voicing_positions(root, quality, tuning=tuning_map)

    if voicing_data is None:
        raise LookupError(
            f"Chord {root} {quality} not available in voicings database"
        )

    voicings: list[ChordVoicing] = []
    for voicing in voicing_data:
        positions = [
            ChordVoicingPosition(
                string=pos["string"],
                fret=pos["fret"],
                note=pos["note"],
                interval=pos["interval"],
                is_root=pos["is_root"],
            )
            for pos in voicing["positions"]
        ]
        voicings.append(
            ChordVoicing(
                label=voicing["label"],
                name=voicing["name"],
                color=voicing["color"],
                base_fret=voicing["base_fret"],
                min_fret=voicing["min_fret"],
                max_fret=voicing["max_fret"],
                positions=positions,
            )
        )

    return ChordResponse(
        root=root,
        quality=quality,
        display_name=f"{root}{_get_quality_suffix(quality)}",
        chord_notes=chord_notes,
        voicings=voicings,
    )
