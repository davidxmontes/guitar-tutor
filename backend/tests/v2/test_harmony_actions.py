import pytest
from app.v2.store import InMemoryV2Store
from app.v2.tutor.contract import TutorTerminal
from app.v2.tutor.runner import resolve_turn_music


def test_harmony_mutations_and_derived_data_rejection():
    branch = InMemoryV2Store().create_session('owner').branches[0]
    def apply(data):
        nonlocal branch
        branch = resolve_turn_music(branch, TutorTerminal(message='Changed', mutation=data))
        with pytest.raises(ValueError):
            TutorTerminal(message='Invalid', mutation=data | {'positions': [{'string': 1, 'fret': 3}]})
        return branch.harmony_exploration
    assert apply({'kind': 'set_tonal_center', 'tonal_center': {'root': 'E', 'scale': 'natural_minor'}}).tonal_center.root == 'E'
    assert apply({'kind': 'set_scale', 'scale': 'dorian'}).tonal_center.scale == 'dorian'
    assert apply({'kind': 'set_tuning', 'tuning': [64, 59, 55, 50, 45, 38]}).tuning[-1] == 38
    first = apply({'kind': 'scratch_add', 'chord': {'root': 'E', 'quality': 'minor'}}).scratch[0].id
    second = apply({'kind': 'scratch_add', 'chord': {'root': 'A', 'quality': 'major'}}).scratch[1].id
    assert apply({'kind': 'scratch_reorder', 'ids': [second, first]}).scratch[0].id == second
    assert len(apply({'kind': 'scratch_remove', 'id': first}).scratch) == 1
    assert apply({'kind': 'add_kept_note_group', 'group': {'id': 'n', 'label': 'Root', 'notes': [{'pitch_class': 4}]}}).kept_note_groups
    with pytest.raises(ValueError):
        apply({'kind': 'scratch_reorder', 'ids': []})
    with pytest.raises(ValueError):
        TutorTerminal(message='bad', mutation={'kind': 'add_kept_note_group', 'group': {'id': 'n', 'label': 'Invented', 'notes': [{'string': 1, 'fret': 4}]}})


def test_explore_reuses_harmony_and_confirms_only_different_key():
    from app.v2.harmony_actions import explore_harmony
    from app.v2.harmony_state import ChordRef, TonalCenter
    branch = InMemoryV2Store().create_session('owner').branches[0]
    center = TonalCenter(root='E', scale='natural_minor')
    branch, _ = explore_harmony(branch, center)
    chord, confirmation = explore_harmony(branch, ChordRef(root='C', quality='major'))
    assert not confirmation and chord.harmony_exploration.tonal_center == center
    assert chord.harmony_exploration.focus.kind == 'chord'
    target = TonalCenter(root='D', scale='dorian')
    unchanged, confirmation = explore_harmony(chord, target)
    assert confirmation and unchanged == chord
    changed, confirmation = explore_harmony(chord, target, True)
    assert not confirmation and changed.harmony_exploration.tonal_center == target
    assert changed.harmony_exploration.focus.kind == 'scale'
    chord.harmony_exploration = None
    chord.active_workspace = 'progression'
    recreated, _ = explore_harmony(chord, ChordRef(root='A', quality='minor'))
    assert recreated.active_workspace == 'harmony' and recreated.harmony_exploration.tonal_center is None


def test_scripted_mutation_turn_and_explore_api():
    from tests.v2.test_tutor_router import _app, _scripted_factory
    from tests.v2.tutor_fakes import ScriptedTutorModel
    store = InMemoryV2Store()
    session = store.create_session('user_1')
    branch = session.branches[0]
    model = ScriptedTutorModel(outcomes=[{'message': 'E minor', 'mutation': {'kind': 'set_tonal_center', 'tonal_center': {'root': 'E', 'scale': 'natural_minor'}}}])
    client = _app(store, _scripted_factory(model))
    request = {'session_id': session.id, 'branch_id': branch.id, 'message': 'Change the key to E minor'}
    response = client.post('/api/v2/tutor/turns', json=request)
    assert response.status_code == 200, response.text
    assert response.json()['branch']['harmony_exploration']['tonal_center']['root'] == 'E'
    url = f'/api/v2/sessions/{session.id}/branches/{branch.id}'
    explored = client.post(url + '/explore', json={'subject': {'root': 'C', 'quality': 'major'}}).json()
    assert explored['branch']['harmony_exploration']['tonal_center']['root'] == 'E'
    assert explored['branch']['harmony_exploration']['focus']['kind'] == 'chord'
    confirm = client.post(url + '/explore', json={'subject': {'root': 'D', 'scale': 'dorian'}}).json()
    assert confirm['requires_confirmation']
    assert client.post(url + '/develop').json()['available'] is False
    invalid = ScriptedTutorModel(outcomes=[{'message': 'bad', 'mutation': {'kind': 'set_scale', 'scale': 'dorian', 'voicing': {'positions': [{'string': 1, 'fret': 2}]}}}] * 3)
    client = _app(store, _scripted_factory(invalid))
    before = store.get_session(session.id, 'user_1').branches[0]
    assert client.post('/api/v2/tutor/turns', json=request).status_code != 200
    assert store.get_session(session.id, 'user_1').branches[0] == before
