"""
Chord calculations and CAGED shape definitions.

This module uses a dynamic approach to generate chord voicings:
1. CAGED anchor positions define where each shape's root note sits
2. Chord intervals are used to find all chord tones on the fretboard
3. Voicings are built by selecting playable notes within each shape's range
"""

from typing import Dict, List, Tuple

# CAGED shape colors
CAGED_COLORS = {
    "C": "orange",
    "A": "yellow", 
    "G": "green",
    "E": "blue",
    "D": "purple",
}

# Chromatic scale
CHROMATIC_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Chord intervals (semitones from root) with interval names
CHORD_INTERVALS = {
    "major":      {"intervals": [0, 4, 7],           "names": ["1", "3", "5"]},
    "minor":      {"intervals": [0, 3, 7],           "names": ["1", "b3", "5"]},
    "diminished": {"intervals": [0, 3, 6],           "names": ["1", "b3", "b5"]},
    "augmented":  {"intervals": [0, 4, 8],           "names": ["1", "3", "#5"]},
    "dominant7":  {"intervals": [0, 4, 7, 10],       "names": ["1", "3", "5", "b7"]},
    "major7":     {"intervals": [0, 4, 7, 11],       "names": ["1", "3", "5", "7"]},
    "minor7":     {"intervals": [0, 3, 7, 10],       "names": ["1", "b3", "5", "b7"]},
    "dim7":       {"intervals": [0, 3, 6, 9],        "names": ["1", "b3", "b5", "bb7"]},
    "m7b5":       {"intervals": [0, 3, 6, 10],       "names": ["1", "b3", "b5", "b7"]},
    "sus2":       {"intervals": [0, 2, 7],           "names": ["1", "2", "5"]},
    "sus4":       {"intervals": [0, 5, 7],           "names": ["1", "4", "5"]},
    "add9":       {"intervals": [0, 4, 7, 14],       "names": ["1", "3", "5", "9"]},
    "madd9":      {"intervals": [0, 3, 7, 14],       "names": ["1", "b3", "5", "9"]},
    "7sus4":      {"intervals": [0, 5, 7, 10],       "names": ["1", "4", "5", "b7"]},
    "6":          {"intervals": [0, 4, 7, 9],        "names": ["1", "3", "5", "6"]},
    "m6":         {"intervals": [0, 3, 7, 9],        "names": ["1", "b3", "5", "6"]},
    "9":          {"intervals": [0, 4, 7, 10, 14],   "names": ["1", "3", "5", "b7", "9"]},
    "m9":         {"intervals": [0, 3, 7, 10, 14],   "names": ["1", "b3", "5", "b7", "9"]},
    "maj9":       {"intervals": [0, 4, 7, 11, 14],   "names": ["1", "3", "5", "7", "9"]},
}

# Standard tuning: string index -> open note semitone value
# String 1 (high E) = 4, String 2 (B) = 11, String 3 (G) = 7, 
# String 4 (D) = 2, String 5 (A) = 9, String 6 (low E) = 4
STANDARD_TUNING = {
    1: 4,   # E
    2: 11,  # B
    3: 7,   # G
    4: 2,   # D
    5: 9,   # A
    6: 4,   # E
}

# CAGED shape definitions
# Each shape is defined by:
# - root_string: which string the root note is anchored to
# - fret_span: how many frets the shape typically spans
# - string_range: which strings are typically included
# - is_open_shape: whether the shape includes open strings when at fret 0

CAGED_SHAPES = {
    "C": {
        "root_string": 5,
        "fret_span": 4,
        "string_range": (1, 5),  # strings 1-5
        "open_root_fret": 3,     # C is at fret 3 on string 5
    },
    "A": {
        "root_string": 5,
        "fret_span": 3,
        "string_range": (1, 5),
        "open_root_fret": 0,     # A is open on string 5
    },
    "G": {
        "root_string": 6,
        "fret_span": 4,
        "string_range": (1, 6),
        "open_root_fret": 3,     # G is at fret 3 on string 6
    },
    "E": {
        "root_string": 6,
        "fret_span": 3,
        "string_range": (1, 6),
        "open_root_fret": 0,     # E is open on string 6
    },
    "D": {
        "root_string": 4,
        "fret_span": 3,
        "string_range": (1, 4),
        "open_root_fret": 0,     # D is open on string 4
    },
}


def note_to_index(note: str) -> int:
    """Convert note name to chromatic index (0-11)."""
    flat_to_sharp = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
    note = flat_to_sharp.get(note, note)
    return CHROMATIC_NOTES.index(note)


def index_to_note(index: int) -> str:
    """Convert chromatic index to note name."""
    return CHROMATIC_NOTES[index % 12]


def get_note_at_position(string: int, fret: int) -> str:
    """Get the note at a specific string/fret position."""
    open_note = STANDARD_TUNING[string]
    return index_to_note(open_note + fret)


def get_chord_notes(root: str, quality: str) -> List[str]:
    """Get all notes in a chord."""
    if quality not in CHORD_INTERVALS:
        raise ValueError(f"Unknown chord quality: {quality}")
    
    root_index = note_to_index(root)
    intervals = CHORD_INTERVALS[quality]["intervals"]
    
    return [index_to_note(root_index + interval) for interval in intervals]


# CAGED voicing templates
# These define finger patterns relative to root position for each shape
# Format: list of (string, fret_offset, interval_index)
# interval_index: 0=root, 1=second interval (3rd/b3/2/4), 2=third interval (5th), 3=fourth (7th)

CAGED_VOICINGS = {
    "C": {
        "root_string": 5,
        "triad_pattern": [
            # Open C voicing: x32010
            (5, 0, 0),    # Root on string 5
            (4, -1, 1),   # 3rd on string 4
            (3, -3, 2),   # 5th on string 3 (open in C position)
            (2, -2, 0),   # Root on string 2
            (1, -3, 1),   # 3rd on string 1
        ],
        "seventh_pattern": [
            # C7 shape: x32310 - 7th replaces the 5th on string 3
            (5, 0, 0),    # Root
            (4, -1, 1),   # 3rd
            (3, 0, 3),    # 7th (moved up from open to fret 3)
            (2, -2, 0),   # Root
            (1, -3, 1),   # 3rd
        ],
    },
    "A": {
        "root_string": 5,
        "triad_pattern": [
            # Open A voicing: x02220
            (5, 0, 0),    # Root
            (4, 2, 2),    # 5th
            (3, 2, 0),    # Root
            (2, 2, 1),    # 3rd
            (1, 0, 2),    # 5th
        ],
        "dom7_pattern": [
            # A7 barre shape: b7 is same fret as root on string 3
            (5, 0, 0),    # Root
            (4, 2, 2),    # 5th
            (3, 0, 3),    # b7 (same fret as root barre)
            (2, 2, 1),    # 3rd
            (1, 0, 2),    # 5th
        ],
        "maj7_pattern": [
            # Amaj7 barre shape: maj7 is 1 fret up from root barre on string 3
            (5, 0, 0),    # Root
            (4, 2, 2),    # 5th
            (3, 1, 3),    # maj7 (1 fret above root barre)
            (2, 2, 1),    # 3rd
            (1, 0, 2),    # 5th
        ],
    },
    "G": {
        "root_string": 6,
        "triad_pattern": [
            # Open G voicing: 320003
            (6, 0, 0),    # Root
            (5, -1, 1),   # 3rd
            (4, -3, 2),   # 5th
            (3, -3, 0),   # Root
            (2, -3, 1),   # 3rd
            (1, 0, 0),    # Root
        ],
        "seventh_pattern": [
            # G7 shape: 320001 - 7th on string 1
            (6, 0, 0),    # Root
            (5, -1, 1),   # 3rd
            (4, -3, 2),   # 5th
            (3, -3, 0),   # Root
            (2, -2, 3),   # 7th
            (1, 0, 0),    # Root
        ],
    },
    "E": {
        "root_string": 6,
        "triad_pattern": [
            # Open E voicing: 022100
            (6, 0, 0),    # Root
            (5, 2, 2),    # 5th
            (4, 2, 0),    # Root
            (3, 1, 1),    # 3rd
            (2, 0, 2),    # 5th
            (1, 0, 0),    # Root
        ],
        "seventh_pattern": [
            # E7 shape: 020100 - 7th replaces 5th on string 5
            (6, 0, 0),    # Root
            (5, 0, 3),    # 7th (at barre/open)
            (4, 2, 0),    # Root
            (3, 1, 1),    # 3rd
            (2, 0, 2),    # 5th
            (1, 0, 0),    # Root
        ],
    },
    "D": {
        "root_string": 4,
        "triad_pattern": [
            # Open D voicing: xx0232
            (4, 0, 0),    # Root
            (3, 2, 2),    # 5th
            (2, 3, 0),    # Root
            (1, 2, 1),    # 3rd
        ],
        "seventh_pattern": [
            # D7 shape: xx0212 - 7th on string 2
            (4, 0, 0),    # Root
            (3, 2, 2),    # 5th
            (2, 1, 3),    # 7th
            (1, 2, 1),    # 3rd
        ],
    },
}


def build_shape_voicing(
    root: str, 
    quality: str, 
    shape_name: str,
    base_fret: int
) -> List[Dict]:
    """
    Build a chord voicing for a specific CAGED shape.
    Uses the voicing templates and adapts them based on chord intervals.
    """
    voicing = CAGED_VOICINGS[shape_name]
    root_index = note_to_index(root)
    
    chord_data = CHORD_INTERVALS[quality]
    intervals = chord_data["intervals"]
    interval_names = chord_data["names"]
    
    # Determine which pattern to use based on chord type
    # Major 7th family: major7, maj9 (have interval 11 = major 7th)
    # Dominant 7th family: dominant7, minor7, 7sus4, 9, m9, m7b5, dim7 (have interval 10 = b7)
    # 6th chords: 6, m6 (have interval 9 = 6th)
    # Triads: major, minor, dim, aug, sus2, sus4, add9
    
    has_maj7 = 11 in intervals  # Major 7th
    has_dom7 = 10 in intervals  # Dominant/minor 7th
    has_sixth = 9 in intervals and 10 not in intervals and 11 not in intervals  # 6th (not 7th)
    
    # Select pattern based on chord type
    if has_maj7 and "maj7_pattern" in voicing:
        pattern = voicing["maj7_pattern"]
    elif has_dom7 and "dom7_pattern" in voicing:
        pattern = voicing["dom7_pattern"]
    elif "seventh_pattern" in voicing and (has_maj7 or has_dom7):
        # Fallback to generic seventh_pattern if specific not available
        pattern = voicing["seventh_pattern"]
    else:
        pattern = voicing["triad_pattern"]
    
    positions = []
    
    # Build the pattern
    for string, fret_offset, interval_idx in pattern:
        # Map interval_idx to actual chord interval
        if interval_idx >= len(intervals):
            # If this interval doesn't exist in the chord (e.g., 7th in a triad), skip
            continue
            
        actual_fret = base_fret + fret_offset
        
        # Skip if fret is negative or too high
        if actual_fret < 0 or actual_fret > 22:
            continue
        
        # Get the actual note that should be at this position based on interval
        semitones = intervals[interval_idx]
        note_index = (root_index + semitones) % 12
        expected_note = index_to_note(note_index)
        
        # Verify this note actually exists at this fret
        actual_note = get_note_at_position(string, actual_fret)
        
        # If the expected note doesn't match, find the closest fret with the right note
        if actual_note != expected_note:
            # Search nearby frets
            open_note = STANDARD_TUNING[string]
            found = False
            for offset in range(-3, 4):
                test_fret = actual_fret + offset
                if test_fret >= 0 and (open_note + test_fret) % 12 == note_index:
                    actual_fret = test_fret
                    actual_note = expected_note
                    found = True
                    break
            if not found:
                continue  # Skip this position if we can't find the right note
        
        is_root = semitones % 12 == 0
        
        positions.append({
            "string": string,
            "fret": actual_fret,
            "note": actual_note,
            "interval": interval_names[interval_idx],
            "is_root": is_root,
        })
    
    # Sort by string (high to low)
    positions.sort(key=lambda p: p["string"])
    
    return positions


def get_caged_positions(root: str, quality: str, max_fret: int = 22) -> List[Dict]:
    """
    Get all 5 CAGED shape positions for a chord, including octave repeats.
    
    Returns list of shapes, each containing fretboard positions.
    Each shape includes positions from both the lower and upper octave
    (12 frets apart) when they fit within the fretboard range.
    """
    root_index = note_to_index(root)
    shapes = []
    
    for shape_name, voicing in CAGED_VOICINGS.items():
        root_string = voicing["root_string"]
        open_note = STANDARD_TUNING[root_string]
        
        # Calculate base fret: where the root note lands on the root string
        base_fret = (root_index - open_note) % 12
        
        # Adjust for playability - keep shapes in reasonable positions
        # E and A shapes work at fret 0, others need to move up
        if base_fret == 0 and shape_name not in ["E", "A"]:
            base_fret = 12
        
        # Build the voicing for this shape at the primary position
        positions = build_shape_voicing(root, quality, shape_name, base_fret)
        
        if not positions:
            continue
        
        # Also build octave position (12 frets higher) if it fits on the fretboard
        octave_base_fret = base_fret + 12
        if octave_base_fret <= max_fret - 2:  # Leave room for the shape span
            octave_positions = build_shape_voicing(root, quality, shape_name, octave_base_fret)
            if octave_positions:
                # Filter out positions beyond max_fret
                octave_positions = [p for p in octave_positions if p["fret"] <= max_fret]
                if octave_positions:
                    positions.extend(octave_positions)
        
        # Calculate min/max frets from all positions
        frets = [p["fret"] for p in positions]
        shape_min_fret = min(frets)
        shape_max_fret = max(frets)
        
        shapes.append({
            "shape": shape_name,
            "name": f"{root}{_get_quality_suffix(quality)} ({shape_name} shape)",
            "color": CAGED_COLORS[shape_name],
            "base_fret": base_fret,
            "min_fret": shape_min_fret,
            "max_fret": shape_max_fret,
            "positions": positions,
        })
    
    # Sort by base fret position
    shapes.sort(key=lambda s: s["base_fret"])
    
    return shapes


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
        # Triads
        {"id": "major", "name": "Major", "category": "Triads"},
        {"id": "minor", "name": "Minor", "category": "Triads"},
        {"id": "diminished", "name": "Diminished", "category": "Triads"},
        {"id": "augmented", "name": "Augmented", "category": "Triads"},
        # Suspended
        {"id": "sus2", "name": "Sus2", "category": "Suspended"},
        {"id": "sus4", "name": "Sus4", "category": "Suspended"},
        # 7th chords
        {"id": "dominant7", "name": "Dominant 7", "category": "7th Chords"},
        {"id": "major7", "name": "Major 7", "category": "7th Chords"},
        {"id": "minor7", "name": "Minor 7", "category": "7th Chords"},
        {"id": "dim7", "name": "Dim 7", "category": "7th Chords"},
        {"id": "m7b5", "name": "Half-Dim (m7♭5)", "category": "7th Chords"},
        {"id": "7sus4", "name": "7sus4", "category": "7th Chords"},
        # 6th chords
        {"id": "6", "name": "Major 6", "category": "6th Chords"},
        {"id": "m6", "name": "Minor 6", "category": "6th Chords"},
        # Extended
        {"id": "add9", "name": "Add9", "category": "Extended"},
        {"id": "madd9", "name": "Minor Add9", "category": "Extended"},
        {"id": "9", "name": "9", "category": "Extended"},
        {"id": "m9", "name": "Minor 9", "category": "Extended"},
        {"id": "maj9", "name": "Major 9", "category": "Extended"},
    ]
