from copy import deepcopy
from tests.v2.workspace_fixtures import client, store


def opened(client):
    sid = client.post('/api/v2/sessions').json()['id']
    return client.post(f'/api/v2/sessions/{sid}/concept-workspaces', json={'recipe': 'scale-comparison'}).json()


def save(client, branch, title='My scale study', **options):
    return client.post(f"/api/v2/sessions/{branch['session_id']}/branches/{branch['id']}/workspace/save", json={'expected_version': branch['working_draft']['version'], 'title': title, **options})


def edit(client, branch, root):
    draft = deepcopy(branch['working_draft'])
    draft['entities'][0]['root'] = root
    draft['blocks'][0]['settings']['labels'] = 'intervals'
    return client.put(f"/api/v2/sessions/{branch['session_id']}/branches/{branch['id']}/workspace", json={'workspace': draft, 'expected_version': draft['version']}).json()


def test_explicit_saves_snapshot_music_and_independent_drafts_conflict_without_loss(client, store):
    branch = edit(client, opened(client), 'Bb')
    assert client.get('/api/v2/library').json() == []
    store.update_branch(branch['session_id'], branch['id'], 'user_1', focus={'notes': [11]}, selection={'scroll': 120, 'inspection': 'B'})
    result = save(client, branch)
    assert result.status_code == 200, result.text
    first = result.json()
    aid = first['current_artifact_id']
    original = store.get_artifact(aid, 'user_1').model_dump()
    assert original['title'] == 'My scale study'
    assert client.get(f'/api/v2/concept-studies/{aid}').json()['payload'] == original['payload']
    assert client.get('/api/v2/concept-studies').json()[0]['id'] == aid
    assert original['payload'] == first['working_draft']
    assert first['saved_artifact_revision'] == original['updated_at']
    same_session = client.post(f'/api/v2/concept-studies/{aid}/work-on-this', json={'session_id': first['session_id'], 'branch_id': first['id']})
    assert same_session.status_code == 201, same_session.text
    assert same_session.json()['branch']['working_draft'] == original['payload'] | {'version': 1}
    assert same_session.json()['branch']['saved_artifact_revision'] == original['updated_at']
    left, right = [client.post(f'/api/v2/library/{aid}/open').json()['branches'][0] for _ in range(2)]
    assert left['id'] != right['id'] and left['tutor_thread_id'] != right['tutor_thread_id']
    assert left['working_draft'] == original['payload'] | {'version': 1}
    left, right = edit(client, left, 'D'), edit(client, right, 'Eb')
    assert store.get_artifact(aid, 'user_1').model_dump() == original
    saved = save(client, left)
    assert saved.status_code == 200, saved.text
    artifact = store.get_artifact(aid, 'user_1')
    assert len(artifact.revisions) == 1 and artifact.revisions[0].payload == original['payload']
    reloaded = client.get(f"/api/v2/sessions/{right['session_id']}").json()['branches'][0]
    assert reloaded == right
    conflict = save(client, reloaded)
    assert conflict.status_code == 409
    assert store.get_artifact(aid, 'user_1') == artifact
    assert client.get(f"/api/v2/sessions/{right['session_id']}").json()['branches'][0] == right
    recovered = save(client, right, 'My independent idea', as_new=True)
    assert recovered.status_code == 200
    assert recovered.json()['current_artifact_id'] != aid
    assert store.get_artifact(recovered.json()['current_artifact_id'], 'user_1').payload['entities'][0]['root'] == 'Eb'
    assert store.get_artifact(aid, 'user_1') == artifact
    assert len(client.get('/api/v2/library').json()) == 2
    reopened = client.post(f'/api/v2/library/{aid}/open').json()['branches'][0]
    assert reopened['working_draft'] == artifact.payload | {'version': 1}
    assert not {'inspection', 'focus', 'scroll', 'saved_artifact_revision'} & artifact.payload.keys()


def test_stale_draft_invalid_name_and_ownership_are_rejected_before_save(client, store):
    branch = opened(client)
    latest = edit(client, branch, 'D')
    assert save(client, branch).status_code == 409
    assert save(client, latest, '   ').status_code == 422
    assert save(client, latest, geometry={'x': 1}).status_code == 422
    from app.dependencies.auth import get_current_user
    client.app.dependency_overrides[get_current_user] = lambda: 'other'
    assert save(client, latest).status_code == 404
    assert store.list_artifacts('user_1') == []


def test_unsupported_saved_workspace_is_recoverable_without_opening_a_branch(client, store):
    branch = opened(client)
    payload = branch['working_draft'] | {'schema_version': 999}
    artifact = store.create_artifact('user_1', 'concept_study', 'Future study', payload)
    before = client.get('/api/v2/sessions').json()
    response = client.post(f'/api/v2/library/{artifact.id}/open')
    assert response.status_code == 422 and 'Open a new exploration' in response.json()['detail']
    assert client.get('/api/v2/sessions').json() == before
