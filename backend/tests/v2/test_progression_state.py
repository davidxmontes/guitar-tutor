import pytest
from app.v2.progression_state import ProgressionIdeaDraft, ProgressionWorkspaceState, reconcile_focus
from app.v2.progression import resolve_progression


def idea(**fields):
    return ProgressionIdeaDraft(label='Cadence', chords=[{'id': 'a', 'root': 'G', 'quality': 'major', 'duration_beats': 4}, {'id': 'b', 'root': 'C', 'quality': 'major', 'duration_beats': 2}], **fields)


def test_resolve_function_and_assigned_motion():
    value = idea()
    assert resolve_progression(value)['key_status'] == 'Set a key'
    value = ProgressionIdeaDraft.model_validate(value.model_dump() | {'tonal_center': {'root': 'C', 'scale': 'major'}})
    resolved = resolve_progression(value)
    assert [step['function'] for step in resolved['steps']] == ['V', 'I']
    assert all(step['positions'] for step in resolved['steps'])
    assert resolved['transitions'][0]['movement'] == []
    data = value.model_dump()
    for step, fret in zip(data['chords'], [3, 0]):
        step['voicing'] = {'positions': [{'string': 1, 'fret': fret}], 'tuning': value.tuning}
    resolved = resolve_progression(ProgressionIdeaDraft.model_validate(data))
    assert resolved['steps'][0]['positions'][0]['fret'] == 3
    assert resolved['transitions'][0]['movement'][0]['semitones'] == -3


def test_focus_reconciliation_and_strict_state():
    a, b = idea(), idea()
    workspace = ProgressionWorkspaceState(ideas=[a, b], active_idea_id=a.id, focus={'kind': 'step', 'step_id': 'a'})
    data = workspace.model_dump()
    data['ideas'][0]['chords'].reverse()
    assert reconcile_focus(data, workspace.active_idea_id).focus.step_id == 'a'
    data['focus'] = {'kind': 'transition', 'from_step_id': 'a', 'to_step_id': 'b'}
    assert reconcile_focus(data, workspace.active_idea_id).focus is None
    data['focus'] = {'kind': 'step', 'step_id': 'a'}
    data['active_idea_id'] = b.id
    assert reconcile_focus(data, workspace.active_idea_id).focus is None
    data['active_idea_id'] = a.id
    data['ideas'][0]['chords'] = []
    assert reconcile_focus(data, a.id).focus is None
    with pytest.raises(ValueError):
        ProgressionIdeaDraft(label='Invalid', chords=[{'root': 'C', 'quality': 'major', 'duration_beats': 0}])
    invalid = a.model_dump(); invalid['chords'][0]['tuning'] = a.tuning
    with pytest.raises(ValueError):
        ProgressionIdeaDraft.model_validate(invalid)
