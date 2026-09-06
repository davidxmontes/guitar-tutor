"""Thin CAGED adapter: trusted regions remain derived until explicitly kept."""
from typing import Literal
from uuid import uuid4
from app.v2.workspace import (Block, Chord, ConceptWorkspace, Identifier, Placement, Position, Row,
    StrictModel, ViewSettings, Voicing, physical_movement, pitch_class, resolve_voicing, resolve_workspace)


def caged_starter() -> ConceptWorkspace:
    chord = Chord(id=uuid4().hex, root='C', quality='major')
    blocks = [Block(id=uuid4().hex, kind=kind, source_id=chord.id) for kind in ('caged','chord_diagrams','fretboard')]
    return ConceptWorkspace(title='Connect CAGED shapes', provenance='caged-exploration', entities=[chord], blocks=blocks,
        composition=[Row(items=[Placement(block_id=b.id, priority='primary' if i == 0 else 'supporting')]) for i,b in enumerate(blocks)])


def resolve_caged(workspace: ConceptWorkspace, facts: dict) -> dict:
    from app.v2.concepts import build_concept_study
    from app.music.chords import index_to_note
    result = {}
    for chord in workspace.entities:
        if not isinstance(chord, Chord) or not any(b.source_id == chord.id for b in workspace.blocks):
            continue
        trusted = build_concept_study(index_to_note(pitch_class(chord.root)), 'caged', caged_quality=chord.quality)
        regions = []
        for region in trusted.regions:
            voicing = Voicing(id='derived', chord_id=chord.id, label=region.label, tuning=workspace.tuning,
                positions=[Position(string=p.string, fret=p.fret + [64,59,55,50,45,40][p.string-1] - workspace.tuning[p.string-1]) for p in region.positions])
            resolved = resolve_voicing(voicing, facts['chords'])
            regions.append(resolved | {'shape':region.shape, 'fret_start':min(p.fret for p in voicing.positions), 'fret_end':max(p.fret for p in voicing.positions)})
        regions.sort(key=lambda r:r['fret_start'])
        pairs = []
        for first, second in zip(regions, regions[1:]):
            other = {(p['string'],p['fret']) for p in second['positions']}
            pairs.append({'key':first['shape'] + ':' + second['shape'], 'shared':[p for p in first['positions'] if (p['string'],p['fret']) in other],
                'movement':physical_movement(first,second)})
        result[chord.id] = {'label':f'{chord.root} {chord.quality} CAGED', 'regions':regions, 'pairs':pairs}
    return result


def valid_caged_inspection(facts: dict | None, kind: str, key: int | str) -> bool:
    if not facts or not isinstance(key, str):
        return False
    region = next((r for r in facts['regions'] if r['shape'] == key.split(':')[0]), None)
    if kind == 'region':
        return any(r['shape'] == key for r in facts['regions'])
    if kind == 'region_pair':
        return any(p['key'] == key for p in facts['pairs'])
    return kind == 'region_note' and region is not None and any(key == f"{region['shape']}:{p['pitch_class']}" for p in region['positions'])


class CagedMaterialize(StrictModel):
    workspace: ConceptWorkspace
    chord_id: Identifier
    region: Literal['C','A','G','E','D']


def materialize_region(request: CagedMaterialize) -> ConceptWorkspace:
    draft = request.workspace.model_copy(deep=True)
    facts = resolve_workspace(draft)['caged'].get(request.chord_id)
    if not facts:
        raise ValueError('Select a CAGED source')
    region = next(r for r in facts['regions'] if r['shape'] == request.region)
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
