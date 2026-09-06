"""Uniform resolved model (spec #88 §5) + schema v2 clean break (§8)."""
from tests.v2.test_router import client  # noqa: F401  (pytest fixture)
from tests.v2.test_workspace_tutor import setup

TUNING = [64, 59, 55, 50, 45, 40]


def _workspace(entities, blocks=None, composition=None, relations=None):
    return {'schema_version': 2, 'version': 1, 'title': 'Constructed', 'tuning': TUNING,
        'entities': entities, 'relations': relations or [], 'blocks': blocks or [], 'composition': composition or []}


def test_resolve_returns_only_entities_and_relations(client):
    for recipe in ('scale-comparison', 'physical-resolution', 'four-chord-progression', 'caged-exploration'):
        session = client.post('/api/v2/sessions').json()
        draft = client.post(f"/api/v2/sessions/{session['id']}/concept-workspaces", json={'recipe': recipe}).json()['working_draft']
        assert draft['schema_version'] == 2
        resolved = client.post('/api/v2/concept-workspaces/resolve', json=draft).json()
        assert set(resolved) == {'entities', 'relations'}
        assert not {'scales', 'chords', 'voicings', 'keys', 'progressions', 'comparisons',
                    'transitions', 'caged', 'block_sources'} & set(resolved)
        for entity in resolved['entities'].values():
            assert {'id', 'kind', 'label', 'notes', 'positions', 'tuning'} <= set(entity)


def test_note_group_pitch_refs_tile_and_literal_refs_pin(client):
    ws = _workspace([{'id': 'ng', 'kind': 'noteGroup', 'label': 'Mixed',
                      'notes': [{'pitch_class': 0}, {'string': 2, 'fret': 3}]}])
    resolved = client.post('/api/v2/concept-workspaces/resolve', json=ws)
    assert resolved.status_code == 200, resolved.text
    group = resolved.json()['entities']['ng']
    assert group['kind'] == 'noteGroup' and group['tuning'] == TUNING
    literal = [p for p in group['positions'] if (p['string'], p['fret']) == (2, 3)]
    assert literal == [{'string': 2, 'fret': 3, 'midi': 62, 'note': 'D', 'degree': '—', 'pitch_class': 2, 'offset': 0}]
    tiled = [p for p in group['positions'] if p['pitch_class'] == 0]
    assert len(tiled) >= 6
    assert all(p['midi'] % 12 == 0 and 0 <= p['fret'] <= 19 for p in tiled)
    # A pitch-class ref lands on every string that can voice it within 0-19.
    assert {p['string'] for p in tiled} == {1, 2, 3, 4, 5, 6}


def test_note_group_is_bindable_to_a_fretboard(client):
    ws = _workspace(
        [{'id': 'ng', 'kind': 'noteGroup', 'label': 'Blues notes', 'notes': [{'pitch_class': 3}, {'pitch_class': 6}]}],
        blocks=[{'id': 'b', 'kind': 'fretboard', 'sources': ['ng']}],
        composition=[{'items': [{'block_id': 'b', 'span': 12, 'priority': 'primary'}]}])
    assert client.post('/api/v2/concept-workspaces/resolve', json=ws).status_code == 200


def test_scale_chord_key_positions_are_tiled_0_to_19_and_spelled(client):
    ws = _workspace([
        {'id': 'sc', 'kind': 'scale', 'root': 'A', 'mode': 'major'},
        {'id': 'ch', 'kind': 'chord', 'root': 'A', 'quality': 'major'},
        {'id': 'ky', 'kind': 'key', 'root': 'A', 'mode': 'major'}])
    entities = client.post('/api/v2/concept-workspaces/resolve', json=ws).json()['entities']
    for eid in ('sc', 'ch', 'ky'):
        positions = entities[eid]['positions']
        assert positions and max(p['fret'] for p in positions) == 19 and min(p['fret'] for p in positions) == 0
        assert all(p['midi'] == TUNING[p['string'] - 1] + p['fret'] for p in positions)
    # A major spells C#, not Db; every tiled position keeps the entity-relative spelling.
    assert {p['note'] for p in entities['ch']['positions']} == {'A', 'C#', 'E'}
    assert entities['ky']['circle'][0] == 'C'
    assert [(c['numeral'], c['quality']) for c in entities['ky']['diatonicChords']] == [
        ('I', 'major'), ('ii', 'minor'), ('iii', 'minor'), ('IV', 'major'),
        ('V', 'major'), ('vi', 'minor'), ('vii°', 'diminished')]
    assert {r['shape'] for r in entities['ch']['cagedRegions']} == set('CAGED')


def test_voicing_positions_are_exact_in_its_own_tuning(client):
    drop_d = [64, 59, 55, 50, 45, 38]
    ws = _workspace([
        {'id': 'sc', 'kind': 'scale', 'root': 'G', 'mode': 'major'},
        {'id': 'v', 'kind': 'voicing', 'label': 'G drop-D', 'tuning': drop_d,
         'positions': [{'string': 6, 'fret': 5}, {'string': 1, 'fret': 3}]}])
    voicing = client.post('/api/v2/concept-workspaces/resolve', json=ws).json()['entities']['v']
    assert voicing['tuning'] == drop_d
    assert {(p['string'], p['fret']) for p in voicing['positions']} == {(6, 5), (1, 3)}
    assert 'cagedRegions' not in voicing


def test_schema_version_one_payload_is_unsupported_not_a_crash(client):
    v1 = {'schema_version': 1, 'version': 1, 'title': 'Legacy', 'tuning': TUNING,
          'entities': [{'id': 's', 'kind': 'scale', 'root': 'G', 'mode': 'major'}],
          'relations': [], 'blocks': [], 'composition': []}
    assert client.post('/api/v2/concept-workspaces/resolve', json=v1).status_code == 422


def test_saved_v1_workspace_routes_to_the_unsupported_path():
    store, model, client, sid, _ = setup()
    v1_payload = {'schema_version': 1, 'version': 1, 'title': 'Old workspace', 'tuning': TUNING,
                  'entities': [{'id': 's', 'kind': 'scale', 'root': 'G', 'mode': 'major'}],
                  'relations': [], 'blocks': [], 'composition': []}
    old = store.create_artifact('user_1', 'concept_study', 'Old workspace', v1_payload)
    before = client.get('/api/v2/sessions').json()
    opened = client.post(f'/api/v2/library/{old.id}/open')
    assert opened.status_code == 422 and 'exploration' in opened.json()['detail']
    assert store.get_artifact(old.id, 'user_1') == old
    assert client.get('/api/v2/sessions').json() == before
    assert model.calls == []
