from copy import deepcopy
from tests.v2.test_workspace_tutor import setup


def test_progression_derives_then_materializes_and_transposes_without_losing_occurrences():
    _, model, client, sid, _ = setup()
    opened = client.post(f'/api/v2/sessions/{sid}/concept-workspaces', json={'recipe':'four-chord-progression'})
    assert opened.status_code == 201, opened.text
    branch = opened.json(); draft = branch['working_draft']; block = draft['blocks'][0]
    def facts(w):
        r = client.post('/api/v2/concept-workspaces/resolve', json=w)
        assert r.status_code == 200, r.text
        return r.json()['entities'][w['blocks'][0]['source_id']]
    def action(w, **fields):
        return client.post('/api/v2/concept-workspaces/progression', json={'workspace':w,'block_id':block['id'], **fields})
    assert [e['kind'] for e in draft['entities']] == ['key']
    assert [s['root'] for s in facts(draft)['steps']] == ['G','D','E','C']
    sharp = deepcopy(draft); sharp['entities'][0]['root'] = 'C#'
    octave = action(sharp, action='transpose', semitones=12).json()
    assert octave['entities'][0]['root'] == 'C#'
    assert [s['root'] for s in facts(octave)['steps']] == ['C#','G#','A#','F#']
    draft['entities'][0]['root'] = 'A'
    derived = facts(draft)
    assert [s['root'] for s in derived['steps']] == ['A','E','F#','D']
    second = deepcopy(block); second['id'] = 'second-view'
    draft['blocks'].append(second)
    draft['composition'].append({'items':[{'block_id':'second-view','span':12,'priority':'supporting'}]})
    materialized = action(draft, action='materialize').json()
    assert len({b['source_id'] for b in materialized['blocks']}) == 1
    assert [s['positions'] for s in facts(materialized)['steps']] == [s['positions'] for s in derived['steps']]
    concrete = action(draft, action='edit', step=1, root='A', quality='major')
    assert concrete.status_code == 200, concrete.text
    concrete = concrete.json(); resolved = facts(concrete)
    assert not resolved['derived']
    assert resolved['steps'][0]['positions'] == derived['steps'][0]['positions']
    assert [s['root'] for s in resolved['steps']] == ['A','A','F#','D']
    progression = next(e for e in concrete['entities'] if e['kind'] == 'progression')
    assert progression['steps'][0]['voicing_id'] != progression['steps'][1]['voicing_id']
    shared = deepcopy(concrete)
    shared_progression = next(e for e in shared['entities'] if e['kind'] == 'progression')
    shared_progression['steps'][1] = deepcopy(shared_progression['steps'][0])
    shared_edit = action(shared, action='edit', step=1, root='B').json()
    assert [s['root'] for s in facts(shared_edit)['steps']][:2] == ['A','B']
    assert facts(shared_edit)['steps'][0]['positions'] == resolved['steps'][0]['positions']
    shifted_shared = action(shared, action='transpose', semitones=2).json()
    assert [s['root'] for s in facts(shifted_shared)['steps']][:2] == ['B','B']
    assert facts(shifted_shared)['steps'][0]['positions'][0]['midi'] == resolved['steps'][0]['positions'][0]['midi'] + 2
    original = deepcopy(concrete)
    edited = action(concrete, action='edit', step=1, positions=[{'string':1,'fret':5},{'string':2,'fret':5},{'string':3,'fret':6}]).json()
    assert facts(edited)['steps'][0] == resolved['steps'][0]
    assert facts(edited)['steps'][1]['positions'] != resolved['steps'][1]['positions']
    edited['entities'][0]['root'] = 'G'
    assert [s['root'] for s in facts(edited)['steps']] == ['A','A','F#','D']
    before = facts(edited)
    moved = action(edited, action='transpose', semitones=2)
    assert moved.status_code == 200, moved.text
    moved = moved.json(); after = facts(moved)
    assert [s['root'] for s in after['steps']] == ['B','B','G#','E']
    assert [s['voicing_id'] for s in after['steps']] == [s['voicing_id'] for s in before['steps']]
    for first, second in zip(before['steps'], after['steps']):
        assert [p['midi'] + 2 for p in first['positions']] == [p['midi'] for p in second['positions']]
    assert action(original, action='transpose', semitones=-12).status_code == 422
    assert action(original, action='edit', step=9, root='C').status_code == 422
    assert action(original, action='edit', step=0, positions=[{'string':1,'fret':25}]).status_code == 422
    # Persist through the same atomic draft/save/open boundaries, retaining view settings.
    moved['blocks'][0]['settings']['labels'] = 'intervals'
    saved = client.put(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace", json={'expected_version':1,'workspace':moved})
    assert saved.status_code == 200, saved.text
    saved = saved.json()['working_draft']
    artifact = client.post(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace/save", json={'expected_version':saved['version'],'title':'My progression'}).json()
    payload = client.get(f"/api/v2/concept-studies/{artifact['current_artifact_id']}").json()['payload']
    assert payload == saved | {'title':'My progression', 'version':saved['version'] + 1}

    model.outcomes = [{'message':'This selected occurrence is independent.'}]
    explained = client.post('/api/v2/tutor/turns', json={'session_id':sid,'branch_id':branch['id'],'message':'Explain this chord',
        'inspection':{'source_id':progression['id'],'kind':'step','key':0}})
    assert explained.status_code == 200, explained.text
    assert explained.json()['workspace_result']['status'] == 'unchanged'
