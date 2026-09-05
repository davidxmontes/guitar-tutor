"""Key-derived patterns become concrete only at an explicit editing boundary."""
from uuid import uuid4
from typing import Literal
from pydantic import Field
from app.music.chords import CHORD_INTERVALS
from app.v2.workspace import (
    Block, Chord, ConceptWorkspace, Identifier, Key, Pitch, Placement, Position, Progression,
    ProgressionStep, Row, StrictModel, ViewSettings, Voicing, pitch_class, resolve_workspace, resolve_voicing, spelled_notes,
)


def progression_starter() -> ConceptWorkspace:
    key, block = uuid4().hex, uuid4().hex
    return ConceptWorkspace(title='Explore I–V–vi–IV', provenance='four-chord-progression',
        entities=[Key(id=key, root='G')], blocks=[Block(id=block, kind='progression', source_id=key, settings=ViewSettings(pattern='I-V-vi-IV'))],
        composition=[Row(items=[Placement(block_id=block, priority='primary')])])


def reference_voicing(chord: Chord, tuning: list[int]) -> Voicing:
    from app.v2.concepts import CAGED_POSITIONS, CAGED_ROOTS
    if chord.quality not in CAGED_POSITIONS:
        raise ValueError('Choose major or minor for a reference shape, or edit exact frets instead')
    shape = min(CAGED_POSITIONS[chord.quality], key=lambda s: (pitch_class(chord.root) - pitch_class(CAGED_ROOTS[s])) % 12)
    shift = (pitch_class(chord.root) - pitch_class(CAGED_ROOTS[shape])) % 12
    standard = [64,59,55,50,45,40]
    positions = [Position(string=s, fret=f + shift + standard[s-1] - tuning[s-1]) for s, f in CAGED_POSITIONS[chord.quality][shape]]
    return Voicing(id=uuid4().hex, chord_id=chord.id, label=f'{chord.root} {chord.quality} voicing', tuning=tuning, positions=positions)


def harmonic_function(chord: dict, notes: list[dict]) -> str:
    index = next((i for i, n in enumerate(notes) if n['pitch_class'] == pitch_class(chord['root'])), None)
    return ['I','ii','iii','IV','V','vi','vii°'][index] if index is not None and chord['quality'] == ['major','minor','minor','major','major','minor','diminished'][index] else 'outside key'


def resolve_progressions(workspace: ConceptWorkspace, facts: dict) -> dict:
    progressions = {}
    for block in workspace.blocks:
        if block.kind != 'progression' or block.source_id in progressions:
            continue
        source = next(e for e in workspace.entities if e.id == block.source_id)
        key_id = source.id if isinstance(source, Key) else source.key_id
        notes = facts['keys'][key_id]['notes']
        steps = []
        if isinstance(source, Key):
            for degree, quality in [(0,'major'),(4,'major'),(5,'minor'),(3,'major')]:
                chord = Chord(id='derived', root=notes[degree]['note'], quality=quality)
                voicing = reference_voicing(chord, workspace.tuning)
                steps.append({'chord_id':None, 'voicing_id':None, 'root':chord.root, 'quality':quality,
                    'positions':resolve_voicing(voicing, {chord.id: {'notes':spelled_notes(chord.root, CHORD_INTERVALS[quality]['intervals'], CHORD_INTERVALS[quality]['names'])}})['positions'], 'tuning':voicing.tuning})
        else:
            for step in source.steps:
                chord = facts['chords'][step.chord_id]
                voicing = facts['voicings'].get(step.voicing_id)
                steps.append({'chord_id':step.chord_id, 'voicing_id':step.voicing_id, 'root':chord['root'], 'quality':chord['quality'],
                    'positions':voicing['positions'] if voicing else [], 'tuning':voicing['tuning'] if voicing else workspace.tuning})
        for step in steps:
            step['function'] = harmonic_function(step, notes)
        progressions[source.id] = {'derived':isinstance(source, Key), 'key_id':key_id, 'label':'I–V–vi–IV' if isinstance(source, Key) else 'Your progression', 'steps':steps}
    return progressions


class ProgressionAction(StrictModel):
    workspace: ConceptWorkspace
    block_id: Identifier
    action: Literal['materialize', 'edit', 'transpose']
    step: int | None = Field(default=None, ge=0, le=15, strict=True)
    root: Pitch | None = None
    quality: Literal['major', 'minor'] | None = None
    positions: list[Position] | None = Field(default=None, min_length=1, max_length=6)
    semitones: int | None = Field(default=None, ge=-12, le=12, strict=True)


def edit_progression(request: ProgressionAction) -> ConceptWorkspace:
    draft = request.workspace.model_copy(deep=True)
    block = next((b for b in draft.blocks if b.id == request.block_id and b.kind == 'progression'), None)
    if not block:
        raise ValueError('Select an existing progression view')
    facts = resolve_workspace(draft)['progressions'][block.source_id]
    if facts['derived']:
        steps = []
        for step in facts['steps']:
            chord = Chord(id=uuid4().hex, root=step['root'], quality=step['quality'])
            voicing = Voicing(id=uuid4().hex, chord_id=chord.id, label=f'{chord.root} {chord.quality} voicing', tuning=step['tuning'],
                positions=[Position(string=p['string'], fret=p['fret']) for p in step['positions']])
            draft.entities.extend([chord, voicing]); steps.append(ProgressionStep(chord_id=chord.id, voicing_id=voicing.id))
        progression = Progression(id=uuid4().hex, key_id=facts['key_id'], steps=steps)
        draft.entities.append(progression)
        # All views of this same derived pattern follow its concrete identity.
        source_id = block.source_id
        for view in draft.blocks:
            if view.kind == 'progression' and view.source_id == source_id:
                view.source_id = progression.id; view.settings.pattern = None
    else:
        progression = next(e for e in draft.entities if e.id == block.source_id)
    entities = {e.id:e for e in draft.entities}
    if request.action == 'edit':
        if request.step is None or request.step >= len(progression.steps):
            raise ValueError('Select an existing chord occurrence')
        step = progression.steps[request.step]
        chord = entities[step.chord_id]
        voicing = entities.get(step.voicing_id)
        # Copy shared occurrences before editing; other steps keep their exact material.
        all_steps = [s for e in draft.entities if isinstance(e, Progression) for s in e.steps]
        if sum(s.chord_id == chord.id for s in all_steps) > 1:
            chord = chord.model_copy(update={'id':uuid4().hex}); draft.entities.append(chord); step.chord_id = chord.id
        if voicing and sum(s.voicing_id == voicing.id for s in all_steps) > 1:
            voicing = voicing.model_copy(deep=True, update={'id':uuid4().hex}); draft.entities.append(voicing); step.voicing_id = voicing.id
        if request.root or request.quality:
            chord.root = request.root or chord.root; chord.quality = request.quality or chord.quality
            replacement = reference_voicing(chord, voicing.tuning if voicing else draft.tuning)
            if voicing:
                voicing.positions = replacement.positions; voicing.label = replacement.label
            else:
                voicing = replacement; draft.entities.append(voicing); step.voicing_id = voicing.id
        if request.positions is not None:
            if not voicing:
                voicing = Voicing(id=uuid4().hex, chord_id=chord.id, label='Edited voicing', tuning=draft.tuning, positions=request.positions)
                draft.entities.append(voicing); step.voicing_id = voicing.id
            voicing.positions = request.positions
        if voicing:
            voicing.chord_id = chord.id
    elif request.action == 'transpose':
        if request.semitones is None:
            raise ValueError('Choose a signed semitone distance')
        key = entities[progression.key_id]
        new_root = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'][(pitch_class(key.root) + request.semitones) % 12]
        letter_shift = ('CDEFGAB'.index(new_root[0]) - 'CDEFGAB'.index(key.root[0])) % 7
        ids = {id for step in progression.steps for id in (step.chord_id, step.voicing_id) if id}
        for other in draft.entities:
            if isinstance(other, Progression) and other.id != progression.id and any(s.chord_id in ids or s.voicing_id in ids for s in other.steps):
                raise ValueError('This music is shared with another progression; make independent copies before transposing')
        for id in ids:
            entity = entities[id]
            if isinstance(entity, Chord):
                entity.root = spelled_notes(entity.root, [request.semitones], [str(letter_shift + 1)])[0]['note']
            else:
                entity.positions = [Position(string=p.string, fret=p.fret + request.semitones) for p in entity.positions]
        key.root = new_root
    result = ConceptWorkspace.model_validate(draft.model_dump())
    resolve_workspace(result)
    return result
