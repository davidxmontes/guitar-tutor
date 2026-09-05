from copy import deepcopy
from tests.v2.test_workspace_tutor import setup
from app.v2.concepts import build_concept_study


def test_caged_uses_trusted_regions_and_materializes_only_explicit_independent_voicings():
    _, model, client, sid, _ = setup()
    r = client.post(f'/api/v2/sessions/{sid}/concept-workspaces', json={'recipe':'caged-exploration'})
    assert r.status_code == 201, r.text
    branch = r.json(); draft = branch['working_draft']; chord = draft['entities'][0]
    assert [e['kind'] for e in draft['entities']] == ['chord']
    def resolve(w):
        r = client.post('/api/v2/concept-workspaces/resolve', json=w)
        assert r.status_code == 200, r.text
        return r.json()['caged'][chord['id']]
    facts = resolve(draft)
    trusted = build_concept_study('C','caged')
    assert [[(p['string'],p['fret']) for p in region['positions']] for region in facts['regions']] == [[(p.string,p.fret) for p in region.positions] for region in trusted.regions]
    first, second = facts['regions'][:2]
    shared = {(p['string'],p['fret']) for p in first['positions']} & {(p['string'],p['fret']) for p in second['positions']}
    assert {(p['string'],p['fret']) for p in facts['pairs'][0]['shared']} == shared
    alternate = deepcopy(draft); alternate['tuning'][5] = 38; alternate['entities'][0]['root'] = 'F#'
    alt = resolve(alternate)
    assert {p['note'] for region in alt['regions'] for p in region['positions']} == {'F#','A#','C#'}
    assert all(p['midi'] == alternate['tuning'][p['string']-1] + p['fret'] for region in alt['regions'] for p in region['positions'])
    materialized = client.post('/api/v2/concept-workspaces/caged/materialize', json={'workspace':draft,'chord_id':chord['id'],'region':first['shape']})
    assert materialized.status_code == 200, materialized.text
    materialized = materialized.json()
    voicing = next(e for e in materialized['entities'] if e['kind'] == 'voicing')
    assert voicing['chord_id'] != chord['id']
    assert voicing['positions'] == [{'string':p['string'],'fret':p['fret']} for p in first['positions']]
    materialized['entities'][0]['root'] = 'D'
    assert client.post('/api/v2/concept-workspaces/resolve', json=materialized).json()['voicings'][voicing['id']]['positions'] == first['positions']
    stored = client.put(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace", json={'expected_version':1,'workspace':materialized})
    assert stored.status_code == 200, stored.text
    saved = client.post(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace/save", json={'expected_version':2,'title':'CAGED work'}).json()
    reopened = client.post(f"/api/v2/library/{saved['current_artifact_id']}/open").json()['branches'][0]['working_draft']
    assert reopened == saved['working_draft'] | {'version':1}
    model.outcomes = [{'message':'Keep the common finger in place.'}]
    turn = client.post('/api/v2/tutor/turns', json={'session_id':sid,'branch_id':branch['id'],'message':'Explain this region','inspection':{'source_id':chord['id'],'kind':'region','key':'C'}})
    assert turn.status_code == 200, turn.text
    bad = deepcopy(draft); bad['entities'][0]['quality'] = 'dominant7'
    assert client.post('/api/v2/concept-workspaces/resolve', json=bad).status_code == 422
