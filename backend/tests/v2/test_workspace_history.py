from copy import deepcopy
from tests.v2.test_workspace_tutor import setup, turn, patch


def test_restore_uses_owned_post_turn_snapshot_and_keeps_later_history_and_saved_work():
    store, model, client, sid, branch = setup()
    original = branch['working_draft']
    model.outcomes = [{'message': 'Now Dorian.', 'focus': {'role':'target', 'notes': [{'string': 1, 'fret': 3}], 'label': 'G target'},
        'workspace_patch': patch(branch, [{'op': 'update_entity', 'entity': original['entities'][0] | {'mode': 'dorian'}}])},
        {'message': 'A later explanation.'}]
    applied = turn(client, sid, branch).json()['workspace_result']
    snapshot = applied['branch']['working_draft']
    saved = client.post(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace/save", json={'expected_version': 2, 'title': original['title']}).json()
    artifact = deepcopy(store.get_artifact(saved['current_artifact_id'], 'user_1'))
    manual = deepcopy(snapshot)
    manual['entities'][0]['root'] = 'D'
    client.put(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace", json={'expected_version': 2, 'workspace': manual})
    turn(client, sid, branch, 'Explain my manual draft')
    path = f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace/restore"
    history_path = f"/api/v2/tutor/threads/{branch['tutor_thread_id']}/messages"
    history = client.get(history_path).json()
    assert history[1]['content']['workspace_after'] == snapshot
    assert client.get(f'/api/v2/sessions/{sid}').json()['branches'][-1]['working_draft']['version'] == 3
    assert client.post(path, json={'message_id': applied['message_id'], 'expected_version': 2}).status_code == 409
    result = client.post(path, json={'message_id': applied['message_id'], 'expected_version': 3})
    assert result.status_code == 200, result.text
    restored = result.json()
    assert restored['status'] == 'restored'
    assert restored['branch']['working_draft'] == snapshot | {'version': 4}
    after = client.get(history_path).json()
    assert after[:-1] == history
    assert after[-1]['content']['workspace_change']['status'] == 'restored'
    assert after[-1]['content']['focus']['label'] == 'G target'
    assert after[-1]['content']['workspace_before']['entities'][0]['root'] == 'D'
    assert store.get_artifact(artifact.id, 'user_1') == artifact
    assert client.post(path.replace('/restore','/undo'), json={'message_id': applied['message_id'], 'expected_version': 4}).status_code == 409
    other = client.post('/api/v2/sessions').json()
    other_branch = client.post(f"/api/v2/sessions/{other['id']}/concept-workspaces", json={'recipe':'scale-comparison'}).json()
    assert client.post(f"/api/v2/sessions/{other['id']}/branches/{other_branch['id']}/workspace/restore", json={'message_id': applied['message_id'], 'expected_version':1}).status_code == 404
    assert client.post(path, json={'message_id': history[0]['id'], 'expected_version':4}).status_code == 404
    from app.dependencies.auth import get_current_user
    client.app.dependency_overrides[get_current_user] = lambda:'other'
    assert client.post(path, json={'message_id': applied['message_id'], 'expected_version':4}).status_code == 404
