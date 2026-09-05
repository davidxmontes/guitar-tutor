from copy import deepcopy

from app.v2.store import InMemoryV2Store
from tests.v2.test_tutor_router import _app, _scripted_factory
from tests.v2.tutor_fakes import ScriptedTutorModel


def setup():
    store = InMemoryV2Store()
    model = ScriptedTutorModel(outcomes=[])
    client = _app(store, _scripted_factory(model))
    sid = client.post('/api/v2/sessions').json()['id']
    branch = client.post(f'/api/v2/sessions/{sid}/concept-workspaces', json={'recipe': 'scale-comparison'}).json()
    return store, model, client, sid, branch


def turn(client, sid, branch, message='Change the first scale to G Dorian', **fields):
    return client.post('/api/v2/tutor/turns', json={'session_id': sid, 'branch_id': branch['id'], 'message': message, **fields})


def patch(branch, operations):
    return {'protocol_version': 1, 'base_version': branch['working_draft']['version'], 'operations': operations}


def test_direct_change_receives_draft_and_inspection_and_undo_preserves_saved_work():
    store, model, client, sid, branch = setup()
    original = deepcopy(branch['working_draft'])
    entity = original['entities'][0]
    artifact = store.create_artifact('user_1', 'concept_study', 'Saved', original)
    store.update_branch(sid, branch['id'], 'user_1', current_artifact_id=artifact.id)
    model.outcomes = [{'message': 'I changed the first scale to G Dorian.', 'workspace_patch': patch(branch, [
        {'op': 'update_entity', 'entity': entity | {'mode': 'dorian'}}])}]
    response = turn(client, sid, branch, inspection={'source_id': entity['id'], 'kind': 'pitch', 'key': 11})
    assert response.status_code == 200, response.text
    result = response.json()['workspace_result']
    assert result['status'] == 'applied'
    updated = result['branch']['working_draft']
    assert updated['entities'][0]['mode'] == 'dorian'
    assert updated['entities'][1] == original['entities'][1]
    prompt = str(model.calls[0][-1].content)
    assert 'Working Draft' in prompt and entity['id'] in prompt and 'Inspection' in prompt and '11' in prompt
    history = client.get(f"/api/v2/tutor/threads/{branch['tutor_thread_id']}/messages").json()
    assert [m['role'] for m in history] == ['user', 'assistant']
    assert history[-1]['content']['workspace_before'] == original
    assert history[-1]['content']['workspace_after'] == updated
    undo = client.post(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace/undo", json={'message_id': result['message_id'], 'expected_version': updated['version']})
    assert undo.status_code == 200, undo.text
    restored = undo.json()['branch']['working_draft']
    assert restored == original | {'version': updated['version'] + 1}
    assert store.get_artifact(artifact.id, 'user_1') == artifact
    history = client.get(f"/api/v2/tutor/threads/{branch['tutor_thread_id']}/messages").json()
    assert len(history) == 3 and history[-1]['content']['workspace_change']['status'] == 'undone'
    assert client.post(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace/undo", json={'message_id': history[-1]['id'], 'expected_version': restored['version']}).status_code == 409
    assert client.post(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace/undo", json={'message_id': result['message_id'], 'expected_version': restored['version']}).status_code == 409


def test_invalid_and_stale_patches_keep_text_and_never_partially_apply():
    store, model, client, sid, branch = setup()
    original = deepcopy(branch['working_draft'])
    entity = original['entities'][0]
    model.outcomes = [
        {'message': 'My proposed change was invalid.', 'workspace_patch': patch(branch, [
            {'op': 'update_entity', 'entity': entity | {'mode': 'dorian'}},
            {'op': 'add_block', 'block': {'id': '$view', 'kind': 'executable', 'source_id': entity['id']}}])},
        {'message': 'This answer used the old draft.', 'workspace_patch': patch(branch, [{'op': 'update_entity', 'entity': entity | {'mode': 'dorian'}}])},
    ]
    invalid = turn(client, sid, branch)
    assert invalid.status_code == 200, invalid.text
    assert invalid.json()['workspace_result']['status'] == 'rejected'
    assert store.get_session(sid, 'user_1').branches[-1].working_draft.model_dump() == original
    manual = deepcopy(original)
    manual['entities'][0]['root'] = 'D'
    saved = client.put(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace", json={'expected_version': 1, 'workspace': manual}).json()
    stale = turn(client, sid, branch)
    assert stale.status_code == 200
    assert stale.json()['workspace_result']['status'] == 'rejected'
    assert stale.json()['workspace_result']['branch']['working_draft'] == saved['working_draft']
    history = client.get(f"/api/v2/tutor/threads/{branch['tutor_thread_id']}/messages").json()
    assert [m['content']['text'] for m in history if m['role'] == 'assistant'] == [o['message'] for o in model.outcomes]
    assert all(m['content'].get('workspace_before') is None for m in history)


def test_alternatives_use_application_ids_and_preserve_existing_composition():
    _, model, client, sid, branch = setup()
    original = branch['working_draft']
    model.outcomes = [{'message': 'Two ordinary scale alternatives.', 'workspace_patch': patch(branch, [
        {'op': 'add_entity', 'entity': {'id': '$bright', 'root': 'G', 'mode': 'lydian', 'label': 'Brighter option'}},
        {'op': 'add_entity', 'entity': {'id': '$dark', 'root': 'G', 'mode': 'phrygian', 'label': 'Darker option'}},
        {'op': 'add_relation', 'relation': {'id': '$compare', 'entity_ids': ['$bright', '$dark']}},
        {'op': 'add_block', 'block': {'id': '$view', 'kind': 'degree_strip', 'source_id': '$compare'}},
    ])}]
    response = turn(client, sid, branch, 'Show me two alternatives')
    assert response.status_code == 200, response.text
    result = response.json()['workspace_result']
    assert result['status'] == 'applied'
    draft = result['branch']['working_draft']
    assert draft['entities'][:2] == original['entities']
    assert draft['composition'][:2] == original['composition']
    assert not any(obj['id'].startswith('$') for obj in draft['entities'] + draft['relations'] + draft['blocks'])
    assert draft['relations'][-1]['entity_ids'] == [e['id'] for e in draft['entities'][-2:]]
    assert draft['blocks'][-1]['source_id'] == draft['relations'][-1]['id']
    assert [e['label'] for e in draft['entities'][-2:]] == ['Brighter option', 'Darker option']


def test_unsolicited_removal_is_rejected_but_explicit_view_removal_is_undoable():
    _, model, client, sid, branch = setup()
    operation = {'op': 'remove_block', 'id': branch['working_draft']['blocks'][0]['id']}
    model.outcomes = [{'message': 'Explaining the scale.', 'workspace_patch': patch(branch, [operation])},
                      {'message': 'Removed the fretboard view.', 'workspace_patch': patch(branch, [operation])}]
    assert turn(client, sid, branch, 'Explain the first scale').json()['workspace_result']['status'] == 'rejected'
    applied = turn(client, sid, branch, 'Remove the fretboard view').json()['workspace_result']
    assert applied['status'] == 'applied'
    assert len(applied['branch']['working_draft']['blocks']) == 1
    assert applied['branch']['working_draft']['entities'] == branch['working_draft']['entities']


def test_manual_edit_during_model_run_wins_and_stale_text_is_recorded():
    from threading import Event
    from concurrent.futures import ThreadPoolExecutor
    store, model, client, sid, branch = setup()
    entered, release = Event(), Event()
    from app.v2.router import get_tutor_model_factory
    def factory(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return model
    client.app.dependency_overrides[get_tutor_model_factory] = lambda: factory
    original = branch['working_draft']
    model.outcomes = [{'message': 'Old draft suggestion.', 'workspace_patch': patch(branch, [
        {'op': 'update_entity', 'entity': original['entities'][0] | {'mode': 'dorian'}}])}]
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(turn, client, sid, branch)
        assert entered.wait(5)
        manual = deepcopy(original)
        manual['entities'][0]['root'] = 'D'
        saved = client.put(f"/api/v2/sessions/{sid}/branches/{branch['id']}/workspace", json={'expected_version': 1, 'workspace': manual}).json()
        release.set()
        result = future.result().json()['workspace_result']
    assert result['status'] == 'rejected'
    assert result['branch']['working_draft'] == saved['working_draft']
    assert store.list_tutor_messages(branch['tutor_thread_id'], 'user_1')[-1].content['text'] == 'Old draft suggestion.'


def test_invalid_inspection_is_rejected_before_any_model_call():
    _, model, client, sid, branch = setup()
    for source, key in [('missing', 7), (branch['working_draft']['entities'][0]['id'], 8)]:
        response = turn(client, sid, branch, inspection={'source_id': source, 'kind': 'pitch', 'key': key})
        assert response.status_code == 422
    assert not model.calls


def test_explanation_and_view_only_changes_keep_music_and_hide_legacy_candidates():
    _, model, client, sid, branch = setup()
    original = branch['working_draft']
    model.outcomes = [{'message': 'Focus on the third.', 'candidates': [{'title': 'Legacy candidate', 'chords': [{'root': 'G', 'quality': 'major'}]}]},
                      {'message': 'Showing intervals.', 'workspace_patch': patch(branch, [{'op': 'update_view', 'id': original['blocks'][0]['id'], 'settings': {'labels': 'intervals'}}])}]
    explanation = turn(client, sid, branch, 'Explain this scale').json()
    assert explanation['workspace_result']['status'] == 'unchanged'
    assert not explanation['candidates']
    assert explanation['workspace_result']['branch']['working_draft'] == original
    changed = turn(client, sid, branch, 'Show intervals').json()['workspace_result']
    assert changed['status'] == 'applied'
    assert changed['branch']['working_draft']['entities'] == original['entities']
    assert changed['branch']['working_draft']['blocks'][0]['settings']['labels'] == 'intervals'
    history = client.get(f"/api/v2/tutor/threads/{branch['tutor_thread_id']}/messages").json()
    assert history[1]['content']['workspace_after'] == original
    assert history[1]['content']['workspace_before'] is None


def test_invalid_references_and_patch_envelopes_never_mutate_the_draft():
    _, model, client, sid, branch = setup()
    original = branch['working_draft']
    invalid_patches = [
        patch(branch, [{'op': 'add_entity', 'entity': {'id': '$same', 'root': 'G', 'mode': 'major'}}] * 2),
        patch(branch, [{'op': 'add_block', 'block': {'id': '$view', 'kind': 'fretboard', 'source_id': '$missing'}}]),
        patch(branch, [{'op': 'remove_entity', 'id': original['entities'][0]['id']}]),
        patch(branch, [{'op': 'recompose', 'composition': []}]),
        {'protocol_version': 2, 'base_version': 1, 'operations': []},
    ]
    model.outcomes = [{'message': 'Explanation retained.', 'workspace_patch': change} for change in invalid_patches]
    for _ in invalid_patches:
        response = turn(client, sid, branch, 'Reset the workspace').json()
        assert response['message'] == 'Explanation retained.'
        assert response['workspace_result']['status'] == 'rejected'
        assert response['workspace_result']['branch']['working_draft'] == original
