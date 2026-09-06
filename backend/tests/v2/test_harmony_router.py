from tests.v2.test_tutor_router import _app
from app.v2.store import InMemoryV2Store


def test_concept_entry_and_edits_never_call_model_and_hold_surface():
    store = InMemoryV2Store()
    def no_model(*args, **kwargs):
        raise AssertionError('Concept entry must be deterministic')
    client = _app(store, no_model)
    entry = client.post('/api/v2/harmony/open', json={'root': 'A', 'scale': 'dorian'})
    assert entry.status_code == 200, entry.text
    session = entry.json()
    branch = session['branches'][0]
    url = f"/api/v2/sessions/{session['id']}/branches/{branch['id']}/harmony"
    surface = client.get(url).json()
    assert surface['composition']['pattern'] == 'hero-with-support'
    assert surface['composition']['slots']['hero'][0]['kind'] == 'fretboard'
    assert surface['resolved']['palette'][3]['root'] == 'D'
    updated = client.patch(url, json={'tonal_center': {'root': 'G', 'scale': 'major'}}).json()
    assert updated['composition'] == surface['composition']
    assert updated['resolved']['palette'][0]['root'] == 'G'
    focused = client.patch(url, json={'focus': {'kind': 'degree', 'degree': 3}}).json()
    assert focused['branch']['harmony_exploration']['focus']['degree'] == 3
    scratch = client.patch(url, json={'add_scratch': {'root': 'C', 'quality': 'major'}}).json()
    assert scratch['branch']['harmony_exploration']['scratch'][0]['root'] == 'C'
    assert client.patch(url, json={'unknown': 2}).status_code == 422


def test_chord_entry_focus_seam_and_pin_are_by_value():
    client = _app(InMemoryV2Store(), lambda **kwargs: (_ for _ in ()).throw(AssertionError('No model')))
    session = client.post('/api/v2/harmony/open', json={'root': 'C', 'quality': 'major7'}).json()
    branch = session['branches'][0]
    url = f"/api/v2/sessions/{session['id']}/branches/{branch['id']}/harmony"
    surface = client.get(url).json()
    assert surface['branch']['harmony_exploration']['tonal_center'] is None
    assert surface['composition']['slots']['hero'][0]['kind'] == 'voicing-explorer'
    assert surface['resolved']['function'] is None
    surface = client.patch(url, json={'focus': {'kind': 'chord', 'chord': {'root': 'C', 'quality': 'major'}}}).json()
    assert len(surface['resolved']['caged_regions']) == 5
    positions = surface['resolved']['caged_regions'][0]['positions']
    voicing = {'positions': [{k: p[k] for k in ('string', 'fret')} for p in positions], 'tuning': [64, 59, 55, 50, 45, 40]}
    pin = {'chord': {'root': 'C', 'quality': 'major'}, 'voicing': voicing}
    selected = client.patch(url, json={'focus': {'kind': 'voicing', **pin}, 'pin': pin})
    assert selected.status_code == 200, selected.text
    state = selected.json()['branch']['harmony_exploration']
    assert state['pinned_voicings'] == [pin]
    assert state['scratch'] == []
    unpinned = client.patch(url, json={'unpin': pin}).json()
    assert unpinned['branch']['harmony_exploration']['pinned_voicings'] == []
    scale = client.patch(url, json={'tonal_center': {'root': 'C', 'scale': 'major'}}).json()
    assert scale['composition']['slots']['hero'][0]['kind'] == 'fretboard'
    seventh = client.patch(url, json={'focus': {'kind': 'chord', 'chord': {'root': 'C', 'quality': 'major7'}}}).json()
    assert seventh['resolved']['function'] == 'I'


def test_voicing_candidates_resolve_catalog_and_reject_invented_positions():
    import pytest
    from app.v2.tutor.contract import TutorTerminal
    from app.v2.tutor.runner import resolve_turn_music
    store = InMemoryV2Store()
    branch = store.create_session('user').branches[0]
    from app.v2.harmony import chord_voicings
    from app.v2.harmony_state import ChordRef
    value = chord_voicings(ChordRef(root='C', quality='major'), branch.harmony_exploration.tuning)[0]
    candidate = {'id': 'v', 'label': 'Try this', 'chord': {'root': 'C', 'quality': 'major'}, 'voicing': {'positions': [{'string': p['string'], 'fret': p['fret']} for p in value['positions']], 'tuning': value['tuning']}}
    terminal = TutorTerminal(message='Try', candidates={'candidate_kind': 'voicing', 'candidates': [candidate]})
    updated = resolve_turn_music(branch, terminal)
    assert updated.harmony_exploration.pinned_voicings == []
    assert terminal.candidates.candidates[0]['voicing']['positions']
    for invalid in [candidate | {'voicing_index': -1}, candidate | {'positions': []}]:
        with pytest.raises(ValueError):
            resolve_turn_music(branch, TutorTerminal(message='No', candidates={'candidate_kind': 'voicing', 'candidates': [invalid]}))
