from copy import deepcopy

from tests.v2.test_router import client


def open_workspace(client):
    session = client.post('/api/v2/sessions').json()
    response = client.post(f"/api/v2/sessions/{session['id']}/concept-workspaces", json={"recipe": "scale-comparison"})
    assert response.status_code == 201, response.text
    branch = response.json()
    return session['id'], branch, f"/api/v2/sessions/{session['id']}/branches/{branch['id']}/workspace"


def test_comparison_opens_edits_and_recovers_without_artifacts_or_tutor(client):
    session_id, branch, url = open_workspace(client)
    draft = branch['working_draft']
    assert [(e['kind'], e['root'], e['mode']) for e in draft['entities']] == [('scale', 'G', 'major'), ('scale', 'G', 'natural_minor')]
    resolved = client.post('/api/v2/concept-workspaces/resolve', json=draft).json()
    scales = list(resolved['scales'].values())
    assert [n['note'] for n in scales[0]['notes']] == ['G', 'A', 'B', 'C', 'D', 'E', 'F#']
    assert [n['note'] for n in scales[1]['notes']] == ['G', 'A', 'Bb', 'C', 'D', 'Eb', 'F']
    assert resolved['comparisons'][draft['relations'][0]['id']]['shared'] == [7, 9, 0, 2]
    for entity in draft['entities']:
        entity['root'] = 'F#'
    draft['tuning'] = [64, 59, 55, 50, 45, 38]
    response = client.put(url, json={'expected_version': 1, 'workspace': draft})
    assert response.status_code == 200, response.text
    assert response.json()['working_draft']['version'] == 2
    recovered = client.get(f'/api/v2/sessions/{session_id}').json()['branches'][-1]
    assert recovered['working_draft'] == response.json()['working_draft']
    resolved = client.post('/api/v2/concept-workspaces/resolve', json=recovered['working_draft']).json()
    assert [n['note'] for n in next(iter(resolved['scales'].values()))['notes']] == ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']
    for scale in resolved['scales'].values():
        for pos in scale['positions']:
            assert pos['midi'] == draft['tuning'][pos['string'] - 1] + pos['fret']
    assert client.put(url, json={'expected_version': 1, 'workspace': draft}).status_code == 409
    assert client.get('/api/v2/concept-studies').json() == []
    assert client.get(f"/api/v2/tutor/threads/{branch['tutor_thread_id']}/messages").json() == []


def test_invalid_composition_and_unowned_updates_leave_draft_intact(client):
    session_id, branch, url = open_workspace(client)
    original = branch['working_draft']
    invalid = []
    for path, value in [('source_id', 'missing'), ('kind', 'circle')]:
        draft = deepcopy(original)
        draft['blocks'][0][path] = value
        invalid.append(draft)
    draft = deepcopy(original)
    draft['relations'][0]['entity_ids'] = [draft['entities'][0]['id']] * 2
    invalid.append(draft)
    draft = deepcopy(original)
    draft['composition'][0]['items'][0]['span'] = 13
    invalid.append(draft)
    draft = deepcopy(original)
    draft['blocks'][0]['settings']['root'] = 'D'
    invalid.append(draft)
    for draft in invalid:
        assert client.put(url, json={'expected_version': 1, 'workspace': draft}).status_code == 422
    assert client.get(f'/api/v2/sessions/{session_id}').json()['branches'][-1]['working_draft'] == original
    from app.dependencies.auth import get_current_user
    client.app.dependency_overrides[get_current_user] = lambda: 'other'
    assert client.put(url, json={'expected_version': 1, 'workspace': original}).status_code == 404
