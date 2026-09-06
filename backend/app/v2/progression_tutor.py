"""Progression Tutor commands, resolved candidates and value-only handoffs."""
from typing import Annotated, Literal
from pydantic import Field
from app.v2.workspace import StrictModel
from app.v2.harmony_state import ChordRef, TonalCenter, VoicingValue
from app.v2.harmony_actions import Noop, SetTonalCenter, SetScale, SetTuning, AddKeptNoteGroup, ScratchAdd, ScratchRemove, ScratchReorder
from app.v2.progression_actions import ProgressionEdit, edit_progression
from app.v2.progression_state import ProgressionIdeaDraft, ProgressionWorkspaceState
from app.v2.harmony import chord_voicings


class AddStep(StrictModel):
    kind: Literal['progression_add']
    chord: ChordRef


class RemoveStep(StrictModel):
    kind: Literal['progression_remove']
    step_id: str


class ReorderSteps(StrictModel):
    kind: Literal['progression_reorder']
    ids: list[str]


class EditStep(StrictModel):
    kind: Literal['progression_edit']
    step_id: str
    chord: ChordRef


class SetDuration(StrictModel):
    kind: Literal['set_duration']
    step_id: str
    duration_beats: int = Field(ge=1, le=64, strict=True)


class AssignStepVoicing(StrictModel):
    kind: Literal['assign_step_voicing']
    step_id: str
    voicing_label: str  # A command selecting trusted resolved material, never stored as a reference.


class Transpose(StrictModel):
    kind: Literal['transpose']
    semitones: int = Field(ge=-24, le=24, strict=True)
    tonal_center: TonalCenter | None = None


TutorMutation = Annotated[Noop | SetTonalCenter | SetScale | SetTuning | AddKeptNoteGroup | ScratchAdd | ScratchRemove | ScratchReorder | AddStep | RemoveStep | ReorderSteps | EditStep | SetDuration | AssignStepVoicing | Transpose, Field(discriminator='kind')]


def mutate_progression(workspace, mutation):
    idea = next((idea for idea in workspace.ideas if idea.id == workspace.active_idea_id), None)
    if idea is None:
        raise ValueError('Choose an idea')
    kind = mutation.kind
    if kind == 'set_tonal_center': fields = {'tonal_center': mutation.tonal_center}
    elif kind == 'set_scale':
        if idea.tonal_center is None: raise ValueError('Set a key first')
        fields = {'tonal_center': {'root': idea.tonal_center.root, 'scale': mutation.scale}}
    elif kind == 'set_tuning': fields = {'tuning': mutation.tuning}
    elif kind == 'progression_add': fields = {'add': mutation.chord}
    elif kind == 'progression_remove': fields = {'remove': mutation.step_id}
    elif kind == 'progression_reorder': fields = {'order': mutation.ids}
    elif kind == 'progression_edit': fields = {'step_id': mutation.step_id, 'chord': mutation.chord}
    elif kind == 'set_duration': fields = {'step_id': mutation.step_id, 'duration_beats': mutation.duration_beats}
    elif kind == 'assign_step_voicing':
        step = next((step for step in idea.chords if step.id == mutation.step_id), None)
        if step is None: raise ValueError('Step not found')
        value = next((value for value in chord_voicings(step, idea.tuning) if value['label'] == mutation.voicing_label), None)
        if value is None: raise ValueError('Resolved voicing label not found')
        fields = {'step_id': step.id, 'voicing': VoicingValue(positions=[{'string': p['string'], 'fret': p['fret']} for p in value['positions']], tuning=value['tuning'])}
    elif kind in ('add_kept_note_group', 'transpose'):
        data = workspace.model_dump()
        target = next(item for item in data['ideas'] if item['id'] == idea.id)
        if kind == 'add_kept_note_group':
            target['kept_note_groups'] = [group for group in target['kept_note_groups'] if group['id'] != mutation.group.id] + [mutation.group.model_dump()]
        else:
            from app.v2.workspace import pitch_class
            from app.music.chords import index_to_note
            if target['tonal_center']:
                target['tonal_center']['root'] = index_to_note(pitch_class(target['tonal_center']['root']) + mutation.semitones)
            if mutation.tonal_center is not None: target['tonal_center'] = mutation.tonal_center.model_dump()
            for step in target['chords']:
                step['root'] = index_to_note(pitch_class(step['root']) + mutation.semitones)
                if step['voicing']:
                    for position in step['voicing']['positions']: position['fret'] += mutation.semitones
                    try: VoicingValue.model_validate(step['voicing'])
                    except ValueError: step['voicing'] = None
        target['dirty'] = True
        return ProgressionWorkspaceState.model_validate(data)
    else: raise ValueError('Mutation outside Progression capabilities')
    return edit_progression(workspace, ProgressionEdit(**fields))


class CandidateChord(ChordRef):
    duration_beats: int = Field(default=4, ge=1, le=64, strict=True)


class IdeaCandidate(StrictModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=200)
    chords: list[CandidateChord] = Field(min_length=1, max_length=64)
    tonal_center: TonalCenter | None = None


class ReplacementCandidate(StrictModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=200)
    step_id: str
    chord: ChordRef


def preview(idea):
    from app.v2.progression import resolve_progression
    return [{'label': f"{step['root']} {step['quality']}", 'positions': step['positions'], 'tuning': idea.tuning, 'beats': step['duration_beats']}
            for step in resolve_progression(idea)['steps']]


def resolve_candidates(branch, candidate_set):
    workspace = branch.progression_workspace
    active = next((idea for idea in workspace.ideas if idea.id == workspace.active_idea_id), None)
    if active is None: raise ValueError('Choose an idea')
    resolved = []
    for raw in candidate_set.candidates:
        if candidate_set.candidate_kind == 'progression-idea':
            value = IdeaCandidate.model_validate(raw)
            idea = ProgressionIdeaDraft(label=value.label, chords=[chord.model_dump() for chord in value.chords], tuning=active.tuning,
                tonal_center=value.tonal_center if 'tonal_center' in value.model_fields_set else active.tonal_center)
            resolved.append({'id': value.id, 'label': value.label, 'idea': idea.model_dump(), 'preview': preview(idea)})
        else:
            value = ReplacementCandidate.model_validate(raw)
            if not any(step.id == value.step_id for step in active.chords): raise ValueError('Replacement step not found')
            resolved.append(value.model_dump() | {'idea_id': active.id, 'preview': preview(ProgressionIdeaDraft(label=value.label, tuning=active.tuning, chords=[value.chord.model_dump()]))})
    if len({value['id'] for value in resolved}) != len(resolved): raise ValueError('Duplicate candidate ID')
    candidate_set.candidates = resolved


def keep_candidate(branch, kind, candidate):
    updated = branch.model_copy(deep=True)
    workspace = updated.progression_workspace or ProgressionWorkspaceState()
    if kind == 'progression-idea':
        idea = ProgressionIdeaDraft.model_validate(candidate['idea'])
        if not any(value.id == idea.id for value in workspace.ideas): workspace.ideas.append(idea)
        workspace.active_idea_id = idea.id; workspace.focus = None
    elif kind == 'chord-replacement':
        if workspace.active_idea_id != candidate['idea_id']: raise ValueError('Return to the candidate’s original idea')
        workspace = edit_progression(workspace, ProgressionEdit(step_id=candidate['step_id'], chord=candidate['chord']))
    else: raise ValueError('Unsupported candidate kind')
    updated.progression_workspace = workspace
    updated.active_workspace = 'progression'
    return updated


def develop_harmony(branch):
    harmony = branch.harmony_exploration
    if harmony is None or not harmony.scratch: raise ValueError('Add scratch chords before developing')
    idea = ProgressionIdeaDraft(label='Developed scratch', tonal_center=harmony.tonal_center, tuning=harmony.tuning,
        chords=[{'root': chord.root, 'quality': chord.quality, 'duration_beats': 4} for chord in harmony.scratch],
        provenance={'kind': 'harmony-develop', 'scratch': [chord.model_dump() for chord in harmony.scratch], 'tonal_center': harmony.tonal_center})
    updated = keep_candidate(branch, 'progression-idea', {'idea': idea.model_dump()})
    updated.live_presentation_turn_id = None
    return updated
