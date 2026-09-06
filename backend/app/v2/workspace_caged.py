"""CAGED region generation — retained deterministic music helper (ticket #101).

`caged_regions` (in app.v2.concepts) produces the five trusted shapes in
standard tuning; `chord_caged_regions` projects them into an arbitrary tuning
with the chord's enharmonic spelling. Harmony (H1) reuses this for a focused
major/minor chord.
"""
from app.music.chords import CHORD_INTERVALS, index_to_note
from app.v2.concepts import caged_regions
from app.v2.workspace import chromatic_note, pitch_class, spelled_notes

STANDARD_TUNING = [64, 59, 55, 50, 45, 40]


def chord_caged_regions(root: str, quality: str, tuning: list[int]) -> list[dict]:
    """Trusted CAGED regions for a major/minor chord, projected into ``tuning``.

    Each region is ``{shape, label, fret_start, fret_end, positions}`` where
    ``positions`` carry the chord's enharmonic spelling.
    """
    formula = CHORD_INTERVALS[quality]
    notes = {n['pitch_class']: n for n in spelled_notes(root, formula['intervals'], formula['names'])}
    regions = []
    for region in caged_regions(index_to_note(pitch_class(root)), quality):
        positions = []
        for p in region.positions:
            fret = p.fret + STANDARD_TUNING[p.string - 1] - tuning[p.string - 1]
            midi = tuning[p.string - 1] + fret
            positions.append({'string': p.string, 'fret': fret, 'midi': midi,
                              **(notes.get(midi % 12) or chromatic_note(midi))})
        regions.append({'shape': region.shape, 'label': region.label,
                        'fret_start': min(x['fret'] for x in positions),
                        'fret_end': max(x['fret'] for x in positions),
                        'positions': positions})
    regions.sort(key=lambda r: r['fret_start'])
    return regions
