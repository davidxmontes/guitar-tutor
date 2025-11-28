"""
Chord/Scale name parsing utilities.
Maps natural language chord/scale names to API parameters.
"""

import re
from typing import Optional, Tuple, List, Dict

# Valid root notes (including enharmonics)
VALID_ROOTS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"]

# Mapping from natural language quality names to API quality IDs
QUALITY_ALIASES = {
    # Major variants
    "major": "major",
    "maj": "major",
    "": "major",  # "C" alone means "C major"
    
    # Minor variants
    "minor": "minor",
    "min": "minor",
    "m": "minor",
    
    # Diminished
    "diminished": "diminished",
    "dim": "diminished",
    "°": "diminished",
    
    # Augmented
    "augmented": "augmented",
    "aug": "augmented",
    "+": "augmented",
    
    # Suspended
    "sus2": "sus2",
    "sus4": "sus4",
    "suspended 2": "sus2",
    "suspended 4": "sus4",
    "suspended2": "sus2",
    "suspended4": "sus4",
    
    # Dominant 7th
    "7": "dominant7",
    "dom7": "dominant7",
    "dominant7": "dominant7",
    "dominant 7": "dominant7",
    "dominant seventh": "dominant7",
    "dominant_7": "dominant7",
    
    # Major 7th
    "maj7": "major7",
    "major7": "major7",
    "major 7": "major7",
    "major seventh": "major7",
    "major_7": "major7",
    "Δ7": "major7",
    
    # Minor 7th
    "m7": "minor7",
    "min7": "minor7",
    "minor7": "minor7",
    "minor 7": "minor7",
    "minor seventh": "minor7",
    "minor_7": "minor7",
    "-7": "minor7",
    
    # Minor 9th
    "m9": "m9",
    "min9": "m9",
    "minor 9": "m9",
    "minor9": "m9",
    "minor_9": "m9",
    "minor ninth": "m9",
    
    # Dominant 9th
    "9": "9",
    "dom9": "9",
    "dominant 9": "9",
    "dominant9": "9",
    "dominant_9": "9",
    "ninth": "9",
    
    # Major 9th
    "maj9": "maj9",
    "major 9": "maj9",
    "major9": "maj9",
    "major_9": "maj9",
    "major ninth": "maj9",
    
    # Diminished 7th
    "dim7": "dim7",
    "°7": "dim7",
    "diminished 7": "dim7",
    "diminished seventh": "dim7",
    "diminished7": "dim7",
    "diminished_7": "dim7",
    
    # Half-diminished
    "m7b5": "m7b5",
    "ø7": "m7b5",
    "half-dim": "m7b5",
    "half-diminished": "m7b5",
    "minor 7 flat 5": "m7b5",
    "half dim": "m7b5",
    "halfdim": "m7b5",
    
    # 7sus4
    "7sus4": "7sus4",
    "7sus": "7sus4",
    
    # 6th chords
    "6": "6",
    "major 6": "6",
    "major6": "6",
    "major_6": "6",
    "maj6": "6",
    "sixth": "6",
    "m6": "m6",
    "min6": "m6",
    "minor 6": "m6",
    "minor6": "m6",
    "minor_6": "m6",
    "minor sixth": "m6",
    
    # Extended chords
    "add9": "add9",
    "add 9": "add9",
    "add_9": "add9",
    
    # Minor add9
    "madd9": "madd9",
    "m add9": "madd9",
    "m add 9": "madd9",
    "minor add9": "madd9",
    "minor add 9": "madd9",
    "minor add_9": "madd9",
    "minoradd9": "madd9",
    "min add9": "madd9",
    "min add 9": "madd9",
    
    # Common LLM outputs that should be mapped (fallbacks)
    "barre": "major",  # "barre chord" usually means major barre
    "barre chord": "major",
    "bar": "major",
    "power": "major",  # Power chords - map to major (close enough for display)
    "power chord": "major",
}

# Scale name mappings - maps natural language to backend scale IDs
SCALE_ALIASES = {
    "major": "major",
    "ionian": "major",
    "minor": "minor",
    "natural minor": "minor",
    "aeolian": "minor",
    "dorian": "dorian",
    "phrygian": "phrygian",
    "lydian": "lydian",
    "mixolydian": "mixolydian",
    "locrian": "locrian",
    # Pentatonic scales - backend uses "pentatonic_major" and "pentatonic_minor"
    "pentatonic": "pentatonic_major",
    "major pentatonic": "pentatonic_major",
    "major_pentatonic": "pentatonic_major",
    "pentatonic major": "pentatonic_major",
    "pentatonic_major": "pentatonic_major",
    "minor pentatonic": "pentatonic_minor",
    "minor_pentatonic": "pentatonic_minor",
    "pentatonic minor": "pentatonic_minor",
    "pentatonic_minor": "pentatonic_minor",
    # Blues and other scales
    "blues": "blues",
    "harmonic minor": "harmonic_minor",
    "harmonic_minor": "harmonic_minor",
    "melodic minor": "melodic_minor",
    "melodic_minor": "melodic_minor",
}


def normalize_root(root: str) -> Optional[str]:
    """
    Normalize a root note to a valid format.
    Returns None if the root is invalid.
    """
    if not root:
        return None
    
    # Capitalize first letter, handle sharps/flats
    root = root.strip()
    if len(root) == 1:
        root = root.upper()
    elif len(root) == 2:
        root = root[0].upper() + root[1].lower()
        # Convert 'b' to 'b' and 's' or '#' to '#'
        if root[1] == 's':
            root = root[0] + '#'
    
    # Check if valid
    if root in VALID_ROOTS:
        return root
    
    return None


def parse_chord_name(chord_name: str) -> Optional[Tuple[str, str]]:
    """
    Parse a chord name like "C major", "Am7", "F# minor" into (root, quality).
    
    Returns:
        Tuple of (root, quality_id) suitable for API calls, or None if unparseable.
    
    Examples:
        "C major" -> ("C", "major")
        "Am7" -> ("A", "minor7")
        "F# minor" -> ("F#", "minor")
        "Bb7" -> ("Bb", "dominant7")
        "E" -> ("E", "major")
    """
    if not chord_name:
        return None
    
    chord_name = chord_name.strip()
    
    # Try to extract root note first (1 or 2 characters)
    root = None
    quality_str = ""
    
    # Pattern: letter + optional sharp/flat + rest
    match = re.match(r'^([A-Ga-g])([#b♯♭]?)(.*)$', chord_name)
    if not match:
        return None
    
    root_letter = match.group(1).upper()
    accidental = match.group(2)
    remainder = match.group(3).strip().lower()
    
    # Normalize accidental
    if accidental in ['♯', '#']:
        accidental = '#'
    elif accidental in ['♭', 'b']:
        accidental = 'b'
    else:
        accidental = ''
    
    root = root_letter + accidental
    root = normalize_root(root)
    
    if not root:
        return None
    
    # Now parse the quality from remainder
    # Handle common patterns
    
    # Remove common words
    remainder = remainder.replace("chord", "").strip()
    
    # Direct lookup
    if remainder in QUALITY_ALIASES:
        return (root, QUALITY_ALIASES[remainder])
    
    # Handle compound qualities like "minor 7", "major seventh"
    # Try progressively shorter prefixes
    for alias, quality_id in sorted(QUALITY_ALIASES.items(), key=lambda x: -len(x[0])):
        if alias and remainder.startswith(alias):
            return (root, quality_id)
    
    # If nothing matched and remainder is empty, assume major
    if not remainder:
        return (root, "major")
    
    # Last resort: check if it's just whitespace variations
    remainder_clean = remainder.replace(" ", "").replace("-", "")
    if remainder_clean in QUALITY_ALIASES:
        return (root, QUALITY_ALIASES[remainder_clean])
    
    # Unable to parse quality
    return None


def parse_scale_name(scale_name: str) -> Optional[Tuple[str, str]]:
    """
    Parse a scale name like "A minor pentatonic", "C major" into (root, scale_type).
    
    Returns:
        Tuple of (root, scale_id) suitable for API calls, or None if unparseable.
    """
    if not scale_name:
        return None
    
    scale_name = scale_name.strip().lower()
    
    # Pattern: root + scale type
    match = re.match(r'^([A-Ga-g])([#b♯♭]?)\s*(.*)$', scale_name)
    if not match:
        return None
    
    root_letter = match.group(1).upper()
    accidental = match.group(2)
    scale_type = match.group(3).strip()
    
    # Normalize accidental
    if accidental in ['♯', '#']:
        accidental = '#'
    elif accidental in ['♭', 'b']:
        accidental = 'b'
    else:
        accidental = ''
    
    root = root_letter + accidental
    root = normalize_root(root)
    
    if not root:
        return None
    
    # Lookup scale type
    if scale_type in SCALE_ALIASES:
        return (root, SCALE_ALIASES[scale_type])
    
    # Try without spaces
    scale_type_clean = scale_type.replace(" ", "_")
    if scale_type_clean in SCALE_ALIASES:
        return (root, SCALE_ALIASES[scale_type_clean])
    
    # Default to major if just a root
    if not scale_type:
        return (root, "major")
    
    return None


def build_api_requests_from_response(
    chord_choices: List[str],
    scale: Optional[str] = None,
    include_scale: bool = True
) -> Dict[str, List[Dict]]:
    """
    Convert agent response chord_choices and scale into API request parameters.
    
    Args:
        chord_choices: List of chord names from agent (e.g., ["E major", "B major"])
        scale: Scale name from agent (e.g., "E major")
        include_scale: Whether to include scale request
    
    Returns:
        Dict with 'chords' and optionally 'scale' API request info.
        
    Example output:
        {
            "chords": [
                {"root": "E", "quality": "major", "endpoint": "/api/chords/E/major"},
                {"root": "B", "quality": "major", "endpoint": "/api/chords/B/major"},
            ],
            "scale": {"root": "E", "mode": "major", "endpoint": "/api/scales/E/major"}
        }
    """
    result = {"chords": [], "scale": None}
    
    # Parse chord choices
    for chord_name in chord_choices:
        parsed = parse_chord_name(chord_name)
        if parsed:
            root, quality = parsed
            result["chords"].append({
                "root": root,
                "quality": quality,
                "original_name": chord_name,
                "endpoint": f"/api/chords/{root}/{quality}",
            })
    
    # Parse scale
    if include_scale and scale:
        parsed_scale = parse_scale_name(scale)
        if parsed_scale:
            root, mode = parsed_scale
            result["scale"] = {
                "root": root,
                "mode": mode,
                "original_name": scale,
                "endpoint": f"/api/scales/{root}/{mode}",
            }
    
    return result
