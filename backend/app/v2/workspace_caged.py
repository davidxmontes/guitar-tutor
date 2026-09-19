"""Trusted CAGED physical shapes, resolved directly for Harmony's tuning."""
from app.music.chords import CHORD_INTERVALS
from app.v2.harmony_state import STANDARD_TUNING
from app.v2.workspace import pitch_class, spelled_notes

CAGED_POSITIONS = {
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



def chord_caged_regions(root: str, quality: str, tuning: list[int]) -> list[dict]:
    """Resolve the five major/minor shapes with the chord's enharmonic spelling."""
    if quality not in CAGED_POSITIONS:
        raise ValueError('Unsupported CAGED quality')
    formula = CHORD_INTERVALS[quality]
    notes = {n['pitch_class']: n for n in spelled_notes(root, formula['intervals'], formula['names'])}
    shapes = CAGED_POSITIONS[quality]
    offsets = {shape: (pitch_class(root) - pitch_class(shape)) % 12 for shape in shapes}
    # Standard-neck order breaks ties when tuning projection puts shapes at the same fret.
    ordered = sorted(shapes, key=lambda shape: min(fret for _, fret in shapes[shape]) + offsets[shape])
    regions = []
    for shape in ordered:
        positions = []
        for string, base_fret in shapes[shape]:
            fret = base_fret + offsets[shape] + STANDARD_TUNING[string - 1] - tuning[string - 1]
            midi = tuning[string - 1] + fret
            positions.append({'string': string, 'fret': fret, 'midi': midi, **notes[midi % 12]})
        regions.append({'shape': shape, 'label': f'{shape} shape',
                        'fret_start': min(p['fret'] for p in positions),
                        'fret_end': max(p['fret'] for p in positions),
                        'positions': positions})
    regions.sort(key=lambda region: region['fret_start'])
    return regions
