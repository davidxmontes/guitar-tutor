"""Thin CAGED adapter: trusted regions feed every major/minor resolved chord;
materialization stays an explicit editing boundary."""
from typing import Literal
from uuid import uuid4
from app.music.chords import CHORD_INTERVALS
from app.v2.workspace import (Block, Chord, ConceptWorkspace, Identifier, Placement, Position, Row,
    StrictModel, ViewSettings, Voicing, chromatic_note, pitch_class, resolve_workspace, spelled_notes)

STANDARD_TUNING = [64, 59, 55, 50, 45, 40]


def caged_starter() -> ConceptWorkspace:
    chord = Chord(id=uuid4().hex, root='C', quality='major')
    blocks = [Block(id=uuid4().hex, kind=kind, source_id=chord.id) for kind in ('caged','chord_diagrams','fretboard')]
    return ConceptWorkspace(title='Connect CAGED shapes', provenance='caged-exploration', entities=[chord], blocks=blocks,
        composition=[Row(items=[Placement(block_id=b.id, priority='primary' if i == 0 else 'supporting')]) for i,b in enumerate(blocks)])


def chord_caged_regions(chord: Chord, tuning: list[int]) -> list[dict]:
    """Trusted CAGED regions for a major/minor chord, projected into ``tuning``.

    Each region is ``{shape, label, fret_start, fret_end, positions}`` where
    ``positions`` carry the chord's enharmonic spelling.
    """
    from app.v2.concepts import caged_regions
    from app.music.chords import index_to_note
    formula = CHORD_INTERVALS[chord.quality]
    notes = {n['pitch_class']: n for n in spelled_notes(chord.root, formula['intervals'], formula['names'])}
    regions = []
    for region in caged_regions(index_to_note(pitch_class(chord.root)), chord.quality):
        positions = []
        for p in region.positions:
            fret = p.fret + STANDARD_TUNING[p.string - 1] - tuning[p.string - 1]
            midi = tuning[p.string - 1] + fret
            positions.append({'string': p.string, 'fret': fret, 'midi': midi, **(notes.get(midi % 12) or chromatic_note(midi))})
        regions.append({'shape': region.shape, 'label': region.label,
            'fret_start': min(x['fret'] for x in positions), 'fret_end': max(x['fret'] for x in positions),
            'positions': positions})
    regions.sort(key=lambda r: r['fret_start'])
    return regions


def valid_caged_inspection(regions: list[dict] | None, kind: str, key: int | str) -> bool:
    if not regions or not isinstance(key, str):
        return False
    if kind == 'region':
        return any(r['shape'] == key for r in regions)
    if kind == 'region_pair':
        return any(f"{first['shape']}:{second['shape']}" == key for first, second in zip(regions, regions[1:]))
    if kind == 'region_note':
        region = next((r for r in regions if r['shape'] == key.split(':')[0]), None)
        return region is not None and any(key == f"{region['shape']}:{p['pitch_class']}" for p in region['positions'])
    return False


class CagedMaterialize(StrictModel):
    workspace: ConceptWorkspace
    chord_id: Identifier
    region: Literal['C','A','G','E','D']


def materialize_region(request: CagedMaterialize) -> ConceptWorkspace:
    draft = request.workspace.model_copy(deep=True)
    resolved = resolve_workspace(draft)['entities'].get(request.chord_id, {})
    regions = resolved.get('cagedRegions')
    if not regions:
        raise ValueError('Select a CAGED source')
    region = next(r for r in regions if r['shape'] == request.region)
    source = next(e for e in draft.entities if e.id == request.chord_id)
    chord = source.model_copy(update={'id':uuid4().hex})
    voicing = Voicing(id=uuid4().hex, chord_id=chord.id, label=f'{source.root} {source.quality} · {region["label"]}', tuning=draft.tuning,
        positions=[Position(string=p['string'], fret=p['fret']) for p in region['positions']])
    draft.entities.extend([chord,voicing])
    for kind in ('chord_diagrams','fretboard'):
        start = min(region['fret_start'], 19); end = max(start+1,region['fret_end'])
        block = Block(id=uuid4().hex, kind=kind, source_id=voicing.id, settings=ViewSettings(fret_start=start,fret_end=end))
        draft.blocks.append(block); draft.composition.append(Row(items=[Placement(block_id=block.id)]))
    result = ConceptWorkspace.model_validate(draft.model_dump()); resolve_workspace(result)
    return result
