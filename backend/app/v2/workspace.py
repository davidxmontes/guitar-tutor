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
# Per-block-kind compatible source kinds (spec #88 §5). Internal block kinds stay
# snake_case; the spec prose's `degree-strip` etc. name the same kinds.
BLOCK_ACCEPTS = {
    'fretboard': ('scale', 'chord', 'voicing', 'key', 'noteGroup', 'compare', 'transition'),
    'degree_strip': ('scale', 'chord', 'compare'),
    'chord_diagrams': ('voicing', 'chord'),
    'circle': ('key',),
    'progression': ('progression', 'key'),
    'key_family': ('key',),
}
BLOCK_SOURCES = BLOCK_ACCEPTS  # back-compat alias for existing importers


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


class PitchRef(StrictModel):
    pitch_class: int = Field(ge=0, le=11, strict=True)


class PhysicalRef(StrictModel):
    string: int = Field(ge=1, le=6, strict=True)
    fret: int = Field(ge=0, le=24, strict=True)


NoteRef = PitchRef | PhysicalRef


class NoteGroup(StrictModel):
    id: Identifier
    kind: Literal['noteGroup'] = 'noteGroup'
    label: str = Field(min_length=1, max_length=120)
    notes: list[NoteRef] = Field(min_length=1, max_length=24)


Entity = Scale | Key | Chord | Voicing | Progression | NoteGroup


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
    mode: Literal['notes', 'caged'] | None = None
    comparison: Literal['highlight', 'plain', 'shared-only'] = 'highlight'
    fret_start: int | None = Field(default=None, ge=0, le=19, strict=True)
    fret_end: int | None = Field(default=None, ge=1, le=24, strict=True)

    @model_validator(mode='after')
    def ordered_range(self):
        # null = auto range; only an explicit pair is bounded. The 12-fret cap is
        # gone for the fretboard -- allow the full tiled window.
        if self.fret_start is not None and self.fret_end is not None:
            if not 1 <= self.fret_end - self.fret_start <= 19:
                raise ValueError('Choose a fret range between 2 and 20 frets')
        return self


class Block(StrictModel):
    id: Identifier
    kind: Literal['fretboard', 'degree_strip', 'chord_diagrams', 'circle', 'progression', 'key_family']
    source_id: Identifier | None = None
    sources: list[Identifier] | None = Field(default=None, min_length=1, max_length=8)
    source_roles: dict[str, Literal['primary', 'context', 'highlight']] | None = None
    settings: ViewSettings = Field(default_factory=ViewSettings)

    @model_validator(mode='after')
    def _normalize_sources(self):
        # Accept either the legacy single `source_id` or the new `sources[]`;
        # after validation `sources` is authoritative and `source_id` mirrors sources[0].
        if not self.sources:
            if not self.source_id:
                raise ValueError('A view needs at least one source')
            self.sources = [self.source_id]
        self.source_id = self.sources[0]
        return self


class Placement(StrictModel):
    block_id: Identifier
    span: Literal[4, 6, 8, 12] = 12
    priority: Literal['primary', 'supporting', 'reference'] = 'supporting'


class Row(StrictModel):
    items: list[Placement] = Field(min_length=1, max_length=3)


class ConceptWorkspace(StrictModel):
    schema_version: Literal[2] = 2
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
        source_kinds = {obj.id: obj.kind for obj in [*self.entities, *self.relations]}
        for block in self.blocks:
            accepts = BLOCK_ACCEPTS[block.kind]
            for source_id in block.sources:
                if source_id not in source_kinds:
                    raise ValueError('A view points at a source that no longer exists')
                if source_kinds[source_id] not in accepts:
                    raise ValueError('View is not compatible with its musical source')
            caged_view = block.kind == 'chord_diagrams' or (block.kind == 'fretboard' and block.settings.mode == 'caged')
            if caged_view:
                chords = [entities.get(s) for s in block.sources if isinstance(entities.get(s), Chord)]
                if any(chord.quality not in ('major', 'minor') for chord in chords):
                    raise ValueError('CAGED views support major or minor chords')
                if block.kind == 'fretboard' and not chords:
                    raise ValueError('A CAGED fretboard needs a major or minor chord source')
            first_kind = source_kinds[block.sources[0]]
            derived = block.kind == 'progression' and first_kind == 'key'
            if derived != (block.settings.pattern is not None):
                raise ValueError('A derived Progression view requires a pattern; other views do not')
            comparison_ready = first_kind in ('compare', 'transition') or (
                len(block.sources) == 2 and len({source_kinds[s] for s in block.sources}) == 1)
            if block.settings.comparison == 'shared-only' and not comparison_ready:
                raise ValueError('Shared notes need two same-kind sources or a compare/transition relation')
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
        blocks=[Block(id=fretboard, kind='fretboard', sources=[relation]), Block(id=degrees, kind='degree_strip', sources=[relation])],
        composition=[Row(items=[Placement(block_id=fretboard, priority='primary', span=8), Placement(block_id=degrees, span=4)])])


NATURAL_PITCHES = dict(zip('CDEFGAB', [0, 2, 4, 5, 7, 9, 11]))


def pitch_class(note: str) -> int:
    return (NATURAL_PITCHES[note[0]] + note.count('#') - note.count('b')) % 12


CHROMATIC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
DIATONIC_TRIADS = list(zip(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
                           ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished']))


def chromatic_note(pitch: int) -> dict:
    return {'note': CHROMATIC[pitch % 12], 'degree': '—', 'pitch_class': pitch % 12, 'offset': 0}


def tiled_positions(notes: list[dict], tuning: list[int]) -> list[dict]:
    """Every fret 0-19 where one of ``notes`` falls, spelled as that note."""
    by_pitch = {note['pitch_class']: note for note in notes}
    return [{'string': string, 'fret': fret, 'midi': midi + fret, **by_pitch[(midi + fret) % 12]}
            for string, midi in enumerate(tuning, 1) for fret in range(20) if (midi + fret) % 12 in by_pitch]


def unique_notes(positions: list[dict]) -> list[dict]:
    seen: dict[int, dict] = {}
    for position in positions:
        seen.setdefault(position['pitch_class'], {key: position[key] for key in ('note', 'degree', 'pitch_class', 'offset')})
    return list(seen.values())


def resolve_workspace(workspace: ConceptWorkspace) -> dict:
    """Uniform resolved model: ``{entities: {id: ResolvedEntity}, relations: {id: ResolvedRelation}}``.

    Every entity resolves to the shared core ``{id, kind, label, notes, positions, tuning}``
    plus typed per-kind extras (spec #88 §5).
    """
    from app.v2.concepts import CIRCLE_KEYS
    from app.v2.workspace_caged import chord_caged_regions
    from app.v2.workspace_progressions import resolve_progressions
    tuning = workspace.tuning
    entities: dict[str, dict] = {}
    by_id = {entity.id: entity for entity in workspace.entities}

    for entity in workspace.entities:
        if isinstance(entity, Scale):
            notes = spelled_notes(entity.root, SCALE_INTERVALS[entity.mode], SCALE_DEGREE_NAMES[entity.mode])
            label = entity.label or f"{entity.root} {entity.mode.replace('natural_minor', 'minor').replace('_', ' ')}"
            entities[entity.id] = {'id': entity.id, 'kind': 'scale', 'label': label, 'notes': notes,
                'positions': tiled_positions(notes, tuning), 'tuning': tuning}
        elif isinstance(entity, Key):
            notes = spelled_notes(entity.root, [0, 2, 4, 5, 7, 9, 11], ['1', '2', '3', '4', '5', '6', '7'])
            entities[entity.id] = {'id': entity.id, 'kind': 'key', 'label': f'{entity.root} major', 'notes': notes,
                'positions': tiled_positions(notes, tuning), 'tuning': tuning,
                'circle': [entity.root if pitch_class(name) == pitch_class(entity.root) else name for name in CIRCLE_KEYS],
                'diatonicChords': [{'numeral': numeral, 'root': notes[index]['note'], 'quality': quality}
                                   for index, (numeral, quality) in enumerate(DIATONIC_TRIADS)]}
        elif isinstance(entity, Chord):
            formula = CHORD_INTERVALS[entity.quality]
            notes = spelled_notes(entity.root, formula['intervals'], formula['names'])
            resolved = {'id': entity.id, 'kind': 'chord', 'label': f'{entity.root} {entity.quality}', 'notes': notes,
                'positions': tiled_positions(notes, tuning), 'tuning': tuning, 'quality': entity.quality}
            if entity.quality in ('major', 'minor'):
                resolved['cagedRegions'] = chord_caged_regions(entity, tuning)
            entities[entity.id] = resolved

    for entity in workspace.entities:
        if isinstance(entity, Voicing):
            entities[entity.id] = resolve_voicing(entity, entities)
        elif isinstance(entity, NoteGroup):
            entities[entity.id] = resolve_note_group(entity, tuning)

    for progression_id, resolved in resolve_progressions(workspace, entities).items():
        entities[progression_id] = resolved

    relations: dict[str, dict] = {}
    for relation in workspace.relations:
        if isinstance(relation, Compare):
            first, second = [entities[id]['notes'] for id in relation.entity_ids]
            first_pitches = {note['pitch_class'] for note in first}
            second_pitches = {note['pitch_class'] for note in second}
            relations[relation.id] = {'kind': 'compare', 'entity_ids': list(relation.entity_ids),
                'shared': [note['pitch_class'] for note in first if note['pitch_class'] in second_pitches],
                'removed': [note for note in first if note['pitch_class'] not in second_pitches],
                'added': [note for note in second if note['pitch_class'] not in first_pitches]}
        else:
            relations[relation.id] = resolve_transition(relation, entities, by_id)

    return {'entities': entities, 'relations': relations}


def resolve_transition(relation: 'Transition', entities: dict, by_id: dict) -> dict:
    first, second = [entities[id] for id in relation.entity_ids]
    a, b = [{p['pitch_class'] for p in v['positions']} for v in (first, second)]
    key_notes = entities[relation.key_id]['notes']
    functions = []
    for v in (first, second):
        chord = entities.get(v['chord_id'])
        functions.append(harmonic_function({'root': chord['notes'][0]['note'], 'quality': chord['quality']}, key_notes) if chord else 'unnamed')
    home_key = functions == ['V', 'I'] and by_id[relation.key_id].root == 'G'
    return {'kind': 'transition', 'entity_ids': list(relation.entity_ids), 'key_id': relation.key_id,
        'label': f"{first['label']} → {second['label']}", 'functions': functions,
        'shared': sorted(a & b), 'removed': sorted(a - b), 'added': sorted(b - a),
        'movement': physical_movement(first, second),
        'explanation': 'D builds expectation; G feels like home in G major. Hear the two shapes, then inspect what stays or moves.'
        if home_key else 'Hear these shapes in the key context; inspect each string to see what stays or moves.'}


def resolve_note_group(entity: NoteGroup, tuning: list[int]) -> dict:
    positions: list[dict] = []
    for ref in entity.notes:
        if isinstance(ref, PitchRef):
            positions.extend({'string': string, 'fret': fret, 'midi': midi + fret, **chromatic_note(ref.pitch_class)}
                             for string, midi in enumerate(tuning, 1) for fret in range(20) if (midi + fret) % 12 == ref.pitch_class)
        else:
            midi = tuning[ref.string - 1] + ref.fret
            positions.append({'string': ref.string, 'fret': ref.fret, 'midi': midi, **chromatic_note(midi)})
    return {'id': entity.id, 'kind': 'noteGroup', 'label': entity.label, 'notes': unique_notes(positions),
        'positions': positions, 'tuning': tuning}



def physical_resolution() -> ConceptWorkspace:
    from app.v2.concepts import CAGED_POSITIONS
    key, d, g, dv, gv, transition, fret, diagrams, circle = [uuid4().hex for _ in range(9)]
    tuning = [64, 59, 55, 50, 45, 40]
    return ConceptWorkspace(title='Why D resolves to G', provenance='physical-resolution', entities=[
        Key(id=key, root='G'), Chord(id=d, root='D', quality='major'), Chord(id=g, root='G', quality='major'),
        Voicing(id=dv, chord_id=d, label='D open', tuning=tuning, positions=[Position(string=s, fret=f) for s, f in CAGED_POSITIONS['major']['D']]),
        Voicing(id=gv, chord_id=g, label='G open', tuning=tuning, positions=[Position(string=s, fret=f) for s, f in CAGED_POSITIONS['major']['G']])],
        relations=[Transition(id=transition, entity_ids=[dv, gv], key_id=key)],
        blocks=[Block(id=diagrams, kind='chord_diagrams', sources=[dv, gv]), Block(id=fret, kind='fretboard', sources=[transition]), Block(id=circle, kind='circle', sources=[key])],
        composition=[Row(items=[Placement(block_id=diagrams, priority='primary', span=6), Placement(block_id=circle, span=6)]), Row(items=[Placement(block_id=fret)])])


def spelled_notes(root: str, offsets: list[int], degrees: list[str]) -> list[dict]:
    notes = []
    for offset, degree in zip(offsets, degrees):
        pitch = (pitch_class(root) + offset) % 12
        letter = 'CDEFGAB'[('CDEFGAB'.index(root[0]) + int(degree.lstrip('b#')) - 1) % 7]
        accidental = (pitch - NATURAL_PITCHES[letter] + 6) % 12 - 6
        notes.append({'note': letter + ('#' * accidental if accidental > 0 else 'b' * -accidental), 'degree': degree, 'pitch_class': pitch, 'offset': offset})
    return notes


def resolve_voicing(entity: Voicing, entities: dict) -> dict:
    context = entities.get(entity.chord_id or '', {})
    notes = {n['pitch_class']: n for n in context.get('notes', [])}
    positions = []
    for p in entity.positions:
        midi = entity.tuning[p.string - 1] + p.fret
        note = notes.get(midi % 12) or chromatic_note(midi)
        positions.append(p.model_dump() | note | {'midi': midi})
    return {'id': entity.id, 'kind': 'voicing', 'label': entity.label, 'notes': unique_notes(positions),
        'chord_id': entity.chord_id, 'tuning': entity.tuning, 'positions': positions}

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
