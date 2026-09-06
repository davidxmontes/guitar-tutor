"""System-owned discovery metadata and typed slots for proven journeys."""
from typing import Literal, get_args
from pydantic import model_validator
from app.v2.workspace import Mode, StrictModel, scale_comparison, physical_resolution
from app.v2.workspace_caged import caged_starter
from app.v2.workspace_progressions import progression_starter
from app.v2.concepts import SCALE_NAMES, DEFAULT_COMPARISONS


class OpenWorkspaceRequest(StrictModel):
    recipe: Literal['scale-comparison', 'physical-resolution', 'four-chord-progression', 'caged-exploration']
    mode: Mode | None = None

    @model_validator(mode='after')
    def compatible_slots(self):
        if self.mode is not None and self.recipe != 'scale-comparison':
            raise ValueError('A scale choice requires a scale exploration')
        return self


def open_recipe(request: OpenWorkspaceRequest):
    workspace = {'scale-comparison':scale_comparison, 'physical-resolution':physical_resolution,
        'four-chord-progression':progression_starter, 'caged-exploration':caged_starter}[request.recipe]()
    if request.mode:
        workspace.entities[0].mode = request.mode
        workspace.entities[1].mode = DEFAULT_COMPARISONS[request.mode]
        workspace.title = f'G {SCALE_NAMES[request.mode]} exploration'
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
