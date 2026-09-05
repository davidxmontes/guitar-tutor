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
    relation = draft['relations'][0]
    d, g = relation['entity_ids']
    transition = facts['transitions'][relation['id']]
    assert transition['functions'] == ['V', 'I']
    assert transition['shared'] == [2]
    assert {n['note'] for n in facts['chords'][draft['entities'][1]['id']]['notes']} == {'D', 'F#', 'A'}
    assert transition['movement'][0]['semitones'] == 1  # high F# -> G
    assert transition['movement'][3]['kind'] == 'fixed'  # open D stays
    assert facts['voicings'][d]['positions'][0]['midi'] == 66
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
    assert alt.json()['voicings'][g]['positions'][-1]['midi'] == 43
    assert alt.json()['voicings'][g]['tuning'][-1] == 38
    for bad in [dict(string=1, fret=25), dict(string=1, fret=-1), dict(string=7, fret=1)]:
        invalid = deepcopy(draft)
        invalid['entities'][3]['positions'][0] = bad
        assert client.post('/api/v2/concept-workspaces/resolve', json=invalid).status_code == 422
    for field, value in [('tuning', [64]*5), ('chord_id', 'missing'), ('positions', [{'string':1,'fret':1}]*2)]:
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
