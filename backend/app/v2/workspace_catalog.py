"""System-owned discovery metadata and typed slots for proven journeys."""
from uuid import uuid4
from typing import Literal, get_args
from pydantic import model_validator
from app.v2.workspace import Mode, Pitch, Block, Row, Placement, StrictModel, scale_comparison, physical_resolution
from app.v2.workspace_caged import caged_starter
from app.v2.workspace_progressions import progression_starter
from app.v2.concepts import SCALE_NAMES, DEFAULT_COMPARISONS


class OpenWorkspaceRequest(StrictModel):
    recipe: Literal['scale-comparison', 'physical-resolution', 'four-chord-progression', 'caged-exploration']
    mode: Mode | None = None
    root: Pitch | None = None
    quality: Literal['major','minor'] | None = None

    @model_validator(mode='after')
    def compatible_slots(self):
        if self.mode is not None and self.recipe != 'scale-comparison':
            raise ValueError('A scale choice requires a scale exploration')
        if self.root is not None and self.recipe == 'physical-resolution':
            raise ValueError('The D-to-G starter has fixed physical voicings')
        if self.quality is not None and self.recipe != 'caged-exploration':
            raise ValueError('Chord quality requires CAGED exploration')
        return self


def open_recipe(request: OpenWorkspaceRequest):
    workspace = {'scale-comparison':scale_comparison, 'physical-resolution':physical_resolution,
        'four-chord-progression':progression_starter, 'caged-exploration':caged_starter}[request.recipe]()
    if request.mode:
        workspace.entities[0].mode = request.mode
        workspace.entities[1].mode = DEFAULT_COMPARISONS[request.mode]
        workspace.title = f'G {SCALE_NAMES[request.mode]} exploration'
    if request.root:
        for entity in workspace.entities:
            entity.root = request.root
        workspace.title = workspace.title.replace('G ', request.root + ' ', 1) if request.recipe == 'scale-comparison' else f'{request.root} · {workspace.title}'
    if request.quality:
        workspace.entities[0].quality = request.quality
    return workspace


def explore_catalog():
    entries = [
        ('scale-comparison','Explore major vs minor','How does major sound different from minor?','Hear two scales, then find the changed notes.','scale major minor compare'),
        ('physical-resolution','Why does D resolve to G?','Why does one chord lead to another?','Hear the change and follow each finger.','chord resolution transition voice leading circle fifths harmony'),
        ('caged-exploration','Connect CAGED shapes','How does one chord connect across the neck?','Compare neighboring shapes and keep one to play.','caged chord shapes regions fretboard'),
        ('four-chord-progression','Explore I–V–vi–IV','How do four chords become a song?','Hear a familiar pattern, then change a chord.','progression four chords 1 5 6 4 I V vi IV'),
    ]
    result = [dict(id=id,title=title,question=question,description=description,search=search,starter=True,request=OpenWorkspaceRequest(recipe=id).model_dump(exclude_none=True)) for id,title,question,description,search in entries]
    for mode in get_args(Mode):
        result.append(dict(id='scale-'+mode,title=SCALE_NAMES[mode],question='',description='Hear this scale beside a related scale and explore the differences.',
            search=mode.replace('_',' ') + (' ionian' if mode == 'major' else ' aeolian' if mode == 'natural_minor' else ''),starter=False,
            request=OpenWorkspaceRequest(recipe='scale-comparison',mode=mode).model_dump(exclude_none=True)))
    return result


def concept_recipe(concept_id: str, root: str):
    mode = {'ionian':'major','aeolian':'natural_minor'}.get(concept_id, concept_id)
    if mode in get_args(Mode):
        return open_recipe(OpenWorkspaceRequest(recipe='scale-comparison', mode=mode, root=root))
    if concept_id in ('caged','chord_major','chord_minor'):
        return open_recipe(OpenWorkspaceRequest(recipe='caged-exploration', root=root, quality='minor' if concept_id == 'chord_minor' else 'major'))
    if concept_id == 'circle':
        workspace = open_recipe(OpenWorkspaceRequest(recipe='four-chord-progression', root=root))
        block = Block(id=uuid4().hex,kind='circle',source_id=workspace.entities[0].id)
        workspace.blocks.insert(0,block); workspace.composition.insert(0,Row(items=[Placement(block_id=block.id,priority='primary')]))
        workspace.title = f'{root} major harmony'
        return workspace
    raise ValueError('This concept is not supported. Choose a supported exploration from Explore.')
