"""Chord calculations and shared music-theory helpers."""

from typing import Dict, List

# Chromatic scale (using flats — the music-theory standard)
CHROMATIC_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# Chord intervals (semitones from root) with interval names
CHORD_INTERVALS = {
    "major": {"intervals": [0, 4, 7], "names": ["1", "3", "5"]},
    "minor": {"intervals": [0, 3, 7], "names": ["1", "b3", "5"]},
    "diminished": {"intervals": [0, 3, 6], "names": ["1", "b3", "b5"]},
    "augmented": {"intervals": [0, 4, 8], "names": ["1", "3", "#5"]},
    "dominant7": {"intervals": [0, 4, 7, 10], "names": ["1", "3", "5", "b7"]},
    "major7": {"intervals": [0, 4, 7, 11], "names": ["1", "3", "5", "7"]},
    "minor7": {"intervals": [0, 3, 7, 10], "names": ["1", "b3", "5", "b7"]},
    "dim7": {"intervals": [0, 3, 6, 9], "names": ["1", "b3", "b5", "bb7"]},
    "m7b5": {"intervals": [0, 3, 6, 10], "names": ["1", "b3", "b5", "b7"]},
    "sus2": {"intervals": [0, 2, 7], "names": ["1", "2", "5"]},
    "sus4": {"intervals": [0, 5, 7], "names": ["1", "4", "5"]},
    "add9": {"intervals": [0, 4, 7, 14], "names": ["1", "3", "5", "9"]},
    "madd9": {"intervals": [0, 3, 7, 14], "names": ["1", "b3", "5", "9"]},
    "7sus4": {"intervals": [0, 5, 7, 10], "names": ["1", "4", "5", "b7"]},
    "6": {"intervals": [0, 4, 7, 9], "names": ["1", "3", "5", "6"]},
    "m6": {"intervals": [0, 3, 7, 9], "names": ["1", "b3", "5", "6"]},
    "9": {"intervals": [0, 4, 7, 10, 14], "names": ["1", "3", "5", "b7", "9"]},
    "m9": {"intervals": [0, 3, 7, 10, 14], "names": ["1", "b3", "5", "b7", "9"]},
    "maj9": {"intervals": [0, 4, 7, 11, 14], "names": ["1", "3", "5", "7", "9"]},
}

# Standard tuning: string index -> open note semitone value
# String 1 (high E), String 6 (low E)
STANDARD_TUNING = {
    1: 4,  # E
    2: 11,  # B
    3: 7,  # G
    4: 2,  # D
    5: 9,  # A
    6: 4,  # E
}


def note_to_index(note: str) -> int:
    """Convert note name to chromatic index (0-11)."""
    sharp_to_flat = {"C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb"}
    normalized = sharp_to_flat.get(note, note)
    return CHROMATIC_NOTES.index(normalized)


def index_to_note(index: int) -> str:
    """Convert chromatic index to note name."""
    return CHROMATIC_NOTES[index % 12]


def get_note_at_position(string: int, fret: int, tuning: dict[int, int] | None = None) -> str:
    """Get the note at a specific string/fret position."""
    open_note = (tuning or STANDARD_TUNING)[string]
    return index_to_note(open_note + fret)


def get_chord_notes(root: str, quality: str) -> List[str]:
    """Get all notes in a chord."""
    if quality not in CHORD_INTERVALS:
        raise ValueError(f"Unknown chord quality: {quality}")

    root_index = note_to_index(root)
    intervals = CHORD_INTERVALS[quality]["intervals"]
    return [index_to_note(root_index + interval) for interval in intervals]


def _get_quality_suffix(quality: str) -> str:
    """Get chord suffix for display."""
    suffixes = {
        "major": "",
        "minor": "m",
        "diminished": "°",
        "augmented": "+",
        "dominant7": "7",
        "major7": "maj7",
        "minor7": "m7",
        "dim7": "°7",
        "m7b5": "ø7",
        "sus2": "sus2",
        "sus4": "sus4",
        "add9": "add9",
        "madd9": "m(add9)",
        "7sus4": "7sus4",
        "6": "6",
        "m6": "m6",
        "9": "9",
        "m9": "m9",
        "maj9": "maj9",
    }
    return suffixes.get(quality, "")


def get_available_chord_qualities() -> List[Dict]:
    """Get list of available chord qualities grouped by category."""
    return [
        {"id": "major", "name": "Major", "category": "Triads"},
        {"id": "minor", "name": "Minor", "category": "Triads"},
        {"id": "diminished", "name": "Diminished", "category": "Triads"},
        {"id": "augmented", "name": "Augmented", "category": "Triads"},
        {"id": "sus2", "name": "Sus2", "category": "Suspended"},
        {"id": "sus4", "name": "Sus4", "category": "Suspended"},
        {"id": "dominant7", "name": "Dominant 7", "category": "7th Chords"},
        {"id": "major7", "name": "Major 7", "category": "7th Chords"},
        {"id": "minor7", "name": "Minor 7", "category": "7th Chords"},
        {"id": "dim7", "name": "Dim 7", "category": "7th Chords"},
        {"id": "m7b5", "name": "Half-Dim (m7♭5)", "category": "7th Chords"},
        {"id": "7sus4", "name": "7sus4", "category": "7th Chords"},
        {"id": "6", "name": "Major 6", "category": "6th Chords"},
        {"id": "m6", "name": "Minor 6", "category": "6th Chords"},
        {"id": "add9", "name": "Add9", "category": "Extended"},
        {"id": "madd9", "name": "Minor Add9", "category": "Extended"},
        {"id": "9", "name": "9", "category": "Extended"},
        {"id": "m9", "name": "Minor 9", "category": "Extended"},
        {"id": "maj9", "name": "Major 9", "category": "Extended"},
    ]
