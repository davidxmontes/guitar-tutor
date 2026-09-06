"""Typed workspace music and deterministic scale/harmony/physical facts."""
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.music.chords import CHORD_INTERVALS
from app.music.scales import SCALE_INTERVALS, SCALE_DEGREE_NAMES

Pitch = Annotated[str, Field(pattern=r'^[A-G](#{1,2}|b{1,2})?$')]
Identifier = Annotated[str, Field(min_length=1, max_length=80)]
Midi = Annotated[int, Field(strict=True, ge=0, le=127)]
Mode = Literal['major', 'natural_minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'harmonic_minor', 'melodic_minor', 'pentatonic_major', 'pentatonic_minor', 'blues']
BLOCK_SOURCES = {'fretboard': ('scale', 'compare', 'voicing', 'transition', 'chord'), 'degree_strip': ('scale', 'compare'), 'chord_diagrams': ('voicing', 'transition', 'chord'), 'circle': ('key',), 'progression': ('key', 'progression'), 'caged': ('chord',)}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Scale(StrictModel):
    id: Identifier
    kind: Literal['scale'] = 'scale'
    label: str | None = Field(default=None, min_length=1, max_length=120)
    root: Pitch
    mode: Mode


class Key(StrictModel):
    id: Identifier
    kind: Literal['key'] = 'key'
    root: Pitch
    mode: Literal['major'] = 'major'


class Chord(StrictModel):
    id: Identifier
    kind: Literal['chord'] = 'chord'
    root: Pitch
    quality: str

    @model_validator(mode='after')
    def known_quality(self):
        if self.quality not in CHORD_INTERVALS:
            raise ValueError('Unsupported chord quality')
        return self


class Position(StrictModel):
    string: int = Field(ge=1, le=6, strict=True)
    fret: int = Field(ge=0, le=24, strict=True)


class Voicing(StrictModel):
    id: Identifier
    kind: Literal['voicing'] = 'voicing'
    label: str = Field(min_length=1, max_length=120)
    chord_id: Identifier | None = None
    tuning: list[Midi] = Field(min_length=6, max_length=6)
    positions: list[Position] = Field(min_length=1, max_length=6)

    @model_validator(mode='after')
    def playable(self):
        if len({p.string for p in self.positions}) != len(self.positions):
            raise ValueError('A voicing has only one fret per string')
        if any(self.tuning[p.string - 1] + p.fret > 127 for p in self.positions):
            raise ValueError('Voicing pitches exceed MIDI playback range')
        return self


class ProgressionStep(StrictModel):
    chord_id: Identifier
    voicing_id: Identifier | None = None


class Progression(StrictModel):
    id: Identifier
    kind: Literal['progression'] = 'progression'
    key_id: Identifier
    steps: list[ProgressionStep] = Field(min_length=1, max_length=16)


Entity = Scale | Key | Chord | Voicing | Progression


class Transition(StrictModel):
    id: Identifier
    kind: Literal['transition'] = 'transition'
    entity_ids: list[Identifier] = Field(min_length=2, max_length=2)
    key_id: Identifier


class Compare(StrictModel):
    id: Identifier
    kind: Literal['compare'] = 'compare'
    entity_ids: list[Identifier] = Field(min_length=2, max_length=2)


class ViewSettings(StrictModel):
    pattern: Literal['I-V-vi-IV'] | None = None
    labels: Literal['notes', 'intervals'] = 'notes'
    shared_only: bool = False
    fret_start: int = Field(default=0, ge=0, le=19, strict=True)
    fret_end: int = Field(default=5, ge=1, le=24, strict=True)

    @model_validator(mode='after')
    def ordered_range(self):
        if not 1 <= self.fret_end - self.fret_start <= 12:
            raise ValueError('Choose a fret range between 2 and 13 frets')
        return self


class Block(StrictModel):
    id: Identifier
    kind: Literal['fretboard', 'degree_strip', 'chord_diagrams', 'circle', 'progression', 'caged']
    source_id: Identifier
    settings: ViewSettings = Field(default_factory=ViewSettings)


class Placement(StrictModel):
    block_id: Identifier
    span: Literal[4, 6, 8, 12] = 12
    priority: Literal['primary', 'supporting', 'reference'] = 'supporting'


class Row(StrictModel):
    items: list[Placement] = Field(min_length=1, max_length=3)


class ConceptWorkspace(StrictModel):
    schema_version: Literal[1] = 1
    version: int = Field(default=1, ge=1, strict=True)
    title: str = Field(min_length=1, max_length=120)
    provenance: Literal['scale-comparison', 'physical-resolution', 'four-chord-progression', 'caged-exploration'] = 'scale-comparison'
    tuning: list[Midi] = Field(default_factory=lambda: [64, 59, 55, 50, 45, 40], min_length=6, max_length=6)
    entities: list[Entity] = Field(min_length=1, max_length=12)
    relations: list[Compare | Transition] = Field(default_factory=list, max_length=12)
    blocks: list[Block] = Field(max_length=12)
    composition: list[Row] = Field(max_length=12)

    @model_validator(mode='after')
    def coherent_workspace(self):
        objects = [*self.entities, *self.relations, *self.blocks]
        if len({obj.id for obj in objects}) != len(objects):
            raise ValueError('Workspace IDs must be unique')
        entities = {entity.id: entity for entity in self.entities}
        for entity in self.entities:
            if isinstance(entity, Voicing) and entity.chord_id and not isinstance(entities.get(entity.chord_id), Chord):
                raise ValueError('A voicing must reference an existing Chord')
        for entity in self.entities:
            if isinstance(entity, Progression):
                if not isinstance(entities.get(entity.key_id), Key):
                    raise ValueError('Progression requires a Key context')
                for step in entity.steps:
                    if not isinstance(entities.get(step.chord_id), Chord):
                        raise ValueError('Progression step requires a Chord')
                    if step.voicing_id:
                        voicing = entities.get(step.voicing_id)
                        if not isinstance(voicing, Voicing) or voicing.chord_id not in (None, step.chord_id):
                            raise ValueError('Progression voicing must realize its referenced Chord')
        for relation in self.relations:
            expected = Scale if isinstance(relation, Compare) else Voicing
            if len(set(relation.entity_ids)) != 2 or any(not isinstance(entities.get(id), expected) for id in relation.entity_ids):
                raise ValueError('Relation requires two distinct compatible entities')
            if isinstance(relation, Transition):
                if not isinstance(entities.get(relation.key_id), Key):
                    raise ValueError('Transition requires a Key context')
                if entities[relation.entity_ids[0]].tuning != entities[relation.entity_ids[1]].tuning:
                    raise ValueError('A physical transition needs the same tuning on both voicings')
        sources = {obj.id: obj.kind for obj in [*self.entities, *self.relations]}
        for block in self.blocks:
            chord = entities.get(block.source_id)
            if isinstance(chord, Chord) and chord.quality not in ('major', 'minor'):
                raise ValueError('CAGED views support major or minor chords')
            derived = block.kind == 'progression' and sources.get(block.source_id) == 'key'
            if derived != (block.settings.pattern is not None):
                raise ValueError('A derived Progression view requires a pattern; other views do not')
            if sources.get(block.source_id) not in BLOCK_SOURCES[block.kind]:
                raise ValueError('View is not compatible with its musical source')
            if block.settings.shared_only and sources[block.source_id] not in ('compare', 'transition', 'chord'):
                raise ValueError('Shared notes require a comparison')
        placements = [item.block_id for row in self.composition for item in row.items]
        if sorted(placements) != sorted(block.id for block in self.blocks):
            raise ValueError('Place every block exactly once')
        if any(sum(item.span for item in row.items) > 12 for row in self.composition):
            raise ValueError('A composition row cannot exceed 12 columns')
        return self


def scale_comparison() -> ConceptWorkspace:
    primary, comparison, relation, fretboard, degrees = [uuid4().hex for _ in range(5)]
    return ConceptWorkspace(title='G major vs G minor',
        entities=[Scale(id=primary, root='G', mode='major'), Scale(id=comparison, root='G', mode='natural_minor')],
        relations=[Compare(id=relation, entity_ids=[primary, comparison])],
        blocks=[Block(id=fretboard, kind='fretboard', source_id=relation), Block(id=degrees, kind='degree_strip', source_id=relation)],
        composition=[Row(items=[Placement(block_id=fretboard, priority='primary', span=8), Placement(block_id=degrees, span=4)])])


NATURAL_PITCHES = dict(zip('CDEFGAB', [0, 2, 4, 5, 7, 9, 11]))


def pitch_class(note: str) -> int:
    return (NATURAL_PITCHES[note[0]] + note.count('#') - note.count('b')) % 12


def resolve_workspace(workspace: ConceptWorkspace) -> dict:
    scales = {}
    for entity in workspace.entities:
        if not isinstance(entity, Scale):
            continue
        root = pitch_class(entity.root)
        notes = spelled_notes(entity.root, SCALE_INTERVALS[entity.mode], SCALE_DEGREE_NAMES[entity.mode])
        by_pitch = {note['pitch_class']: note for note in notes}
        positions = [{'string': string, 'fret': fret, 'midi': midi + fret, **by_pitch[(midi + fret) % 12]}
                     for string, midi in enumerate(workspace.tuning, 1) for fret in range(25) if midi + fret <= 127 and (midi + fret) % 12 in by_pitch]
        # Same register for both scales makes the comparison audible; choose real positions in the active tuning.
        tonic = min(workspace.tuning) + (root - min(workspace.tuning)) % 12
        playback = []
        for offset in [*SCALE_INTERVALS[entity.mode], 12]:
            midi = tonic + offset
            choices = [p for p in positions if p['midi'] == midi]
            if not choices:
                raise ValueError('This tuning cannot play the scale in one octave; choose a closer tuning')
            playback.append(min(choices, key=lambda p: (p['fret'], -p['string'])))
        scales[entity.id] = {'label': entity.label or f"{entity.root} {entity.mode.replace('natural_minor', 'minor').replace('_', ' ')}", 'notes': notes, 'positions': positions, 'playback': playback}
    comparisons = {}
    for relation in workspace.relations:
        if not isinstance(relation, Compare):
            continue
        first, second = [scales[id]['notes'] for id in relation.entity_ids]
        first_pitches, second_pitches = [{n['pitch_class'] for n in notes} for notes in (first, second)]
        comparisons[relation.id] = {'shared': [n['pitch_class'] for n in first if n['pitch_class'] in second_pitches],
            'removed': [n for n in first if n['pitch_class'] not in second_pitches], 'added': [n for n in second if n['pitch_class'] not in first_pitches]}
    from app.v2.workspace_progressions import resolve_progressions
    facts = {'scales': scales, 'comparisons': comparisons, 'block_sources': BLOCK_SOURCES, **resolve_physical(workspace)}
    from app.v2.workspace_caged import resolve_caged
    return facts | {'progressions': resolve_progressions(workspace, facts), 'caged': resolve_caged(workspace, facts)}



def physical_resolution() -> ConceptWorkspace:
    from app.v2.concepts import CAGED_POSITIONS
    key, d, g, dv, gv, transition, fret, diagrams, circle = [uuid4().hex for _ in range(9)]
    tuning = [64, 59, 55, 50, 45, 40]
    return ConceptWorkspace(title='Why D resolves to G', provenance='physical-resolution', entities=[
        Key(id=key, root='G'), Chord(id=d, root='D', quality='major'), Chord(id=g, root='G', quality='major'),
        Voicing(id=dv, chord_id=d, label='D open', tuning=tuning, positions=[Position(string=s, fret=f) for s, f in CAGED_POSITIONS['major']['D']]),
        Voicing(id=gv, chord_id=g, label='G open', tuning=tuning, positions=[Position(string=s, fret=f) for s, f in CAGED_POSITIONS['major']['G']])],
        relations=[Transition(id=transition, entity_ids=[dv, gv], key_id=key)],
        blocks=[Block(id=diagrams, kind='chord_diagrams', source_id=transition), Block(id=fret, kind='fretboard', source_id=transition), Block(id=circle, kind='circle', source_id=key)],
        composition=[Row(items=[Placement(block_id=diagrams, priority='primary', span=6), Placement(block_id=circle, span=6)]), Row(items=[Placement(block_id=fret)])])


def spelled_notes(root: str, offsets: list[int], degrees: list[str]) -> list[dict]:
    notes = []
    for offset, degree in zip(offsets, degrees):
        pitch = (pitch_class(root) + offset) % 12
        letter = 'CDEFGAB'[('CDEFGAB'.index(root[0]) + int(degree.lstrip('b#')) - 1) % 7]
        accidental = (pitch - NATURAL_PITCHES[letter] + 6) % 12 - 6
        notes.append({'note': letter + ('#' * accidental if accidental > 0 else 'b' * -accidental), 'degree': degree, 'pitch_class': pitch, 'offset': offset})
    return notes


def resolve_physical(workspace: ConceptWorkspace) -> dict:
    from app.v2.concepts import CIRCLE_KEYS
    keys, chords, voicings, transitions = {}, {}, {}, {}
    for entity in workspace.entities:
        if isinstance(entity, Key):
            keys[entity.id] = {'label': f'{entity.root} major', 'root': entity.root,
                'notes': spelled_notes(entity.root, [0,2,4,5,7,9,11], ['1','2','3','4','5','6','7']), 'circle': [entity.root if pitch_class(n) == pitch_class(entity.root) else n for n in CIRCLE_KEYS]}
        elif isinstance(entity, Chord):
            formula = CHORD_INTERVALS[entity.quality]
            chords[entity.id] = {'label': f'{entity.root} {entity.quality}', 'root': entity.root,
                'quality': entity.quality, 'notes': spelled_notes(entity.root, formula['intervals'], formula['names'])}
    for entity in workspace.entities:
        if not isinstance(entity, Voicing):
            continue
        voicings[entity.id] = resolve_voicing(entity, chords)
    for relation in workspace.relations:
        if not isinstance(relation, Transition):
            continue
        first, second = [voicings[id] for id in relation.entity_ids]
        a, b = [{p['pitch_class'] for p in v['positions']} for v in (first, second)]
        movement = physical_movement(first, second)
        key_notes = keys[relation.key_id]['notes']
        functions = []
        for v in (first, second):
            chord = chords.get(v['chord_id'])
            functions.append(harmonic_function(chord, key_notes) if chord else 'unnamed')
        transitions[relation.id] = {'label': f"{first['label']} → {second['label']}", 'functions': functions,
            'shared': sorted(a & b), 'removed': sorted(a - b), 'added': sorted(b - a), 'movement': movement,
            'explanation': 'D builds expectation; G feels like home in G major. Hear the two shapes, then inspect what stays or moves.' if functions == ['V','I'] and keys[relation.key_id]['root'] == 'G' else 'Hear these shapes in the key context; inspect each string to see what stays or moves.'}
    return {'keys': keys, 'chords': chords, 'voicings': voicings, 'transitions': transitions}


def resolve_voicing(entity: Voicing, chords: dict) -> dict:
    context = chords.get(entity.chord_id, {})
    notes = {n['pitch_class']: n for n in context.get('notes', [])}
    positions = []
    for p in entity.positions:
        midi = entity.tuning[p.string - 1] + p.fret
        pitch = midi % 12
        note = notes.get(pitch) or {'note': ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'][pitch], 'degree':'—', 'pitch_class':pitch, 'offset':0}
        positions.append(p.model_dump() | note | {'midi': midi})
    return {'label': entity.label, 'chord_id': entity.chord_id, 'tuning': entity.tuning, 'positions': positions}

def harmonic_function(chord: dict, notes: list[dict]) -> str:
    index = next((i for i, n in enumerate(notes) if n['pitch_class'] == pitch_class(chord['root'])), None)
    return ['I','ii','iii','IV','V','vi','vii°'][index] if index is not None and chord['quality'] == ['major','minor','minor','major','major','minor','diminished'][index] else 'outside key'


def physical_movement(first: dict, second: dict) -> list[dict]:
    movement = []
    for string in range(1, 7):
        before, after = [next((p for p in v['positions'] if p['string'] == string), None) for v in (first, second)]
        if before or after:
            movement.append({'string': string, 'before': before, 'after': after,
                'kind': 'added' if not before else 'removed' if not after else 'fixed' if before['fret'] == after['fret'] else 'moving',
                'semitones': after['midi'] - before['midi'] if before and after else None})
    return movement
