"""The Scale/Compare tracer bullet: typed musical truth and deterministic facts."""
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.music.scales import SCALE_INTERVALS, SCALE_DEGREE_NAMES

Pitch = Annotated[str, Field(pattern=r'^[A-G](#{1,2}|b{1,2})?$')]
Identifier = Annotated[str, Field(min_length=1, max_length=80)]
Midi = Annotated[int, Field(strict=True, ge=0, le=127)]
Mode = Literal['major', 'natural_minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'harmonic_minor', 'melodic_minor', 'pentatonic_major', 'pentatonic_minor', 'blues']
BLOCK_SOURCES = {'fretboard': ('scale', 'compare'), 'degree_strip': ('scale', 'compare')}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Scale(StrictModel):
    id: Identifier
    kind: Literal['scale'] = 'scale'
    root: Pitch
    mode: Mode


class Compare(StrictModel):
    id: Identifier
    kind: Literal['compare'] = 'compare'
    entity_ids: list[Identifier] = Field(min_length=2, max_length=2)


class ViewSettings(StrictModel):
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
    kind: Literal['fretboard', 'degree_strip']
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
    provenance: Literal['scale-comparison'] = 'scale-comparison'
    tuning: list[Midi] = Field(default_factory=lambda: [64, 59, 55, 50, 45, 40], min_length=6, max_length=6)
    entities: list[Scale] = Field(min_length=1, max_length=12)
    relations: list[Compare] = Field(default_factory=list, max_length=12)
    blocks: list[Block] = Field(max_length=12)
    composition: list[Row] = Field(max_length=12)

    @model_validator(mode='after')
    def coherent_workspace(self):
        objects = [*self.entities, *self.relations, *self.blocks]
        if len({obj.id for obj in objects}) != len(objects):
            raise ValueError('Workspace IDs must be unique')
        entities = {entity.id: entity for entity in self.entities}
        for relation in self.relations:
            if len(set(relation.entity_ids)) != 2 or any(id not in entities for id in relation.entity_ids):
                raise ValueError('Compare requires two distinct Scale entities')
        sources = {obj.id: obj.kind for obj in [*self.entities, *self.relations]}
        for block in self.blocks:
            if sources.get(block.source_id) not in BLOCK_SOURCES[block.kind]:
                raise ValueError('View is not compatible with its musical source')
            if block.settings.shared_only and sources[block.source_id] != 'compare':
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
        composition=[Row(items=[Placement(block_id=fretboard, priority='primary')]), Row(items=[Placement(block_id=degrees)])])


NATURAL_PITCHES = dict(zip('CDEFGAB', [0, 2, 4, 5, 7, 9, 11]))


def pitch_class(note: str) -> int:
    return (NATURAL_PITCHES[note[0]] + note.count('#') - note.count('b')) % 12


def resolve_workspace(workspace: ConceptWorkspace) -> dict:
    scales = {}
    for entity in workspace.entities:
        root = pitch_class(entity.root)
        notes = []
        for offset, degree in zip(SCALE_INTERVALS[entity.mode], SCALE_DEGREE_NAMES[entity.mode]):
            pitch = (root + offset) % 12
            letter = 'CDEFGAB'[('CDEFGAB'.index(entity.root[0]) + int(degree[-1]) - 1) % 7]
            accidental = (pitch - NATURAL_PITCHES[letter] + 6) % 12 - 6
            spelling = letter + ('#' * accidental if accidental > 0 else 'b' * -accidental)
            notes.append({'note': spelling, 'degree': degree, 'pitch_class': pitch, 'offset': offset})
        by_pitch = {note['pitch_class']: note for note in notes}
        positions = [{'string': string, 'fret': fret, 'midi': midi + fret, **by_pitch[(midi + fret) % 12]}
                     for string, midi in enumerate(workspace.tuning, 1) for fret in range(25) if (midi + fret) % 12 in by_pitch]
        # Same register for both scales makes the comparison audible; choose real positions in the active tuning.
        tonic = min(workspace.tuning) + (root - min(workspace.tuning)) % 12
        playback = []
        for offset in [*SCALE_INTERVALS[entity.mode], 12]:
            midi = tonic + offset
            choices = [p for p in positions if p['midi'] == midi]
            if not choices:
                raise ValueError('This tuning cannot play the scale in one octave; choose a closer tuning')
            playback.append(min(choices, key=lambda p: (p['fret'], -p['string'])))
        scales[entity.id] = {'label': f"{entity.root} {entity.mode.replace('natural_minor', 'minor').replace('_', ' ')}", 'notes': notes, 'positions': positions, 'playback': playback}
    comparisons = {}
    for relation in workspace.relations:
        first, second = [scales[id]['notes'] for id in relation.entity_ids]
        first_pitches, second_pitches = [{n['pitch_class'] for n in notes} for notes in (first, second)]
        comparisons[relation.id] = {'shared': [n['pitch_class'] for n in first if n['pitch_class'] in second_pitches],
            'removed': [n for n in first if n['pitch_class'] not in second_pitches], 'added': [n for n in second if n['pitch_class'] not in first_pitches]}
    return {'scales': scales, 'comparisons': comparisons, 'block_sources': BLOCK_SOURCES}
