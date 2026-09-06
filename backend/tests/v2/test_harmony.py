from copy import deepcopy
import pytest
from pydantic import ValidationError
from app.v2.models import HarmonyExploration
from app.v2.harmony import resolve_harmony, change_subject, transpose, change_tuning, pin_voicing, unpin_voicing, add_kept_note_group

TUNING = [64, 59, 55, 50, 45, 40]
VOICING = {'positions': [{'string': 1, 'fret': 0}, {'string': 2, 'fret': 1}, {'string': 3, 'fret': 0}], 'tuning': TUNING}
CHORD = {'root': 'C', 'quality': 'major'}


def test_harmony_derives_spelled_scale_palette_and_focused_chord():
    state = HarmonyExploration(tonal_center={'root': 'F#', 'scale': 'major'}, focus={'kind': 'chord', 'chord': CHORD})
    resolved = resolve_harmony(state)
    assert [note['note'] for note in resolved['degrees']] == ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']
    assert [chord['quality'] for chord in resolved['palette']] == ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished']
    assert len(resolved['caged_regions']) == 5
    assert resolved['circle']['home'] == 'F#'
    for position in resolved['scale_positions']:
        assert position['pitch_class'] in {6, 8, 10, 11, 1, 3, 5}
        assert 0 <= position['fret'] <= 19
        assert position['midi'] == TUNING[position['string'] - 1] + position['fret']
    assert {position['pitch_class'] for position in resolved['chord_positions']} == {0, 4, 7}


def test_no_key_is_inferred_and_concrete_voicing_is_exact():
    state = HarmonyExploration(focus={'kind': 'voicing', 'chord': CHORD, 'voicing': VOICING})
    resolved = resolve_harmony(state)
    assert resolved['palette'] == [] and resolved['degrees'] == [] and resolved['circle'] is None
    assert [(p['string'], p['fret']) for p in resolved['voicing_positions']] == [(1, 0), (2, 1), (3, 0)]


@pytest.mark.parametrize('invalid', [
    {'tonal_center': {'root': 'H', 'scale': 'major'}},
    {'tonal_center': {'root': 'C', 'scale': 'made-up'}},
    {'focus': {'kind': 'degree', 'degree': 8}},
    {'scratch': [{'id': 'one', 'root': 'C', 'quality': 'made-up'}]},
    {'scratch': [{'id': 'one', **CHORD, 'duration_beats': 4}]},
    {'tuning': [64, 59, 55, 50, 45, -1]},
    {'provenance': {'kind': 'live-pointer', 'id': 'x'}},
])
def test_harmony_models_reject_invalid_state(invalid):
    with pytest.raises(ValidationError):
        HarmonyExploration(**invalid)


def test_focus_changes_only_for_subject_or_invalid_physical_realization():
    state = HarmonyExploration(tonal_center={'root': 'A', 'scale': 'dorian'}, focus={'kind': 'degree', 'degree': 6},
                               scratch=[{'id': 'one', 'root': 'A', 'quality': 'minor'}])
    moved = transpose(state, 2)
    assert moved.tonal_center.root == 'B' and moved.focus.degree == 6
    assert moved.scratch[0].id == 'one' and moved.scratch[0].root == 'B'
    assert state.scratch[0].root == 'A'
    assert change_subject(state, {'root': 'C', 'scale': 'major'}).focus.kind == 'scale'
    focused = HarmonyExploration(focus={'kind': 'voicing', 'chord': CHORD, 'voicing': VOICING})
    assert change_tuning(focused, TUNING).focus.kind == 'voicing'
    assert change_tuning(focused, [62, 59, 55, 50, 45, 40]).focus.kind == 'chord'
    assert transpose(focused, -1).focus.kind == 'chord'
    assert transpose(focused, 2).focus.voicing.positions[0].fret == 2
    assert change_tuning(state, [62, 59, 55, 50, 45, 40]).focus == state.focus


def test_retained_values_are_copied_and_survive_resolution():
    state = HarmonyExploration()
    voicing = deepcopy(VOICING)
    pinned = pin_voicing(state, CHORD, voicing)
    voicing['positions'][0]['fret'] = 9
    assert pinned.pinned_voicings[0].voicing.positions[0].fret == 0
    assert not state.pinned_voicings
    kept = add_kept_note_group(pinned, {'id': 'root', 'label': 'Root', 'notes': [{'pitch_class': 0}]})
    assert resolve_harmony(kept)['note_groups'][0]['id'] == 'root'
    assert len(kept.kept_note_groups) == 1
    assert not unpin_voicing(kept, CHORD, VOICING).pinned_voicings


@pytest.mark.parametrize('mode, qualities', [
    ('locrian', ['diminished', 'major', 'minor', 'minor', 'major', 'major', 'minor']),
    ('harmonic_minor', ['minor', 'diminished', 'augmented', 'minor', 'major', 'major', 'diminished']),
    ('melodic_minor', ['minor', 'minor', 'augmented', 'major', 'major', 'diminished', 'diminished']),
])
def test_minor_palette_uses_the_actual_scale(mode, qualities):
    result = resolve_harmony(HarmonyExploration(tonal_center={'root': 'A', 'scale': mode}))
    assert [chord['quality'] for chord in result['palette']] == qualities


def test_scratch_playback_is_one_note_per_string_and_retains_tuning():
    state = HarmonyExploration(tuning=[64, 59, 55, 50, 45, 38], scratch=[{'id': 'one', **CHORD}])
    voicing = resolve_harmony(state)['scratch'][0]['voicing']
    assert voicing is not None
    assert len({p['string'] for p in voicing['positions']}) == len(voicing['positions'])
    assert voicing['tuning'] == state.tuning
    assert all(p['midi'] % 12 in (0, 4, 7) for p in voicing['positions'])
