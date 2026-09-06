"""Direct Harmony musical edits; no derived shapes cross the mutation boundary."""
from typing import Annotated, Literal
from uuid import uuid4
from pydantic import Field
from app.v2.workspace import StrictModel, NoteGroup, PitchRef, Identifier
from app.v2.harmony_state import ChordRef, TonalCenter, Tuning, HarmonyExploration
from app.v2.harmony import change_subject, change_tuning, add_kept_note_group


class Noop(StrictModel):
    kind: Literal['noop'] = 'noop'


class SetTonalCenter(StrictModel):
    kind: Literal['set_tonal_center']
    tonal_center: TonalCenter | None


class SetScale(StrictModel):
    kind: Literal['set_scale']
    scale: str


class SetTuning(StrictModel):
    kind: Literal['set_tuning']
    tuning: Tuning


class ScratchAdd(StrictModel):
    kind: Literal['scratch_add']
    chord: ChordRef


class ScratchRemove(StrictModel):
    kind: Literal['scratch_remove']
    id: Identifier


class ScratchReorder(StrictModel):
    kind: Literal['scratch_reorder']
    ids: list[Identifier]


class PitchNoteGroup(NoteGroup):
    notes: list[PitchRef] = Field(min_length=1, max_length=24)


class AddKeptNoteGroup(StrictModel):
    kind: Literal['add_kept_note_group']
    group: PitchNoteGroup


HarmonyMutation = Annotated[Noop | SetTonalCenter | SetScale | SetTuning | ScratchAdd | ScratchRemove | ScratchReorder | AddKeptNoteGroup, Field(discriminator='kind')]


def mutate_harmony(state: HarmonyExploration, mutation: HarmonyMutation) -> HarmonyExploration:
    if mutation.kind == 'noop':
        return state.model_copy(deep=True)
    if mutation.kind == 'set_tonal_center':
        return change_subject(state, mutation.tonal_center)
    if mutation.kind == 'set_scale':
        if state.tonal_center is None:
            raise ValueError('Set a tonal centre before changing its scale')
        return change_subject(state, TonalCenter(root=state.tonal_center.root, scale=mutation.scale))
    if mutation.kind == 'set_tuning':
        return change_tuning(state, mutation.tuning)
    if mutation.kind == 'add_kept_note_group':
        return add_kept_note_group(state, mutation.group)
    data = state.model_dump()
    if mutation.kind == 'scratch_add':
        data['scratch'].append({'id': uuid4().hex, **mutation.chord.model_dump()})
    elif mutation.kind == 'scratch_remove':
        if not any(item['id'] == mutation.id for item in data['scratch']):
            raise ValueError('Scratch chord not found')
        data['scratch'] = [item for item in data['scratch'] if item['id'] != mutation.id]
    elif mutation.kind == 'scratch_reorder':
        by_id = {item['id']: item for item in data['scratch']}
        if len(mutation.ids) != len(by_id) or set(mutation.ids) != set(by_id):
            raise ValueError('Reorder must include every scratch chord exactly once')
        data['scratch'] = [by_id[id] for id in mutation.ids]
    return HarmonyExploration.model_validate(data)


def explore_harmony(branch, subject: ChordRef | TonalCenter, confirmed: bool = False):
    state = branch.harmony_exploration or HarmonyExploration()
    if isinstance(subject, TonalCenter):
        if state.tonal_center is not None and state.tonal_center != subject and not confirmed:
            return branch, True
        state = change_subject(state, subject)
    else:
        state = HarmonyExploration.model_validate(state.model_dump() | {'focus': {'kind': 'chord', 'chord': subject}})
    updated = branch.model_copy(deep=True)
    updated.harmony_exploration = state
    updated.active_workspace = 'harmony'
    return updated, False
