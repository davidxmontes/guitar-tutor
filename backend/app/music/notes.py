"""
Music theory: Note definitions and chromatic calculations.
"""

# All 12 chromatic notes (using sharps as default)
CHROMATIC_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Enharmonic equivalents (for display purposes)
ENHARMONIC_MAP = {
    "C#": "Db",
    "D#": "Eb",
    "F#": "Gb",
    "G#": "Ab",
    "A#": "Bb",
}

# Reverse mapping
FLAT_TO_SHARP = {v: k for k, v in ENHARMONIC_MAP.items()}


def get_note_at_fret(open_note: str, fret: int) -> str:
    """
    Calculate the note at a given fret position.
    
    Args:
        open_note: The note of the open string (e.g., "E", "A")
        fret: The fret number (0 = open string)
    
    Returns:
        The note name at that position
    """
    # Normalize open_note to sharp notation
    if open_note in FLAT_TO_SHARP:
        open_note = FLAT_TO_SHARP[open_note]
    
    # Find the index of the open note
    try:
        start_index = CHROMATIC_NOTES.index(open_note)
    except ValueError:
        raise ValueError(f"Invalid note: {open_note}")
    
    # Calculate new note index (wrapping around)
    new_index = (start_index + fret) % 12
    
    return CHROMATIC_NOTES[new_index]


def generate_string_notes(open_note: str, fret_count: int = 22) -> list[dict]:
    """
    Generate all notes for a single string.
    
    Args:
        open_note: The note of the open string
        fret_count: Number of frets (default 22)
    
    Returns:
        List of note positions for the string
    """
    notes = []
    for fret in range(fret_count + 1):  # +1 to include open string (fret 0)
        note = get_note_at_fret(open_note, fret)
        notes.append({
            "fret": fret,
            "note": note,
        })
    return notes


def generate_fretboard(tuning_notes: list[str], fret_count: int = 22) -> list[list[dict]]:
    """
    Generate the complete fretboard for a given tuning.
    
    Args:
        tuning_notes: List of open string notes from string 1 (high E) to string 6 (low E)
        fret_count: Number of frets (default 22)
    
    Returns:
        List of 6 strings, each containing note positions
    """
    fretboard = []
    
    for string_num, open_note in enumerate(tuning_notes, start=1):
        string_notes = []
        for fret in range(fret_count + 1):
            note = get_note_at_fret(open_note, fret)
            string_notes.append({
                "string": string_num,
                "fret": fret,
                "note": note,
            })
        fretboard.append(string_notes)
    
    return fretboard
