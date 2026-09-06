"""Learner-owned Progression edits, shared with the Tutor's typed dispatch."""
from pydantic import Field
from app.v2.workspace import StrictModel
from app.v2.harmony_state import ChordRef, TonalCenter, Tuning, VoicingValue
from app.v2.progression_state import ProgressionWorkspaceState, ProgressionStep, ProgressionFocus, reconcile_focus


class ProgressionEdit(StrictModel):
    active_idea_id: str | None = None
    focus: ProgressionFocus | None = None
    label: str | None = None
    tonal_center: TonalCenter | None = None
    tuning: Tuning | None = None
    step_id: str | None = None
    chord: ChordRef | None = None
    duration_beats: int | None = Field(default=None, ge=1, le=64, strict=True)
    voicing: VoicingValue | None = None
    order: list[str] | None = None
    add: ChordRef | None = None
    remove: str | None = None


def edit_progression(workspace: ProgressionWorkspaceState, edit: ProgressionEdit) -> ProgressionWorkspaceState:
    data = workspace.model_dump()
    if edit.active_idea_id is not None:
        data['active_idea_id'] = edit.active_idea_id
    if 'focus' in edit.model_fields_set:
        data['focus'] = edit.focus.model_dump() if edit.focus else None
    idea = next((idea for idea in data['ideas'] if idea['id'] == data['active_idea_id']), None)
    musical = edit.model_fields_set - {'active_idea_id', 'focus', 'step_id'}
    if musical and idea is None:
        raise ValueError('Choose an idea')
    if musical:
        for key in ('label', 'tonal_center', 'tuning'):
            if key in edit.model_fields_set:
                value = getattr(edit, key)
                idea[key] = value.model_dump() if hasattr(value, 'model_dump') else value
        if edit.tuning is not None:
            for step in idea['chords']:
                if step['voicing'] and step['voicing']['tuning'] != edit.tuning:
                    step['voicing'] = None
        if edit.add:
            idea['chords'].append(ProgressionStep(**edit.add.model_dump()).model_dump())
        if edit.remove:
            if not any(step['id'] == edit.remove for step in idea['chords']):
                raise ValueError('Step not found')
            idea['chords'] = [step for step in idea['chords'] if step['id'] != edit.remove]
        if edit.order is not None:
            by_id = {step['id']: step for step in idea['chords']}
            if len(edit.order) != len(by_id) or set(edit.order) != set(by_id):
                raise ValueError('Reorder must include every step exactly once')
            idea['chords'] = [by_id[id] for id in edit.order]
        if edit.model_fields_set & {'chord', 'duration_beats', 'voicing'}:
            step = next((step for step in idea['chords'] if step['id'] == edit.step_id), None)
            if step is None:
                raise ValueError('Step not found')
            if edit.chord:
                step.update(edit.chord.model_dump()); step['voicing'] = None
            if edit.duration_beats is not None:
                step['duration_beats'] = edit.duration_beats
            if 'voicing' in edit.model_fields_set:
                step['voicing'] = edit.voicing.model_dump() if edit.voicing else None
        idea['dirty'] = True
    return reconcile_focus(data, workspace.active_idea_id)
