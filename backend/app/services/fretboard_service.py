"""Service layer for fretboard generation."""

from app.models.music import FretboardResponse, NotePosition
from app.music.notes import generate_fretboard
from app.music.tunings import get_tuning_notes

FRET_COUNT = 22


def get_fretboard(
    tuning: str = "standard",
    tuning_notes: str | None = None,
) -> FretboardResponse:
    """Build a full FretboardResponse for the given tuning."""
    if tuning_notes:
        notes = [n.strip() for n in tuning_notes.split(",")]
        if len(notes) != 6:
            raise ValueError("tuning_notes must have exactly 6 notes")
        resolved_notes = notes
        tuning = "custom"
    else:
        resolved_notes = get_tuning_notes(tuning)

    fretboard_data = generate_fretboard(resolved_notes, FRET_COUNT)

    strings = [
        [
            NotePosition(string=pos["string"], fret=pos["fret"], note=pos["note"])
            for pos in string_data
        ]
        for string_data in fretboard_data
    ]

    return FretboardResponse(
        tuning=tuning,
        tuning_notes=resolved_notes,
        strings=strings,
        fret_count=FRET_COUNT,
    )
