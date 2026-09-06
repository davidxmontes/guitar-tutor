"""Trusted scale discovery metadata and deterministic CAGED physical regions."""
from app.music.chords import note_to_index, get_note_at_position
from app.v2.models import ScaleConceptId, CagedQualityId, CagedShapeId, CagedRegion, ConceptPosition

CIRCLE_KEYS = ["C", "G", "D", "A", "E", "B", "Gb", "Db", "Ab", "Eb", "Bb", "F"]

SCALE_NAMES: dict[str, str] = {
    "major": "Major scale",
    "ionian": "Ionian mode",
    "dorian": "Dorian mode",
    "phrygian": "Phrygian mode",
    "lydian": "Lydian mode",
    "mixolydian": "Mixolydian mode",
    "aeolian": "Aeolian mode",
    "natural_minor": "Natural minor scale",
    "locrian": "Locrian mode",
    "harmonic_minor": "Harmonic minor scale",
    "melodic_minor": "Melodic minor scale",
    "pentatonic_major": "Major pentatonic",
    "pentatonic_minor": "Minor pentatonic",
    "blues": "Blues scale",
}

DEFAULT_COMPARISONS: dict[str, ScaleConceptId] = {
    "major": "natural_minor", "ionian": "dorian", "dorian": "major",
    "phrygian": "natural_minor", "lydian": "major", "mixolydian": "major",
    "aeolian": "major", "natural_minor": "major", "locrian": "natural_minor",
    "harmonic_minor": "natural_minor", "melodic_minor": "natural_minor",
    "pentatonic_major": "major", "pentatonic_minor": "natural_minor",
    "blues": "pentatonic_minor",
}

CAGED_SHAPES: tuple[CagedShapeId, ...] = ("C", "A", "G", "E", "D")
CAGED_ROOTS = {"C": "C", "A": "A", "G": "G", "E": "E", "D": "D"}
CAGED_POSITIONS: dict[CagedQualityId, dict[CagedShapeId, tuple[tuple[int, int], ...]]] = {
    "major": {
        "C": ((1, 0), (2, 1), (3, 0), (4, 2), (5, 3)),
        "A": ((1, 0), (2, 2), (3, 2), (4, 2), (5, 0)),
        "G": ((1, 3), (2, 0), (3, 0), (4, 0), (5, 2), (6, 3)),
        "E": ((1, 0), (2, 0), (3, 1), (4, 2), (5, 2), (6, 0)),
        "D": ((1, 2), (2, 3), (3, 2), (4, 0)),
    },
    "minor": {
        "C": ((1, 3), (2, 1), (3, 0), (4, 1), (5, 3)),
        "A": ((1, 0), (2, 1), (3, 2), (4, 2), (5, 0)),
        "G": ((1, 3), (2, 3), (3, 0), (4, 0), (5, 1), (6, 3)),
        "E": ((1, 0), (2, 0), (3, 0), (4, 2), (5, 2), (6, 0)),
        "D": ((1, 1), (2, 3), (3, 2), (4, 0)),
    },
}


def caged_regions(root: str, quality: CagedQualityId = 'major') -> list[CagedRegion]:
    if quality not in CAGED_POSITIONS:
        raise ValueError('Unsupported CAGED quality')
    root_index = note_to_index(root)
    role_by_semitone = {0: "1", 3 if quality == "minor" else 4: "b3" if quality == "minor" else "3", 7: "5"}
    regions = []
    for shape in CAGED_SHAPES:
        offset = (root_index - note_to_index(CAGED_ROOTS[shape])) % 12
        positions = []
        for string, fret in CAGED_POSITIONS[quality][shape]:
            physical_fret = fret + offset
            note = get_note_at_position(string, physical_fret)
            interval = role_by_semitone.get((note_to_index(note) - root_index) % 12)
            if interval is None:
                raise ValueError(f"Invalid {quality} {shape}-shape position")
            positions.append(ConceptPosition(string=string, fret=physical_fret, note=note, interval=interval))
        expected_roles = {"1", "b3" if quality == "minor" else "3", "5"}
        if {position.interval for position in positions} != expected_roles:
            raise ValueError(f"Incomplete {quality} {shape}-shape region")
        regions.append(CagedRegion(
            shape=shape,
            label=f"{shape} shape",
            fret_start=min(position.fret for position in positions),
            fret_end=max(position.fret for position in positions),
            positions=positions,
        ))
    regions.sort(key=lambda region: (region.fret_start, CAGED_SHAPES.index(region.shape)))

    return regions
