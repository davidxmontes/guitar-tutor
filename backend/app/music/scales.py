"""
Scale calculations and definitions.
"""

from typing import Dict, List, Tuple

# Scale intervals (in semitones from root)
SCALE_INTERVALS: Dict[str, List[int]] = {
    # Major modes
    "major": [0, 2, 4, 5, 7, 9, 11],
    "ionian": [0, 2, 4, 5, 7, 9, 11],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "phrygian": [0, 1, 3, 5, 7, 8, 10],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "aeolian": [0, 2, 3, 5, 7, 8, 10],
    "natural_minor": [0, 2, 3, 5, 7, 8, 10],
    "locrian": [0, 1, 3, 5, 6, 8, 10],
    
    # Other common scales
    "harmonic_minor": [0, 2, 3, 5, 7, 8, 11],
    "melodic_minor": [0, 2, 3, 5, 7, 9, 11],
    "pentatonic_major": [0, 2, 4, 7, 9],
    "pentatonic_minor": [0, 3, 5, 7, 10],
    "blues": [0, 3, 5, 6, 7, 10],
}

# Scale degree names for display
SCALE_DEGREE_NAMES = ["1", "2", "3", "4", "5", "6", "7"]
PENTATONIC_DEGREE_NAMES = ["1", "2", "3", "5", "6"]
BLUES_DEGREE_NAMES = ["1", "b3", "4", "b5", "5", "b7"]

# Diatonic chord qualities for major scale
MAJOR_DIATONIC_CHORDS = [
    ("I", "major"),
    ("ii", "minor"),
    ("iii", "minor"),
    ("IV", "major"),
    ("V", "major"),
    ("vi", "minor"),
    ("vii°", "diminished"),
]

# Diatonic chord qualities for natural minor scale
MINOR_DIATONIC_CHORDS = [
    ("i", "minor"),
    ("ii°", "diminished"),
    ("III", "major"),
    ("iv", "minor"),
    ("v", "minor"),
    ("VI", "major"),
    ("VII", "major"),
]

CHROMATIC_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Enharmonic equivalents for display
ENHARMONIC_MAP = {
    "C#": "Db",
    "D#": "Eb",
    "F#": "Gb",
    "G#": "Ab",
    "A#": "Bb",
}


def note_to_index(note: str) -> int:
    """Convert note name to chromatic index (0-11)."""
    # Handle flats by converting to sharps
    flat_to_sharp = {
        "Db": "C#",
        "Eb": "D#",
        "Gb": "F#",
        "Ab": "G#",
        "Bb": "A#",
    }
    note = flat_to_sharp.get(note, note)
    return CHROMATIC_NOTES.index(note)


def index_to_note(index: int) -> str:
    """Convert chromatic index to note name."""
    return CHROMATIC_NOTES[index % 12]


def get_scale_notes(root: str, mode: str) -> List[str]:
    """Get all notes in a scale."""
    if mode not in SCALE_INTERVALS:
        raise ValueError(f"Unknown scale mode: {mode}")
    
    root_index = note_to_index(root)
    intervals = SCALE_INTERVALS[mode]
    
    return [index_to_note(root_index + interval) for interval in intervals]


def get_scale_degree(note: str, root: str, mode: str) -> Tuple[int, str]:
    """
    Get the scale degree (1-7) for a note in a scale.
    Returns tuple of (degree_number, degree_label).
    """
    scale_notes = get_scale_notes(root, mode)
    
    # Normalize note for comparison
    flat_to_sharp = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
    normalized = flat_to_sharp.get(note, note)
    
    if normalized in scale_notes:
        degree = scale_notes.index(normalized) + 1
        
        # Get appropriate degree label based on scale type
        if mode in ["pentatonic_major", "pentatonic_minor"]:
            labels = PENTATONIC_DEGREE_NAMES
        elif mode == "blues":
            labels = BLUES_DEGREE_NAMES
        else:
            labels = SCALE_DEGREE_NAMES
        
        label = labels[scale_notes.index(normalized)] if scale_notes.index(normalized) < len(labels) else str(degree)
        return degree, label
    
    return 0, ""


def get_diatonic_chords(root: str, mode: str) -> List[Dict]:
    """Get diatonic chords for a scale."""
    if mode in ["major", "ionian", "lydian", "mixolydian"]:
        chord_template = MAJOR_DIATONIC_CHORDS
    elif mode in ["natural_minor", "aeolian", "dorian", "phrygian"]:
        chord_template = MINOR_DIATONIC_CHORDS
    else:
        # For scales without traditional diatonic chords, return empty
        return []
    
    scale_notes = get_scale_notes(root, mode)
    
    # Build actual chord list with root notes
    # Note: for modes, we need to adjust the chord qualities
    if mode == "dorian":
        chord_template = [
            ("i", "minor"),
            ("ii", "minor"),
            ("III", "major"),
            ("IV", "major"),
            ("v", "minor"),
            ("vi°", "diminished"),
            ("VII", "major"),
        ]
    elif mode == "phrygian":
        chord_template = [
            ("i", "minor"),
            ("II", "major"),
            ("III", "major"),
            ("iv", "minor"),
            ("v°", "diminished"),
            ("VI", "major"),
            ("vii", "minor"),
        ]
    elif mode == "lydian":
        chord_template = [
            ("I", "major"),
            ("II", "major"),
            ("iii", "minor"),
            ("iv°", "diminished"),
            ("V", "major"),
            ("vi", "minor"),
            ("vii", "minor"),
        ]
    elif mode == "mixolydian":
        chord_template = [
            ("I", "major"),
            ("ii", "minor"),
            ("iii°", "diminished"),
            ("IV", "major"),
            ("v", "minor"),
            ("vi", "minor"),
            ("VII", "major"),
        ]
    elif mode == "locrian":
        chord_template = [
            ("i°", "diminished"),
            ("II", "major"),
            ("iii", "minor"),
            ("iv", "minor"),
            ("V", "major"),
            ("vi", "minor"),
            ("vii", "minor"),
        ]
    
    chords = []
    for i, (numeral, quality) in enumerate(chord_template):
        if i < len(scale_notes):
            chords.append({
                "numeral": numeral,
                "root": scale_notes[i],
                "quality": quality,
                "display": f"{scale_notes[i]}{_get_quality_suffix(quality)}"
            })
    
    return chords


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
    }
    return suffixes.get(quality, "")


def get_available_scales() -> List[Dict]:
    """Get list of available scales grouped by category."""
    return [
        {
            "category": "Major Modes",
            "scales": [
                {"id": "major", "name": "Major (Ionian)"},
                {"id": "dorian", "name": "Dorian"},
                {"id": "phrygian", "name": "Phrygian"},
                {"id": "lydian", "name": "Lydian"},
                {"id": "mixolydian", "name": "Mixolydian"},
                {"id": "aeolian", "name": "Natural Minor (Aeolian)"},
                {"id": "locrian", "name": "Locrian"},
            ]
        },
        {
            "category": "Minor Scales",
            "scales": [
                {"id": "natural_minor", "name": "Natural Minor"},
                {"id": "harmonic_minor", "name": "Harmonic Minor"},
                {"id": "melodic_minor", "name": "Melodic Minor"},
            ]
        },
        {
            "category": "Pentatonic & Blues",
            "scales": [
                {"id": "pentatonic_major", "name": "Major Pentatonic"},
                {"id": "pentatonic_minor", "name": "Minor Pentatonic"},
                {"id": "blues", "name": "Blues"},
            ]
        },
    ]
