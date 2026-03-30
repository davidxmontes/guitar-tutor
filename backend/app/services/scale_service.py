"""Service layer for scale lookups and fretboard position mapping."""

from app.models.music import DiatonicChord, ScaleNotePosition, ScaleResponse
from app.music.notes import generate_fretboard
from app.music.scales import (
    SCALE_INTERVALS,
    get_diatonic_chords,
    get_scale_degree,
    get_scale_notes,
)
from app.music.tunings import TUNINGS, get_tuning_notes

VALID_ROOTS = [
    "C", "C#", "Db", "D", "D#", "Eb", "E", "F",
    "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
]

SHARP_TO_FLAT = {"C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb"}


def resolve_tuning_notes(
    tuning: str = "standard",
    tuning_notes: str | None = None,
) -> list[str]:
    """Resolve tuning to a list of 6 note names. Raises ValueError on bad input."""
    if tuning_notes:
        notes = [n.strip() for n in tuning_notes.split(",")]
        if len(notes) != 6:
            raise ValueError("tuning_notes must have exactly 6 notes")
        return notes
    if tuning not in TUNINGS:
        raise ValueError(f"Invalid tuning: {tuning}")
    return get_tuning_notes(tuning)


def get_scale(
    root: str,
    mode: str,
    tuning: str = "standard",
    tuning_notes: str | None = None,
) -> ScaleResponse:
    """Build a full ScaleResponse for the given root/mode/tuning."""
    if root not in VALID_ROOTS:
        raise ValueError(f"Invalid root note: {root}")
    if mode not in SCALE_INTERVALS:
        raise ValueError(f"Invalid scale mode: {mode}")

    resolved_notes = resolve_tuning_notes(tuning, tuning_notes)
    scale_notes = get_scale_notes(root, mode)
    fretboard = generate_fretboard(resolved_notes)

    normalized_root = SHARP_TO_FLAT.get(root, root)

    positions: list[ScaleNotePosition] = []
    for string_notes in fretboard:
        for note_pos in string_notes:
            note_name = note_pos["note"]
            normalized_note = SHARP_TO_FLAT.get(note_name, note_name)

            if normalized_note in scale_notes:
                degree, degree_label = get_scale_degree(note_name, root, mode)
                positions.append(
                    ScaleNotePosition(
                        string=note_pos["string"],
                        fret=note_pos["fret"],
                        note=note_name,
                        is_root=normalized_note == normalized_root,
                        degree=degree,
                        degree_label=degree_label,
                    )
                )

    diatonic_chords = [
        DiatonicChord(**chord) for chord in get_diatonic_chords(root, mode)
    ]

    return ScaleResponse(
        root=root,
        mode=mode,
        scale_notes=scale_notes,
        positions=positions,
        diatonic_chords=diatonic_chords,
    )
