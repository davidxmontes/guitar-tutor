from copy import deepcopy
from tests.v2.test_workspace_tutor import setup, turn, patch


def physical():
    store, model, client, sid, _ = setup()
    response = client.post(f'/api/v2/sessions/{sid}/concept-workspaces', json={'recipe': 'physical-resolution'})
    assert response.status_code == 201, response.text
    return store, model, client, sid, response.json()


def test_physical_resolution_derives_harmony_movement_and_actual_tuning():
    _, _, client, _, branch = physical()
    draft = branch['working_draft']
    facts = client.post('/api/v2/concept-workspaces/resolve', json=draft).json()
    assert set(facts) == {'entities', 'relations'}
    relation = draft['relations'][0]
    d, g = relation['entity_ids']
    key_id = draft['entities'][0]['id']
    transition = facts['relations'][relation['id']]
    assert transition['functions'] == ['V', 'I']
    assert transition['shared'] == [2]
    assert {n['note'] for n in facts['entities'][draft['entities'][1]['id']]['notes']} == {'D', 'F#', 'A'}
    assert transition['movement'][0]['semitones'] == 1  # high F# -> G
    assert transition['movement'][3]['kind'] == 'fixed'  # open D stays
    assert facts['entities'][d]['kind'] == 'voicing' and facts['entities'][d]['positions'][0]['midi'] == 66
    # Derived data on resolved entities: key carries diatonicChords + circle; a major chord carries cagedRegions.
    key = facts['entities'][key_id]
    assert [(c['numeral'], c['root'], c['quality']) for c in key['diatonicChords']] == [
        ('I', 'G', 'major'), ('ii', 'A', 'minor'), ('iii', 'B', 'minor'), ('IV', 'C', 'major'),
        ('V', 'D', 'major'), ('vi', 'E', 'minor'), ('vii°', 'F#', 'diminished')]
    assert key['circle'][0] == 'C' and 'G' in key['circle']
    assert {r['shape'] for r in facts['entities'][draft['entities'][1]['id']]['cagedRegions']} == set('CAGED')
    assert max(p['fret'] for p in key['positions']) <= 19
    # Drop D: retain G by moving its sixth string from fret 3 to fret 5.
    alternate = deepcopy(draft)
    for entity in alternate['entities']:
        if entity['kind'] == 'voicing':
            entity['tuning'][5] = 38
            for position in entity['positions']:
                if position['string'] == 6:
                    position['fret'] = 5
    alt = client.post('/api/v2/concept-workspaces/resolve', json=alternate)
    assert alt.status_code == 200, alt.text
    assert alt.json()['entities'][g]['positions'][-1]['midi'] == 43
    assert alt.json()['entities'][g]['tuning'][-1] == 38
    recontext = deepcopy(draft)
    recontext['entities'][0]['root'] = 'F#'
    reanalyzed = client.post('/api/v2/concept-workspaces/resolve', json=recontext).json()
    assert reanalyzed['relations'][relation['id']]['functions'] == ['outside key', 'outside key']
    assert 'F#' in reanalyzed['entities'][recontext['entities'][0]['id']]['circle']
    assert {i: reanalyzed['entities'][i] for i in (d, g)} == {i: facts['entities'][i] for i in (d, g)}
    for bad in [dict(string=1, fret=25), dict(string=1, fret=-1), dict(string=7, fret=1)]:
        invalid = deepcopy(draft)
        invalid['entities'][3]['positions'][0] = bad
        assert client.post('/api/v2/concept-workspaces/resolve', json=invalid).status_code == 422
    for field, value in [('tuning', [64]*5), ('tuning', [127]*6), ('tuning', [64,59,55,50,45,38]), ('chord_id', 'missing'), ('positions', [{'string':1,'fret':1}]*2)]:
        invalid = deepcopy(draft)
        invalid['entities'][3][field] = value
        assert client.post('/api/v2/concept-workspaces/resolve', json=invalid).status_code == 422


def test_arbitrary_tutor_voicing_is_ordinary_state_and_exactly_undoable():
    _, model, client, sid, branch = physical()
    original = branch['working_draft']
    target = original['entities'][4]
    # A compact G/D voicing, without a catalog lookup: retain D on string 2.
    smooth = target | {'label': 'G over D · compact', 'positions': [{'string':1,'fret':3}, {'string':2,'fret':3}, {'string':3,'fret':4}]}
    model.outcomes = [{'message':'Keep D on the second string; move F# up to G.', 'workspace_patch': patch(branch, [{'op':'update_entity','entity':smooth}])},
        {'message':'Invalid grip rejected.', 'workspace_patch': {'protocol_version':1,'base_version':2,'operations':[{'op':'update_entity','entity':smooth | {'positions':[{'string':1,'fret':30}]}}]}}]
    response = turn(client, sid, branch, 'Give me a smoother way to move from D to G', inspection={'source_id':target['id'],'kind':'voicing','key':target['id']})
    assert response.status_code == 200, response.text
    result = response.json()['workspace_result']
    assert result['status'] == 'applied'
    changed = result['branch']['working_draft']
    assert changed['entities'][4] == smooth
    assert changed['blocks'] == original['blocks']
    assert turn(client, sid, branch, 'Try another grip').json()['workspace_result']['status'] == 'rejected'
    undo = client.post(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace/undo", json={'message_id':result['message_id'], 'expected_version':2})
    assert undo.status_code == 200, undo.text
    assert undo.json()['branch']['working_draft'] == original | {'version':3}
