import pytest
from pydantic import ValidationError

from app.v2.harmony import resolve_harmony
from app.v2.harmony_state import HarmonyExploration
from app.v2.models import Branch
from app.v2.tutor.contract import LearningPreferences
from app.v2.tutor.prompt import volatile_turn_message


def test_triad_shapes_cover_inversions_and_remain_correct_in_drop_d():
    for tuning in ([64, 59, 55, 50, 45, 40], [64, 59, 55, 50, 45, 38]):
        data = resolve_harmony(HarmonyExploration(tuning=tuning, focus={'kind': 'chord', 'chord': {'root': 'C', 'quality': 'major'}}))
        for strings in ([1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]):
            shapes = [shape for shape in data['triads'] if shape['strings'] == strings]
            assert {shape['inversion'] for shape in shapes} == {0, 1, 2}
            for shape in shapes:
                notes = shape['positions']
                assert {note['string'] for note in notes} == set(strings)
                assert {note['pitch_class'] for note in notes} == {0, 4, 7}
                assert all(note['midi'] == tuning[note['string'] - 1] + note['fret'] for note in notes)
                assert min(notes, key=lambda note: note['midi'])['degree'] == ['1', '3', '5'][shape['inversion']]
    seventh = resolve_harmony(HarmonyExploration(focus={'kind': 'chord', 'chord': {'root': 'C', 'quality': 'major7'}}))
    assert seventh['triads'] == []
    suspended = resolve_harmony(HarmonyExploration(focus={'kind': 'chord', 'chord': {'root': 'C', 'quality': 'sus2'}}))
    assert suspended['triads'] == []


def test_tutor_preferences_reach_the_model_and_stale_undo_preserves_later_edits():
    from app.v2.store import InMemoryV2Store
    from tests.v2.test_tutor_router import _app, _scripted_factory
    from tests.v2.tutor_fakes import ScriptedTutorModel
    model = ScriptedTutorModel(outcomes=[{'message': 'Now E minor.', 'mutation': {'kind': 'set_tonal_center', 'tonal_center': {'root': 'E', 'scale': 'natural_minor'}}}])
    client = _app(InMemoryV2Store(), _scripted_factory(model))
    session = client.post('/api/v2/harmony/open', json={'root': 'C', 'scale': 'major'}).json()
    identity = {'session_id': session['id'], 'branch_id': session['branches'][0]['id']}
    result = client.post('/api/v2/tutor/turns', json={**identity, 'message': 'Change to E minor', 'learning_preferences': {'level': 'intermediate', 'style': 'practice', 'minutes': 10}})
    assert result.status_code == 200
    assert '"level":"intermediate"' in model.calls[0][-1].content
    assert '"minutes":10' in model.calls[0][-1].content
    branch = result.json()['branch']
    base = f"/api/v2/sessions/{session['id']}/branches/{branch['id']}/harmony"
    assert client.patch(base, json={'tonal_center': {'root': 'G', 'scale': 'major'}}).status_code == 200
    restore = client.post('/api/v2/tutor/restore', json={**identity, 'turn_id': branch['live_presentation_turn_id'], 'expected_updated_at': branch['updated_at'], 'undo': True})
    assert restore.status_code == 409
    assert client.get(base).json()['branch']['harmony_exploration']['tonal_center']['root'] == 'G'


def test_triad_configuration_is_bounded_and_circle_handles_enharmonic_roots():
    from app.v2.presentation import validate_composition
    for config in ({'string_set': 5}, {'inversion': 3}, {'string_set': True}, {'max_shapes': 0}, {'max_shapes': 13}):
        with pytest.raises(ValidationError):
            validate_composition('harmony', {'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {'hero': [{'kind': 'triad-explorer', 'config': config}], 'support': [{'kind': 'explanation'}]}})
    data = resolve_harmony(HarmonyExploration(tonal_center={'root': 'F#', 'scale': 'major'}))
    assert data['circle']['home_key'] == 'Gb'


def test_learning_preferences_are_validated_and_reach_the_current_turn():
    preferences = LearningPreferences(level='intermediate', style='practice', minutes=10)
    branch = Branch(id='b', session_id='s', tutor_thread_id='t', harmony_exploration=HarmonyExploration(), created_at='x', updated_at='x')
    text = volatile_turn_message(branch=branch, user_message='Help me practise', learning_preferences=preferences).content
    assert 'intermediate' in text and 'practice' in text and '10' in text
    assert text.endswith('User: Help me practise')
    with pytest.raises(ValidationError):
        LearningPreferences(level='made up', minutes=-1)
