from tests.v2.workspace_fixtures import client, store, session_and_branch


def test_library_revisions_restore_and_fresh_conversation(client, store):
    source = store.create_session('user_1')
    artifact = client.post('/api/v2/progressions', json={'title': 'Dreamy', 'chords': [{'root': 'D', 'quality': 'major', 'voicing': [{'string': 1, 'fret': 10}], 'tuning': 'standard'}], 'inspired_by': {'title': 'Little Wing'}}).json()
    store.create_tutor_message(source.branches[0].tutor_thread_id, 'user', {'text': 'old conversation'})
    assert [a['id'] for a in client.get('/api/v2/library').json()] == [artifact['id']]
    changed = client.patch(f"/api/v2/progressions/{artifact['id']}/voicing", json={'expected_updated_at': artifact['updated_at'], 'chord_index': 0, 'chord': {'root': 'D', 'quality': 'major', 'voicing': [{'string': 1, 'fret': 14}], 'tuning': 'standard'}}).json()
    revisions = client.get(f"/api/v2/library/{artifact['id']}/revisions").json()
    assert len(revisions) == 2
    assert 'payload' not in revisions[0]
    restored = client.post(f"/api/v2/library/{artifact['id']}/restore", json={'revision': artifact['updated_at'], 'expected_updated_at': changed['updated_at']})
    assert restored.status_code == 200, restored.text
    assert restored.json()['payload'] == artifact['payload']
    assert len(client.get(f"/api/v2/library/{artifact['id']}/revisions").json()) == 3
    assert client.post(f"/api/v2/library/{artifact['id']}/restore", json={'revision': artifact['updated_at'], 'expected_updated_at': changed['updated_at']}).status_code == 409
    # Ticket #101: opening a saved artifact yields a fresh Session + main Harmony
    # Branch (UX-05: opening never forks). Reopen-to-fresh-idea-draft is ticket P1.
    opened = client.post(f"/api/v2/library/{artifact['id']}/open").json()
    assert opened['id'] != source.id
    branch = opened['branches'][0]
    assert branch['active_workspace'] == 'harmony'
    assert branch['tutor_thread_id'] != source.branches[0].tutor_thread_id
    assert client.get(f"/api/v2/tutor/threads/{branch['tutor_thread_id']}/messages").json() == []
    foreign = store.create_artifact('other', 'progression', 'Private', artifact['payload'])
    assert client.get(f'/api/v2/library/{foreign.id}/revisions').status_code == 404
    assert client.post(f'/api/v2/library/{foreign.id}/open').status_code == 404
    assert client.post(f'/api/v2/library/{foreign.id}/save', json={'expected_updated_at': foreign.updated_at}).status_code == 404


def test_only_promoted_work_is_in_library_and_save_is_idempotent(client, store, session_and_branch):
    assert client.get('/api/v2/library').json() == []
    raw = store.create_artifact('user_1', 'song_study', 'Raw song', {'tab_data': {}}, saved=False)
    assert client.get('/api/v2/library').json() == []
    saved = client.post(f'/api/v2/library/{raw.id}/save', json={'expected_updated_at': raw.updated_at})
    assert saved.status_code == 200, saved.text
    again = client.post(f'/api/v2/library/{raw.id}/save', json={'expected_updated_at': saved.json()['updated_at']})
    assert again.json()['updated_at'] == saved.json()['updated_at']
    assert len(client.get(f'/api/v2/library/{raw.id}/revisions').json()) == 1


def test_library_all_kinds_and_history_are_owner_scoped(client, store):
    payloads = {
        'song_study': {'title': 'Song', 'tab_data': {'measures': []}},
        'progression': {'title': 'Progression', 'chords': []},
        'exercise': {'title': 'Exercise', 'intent': 'Slow down', 'steps': [], 'created_from': {'title': 'Song'}},
    }
    for kind, payload in payloads.items():
        artifact = store.create_artifact('user_1', kind, kind, payload)
        response = client.post(f'/api/v2/library/{artifact.id}/open')
        assert response.status_code == 201
        assert response.json()['branches'][0]['active_workspace'] == 'harmony'
    listed = client.get('/api/v2/library').json()
    assert {a['kind'] for a in listed} == set(payloads)
    assert all('payload' not in a and 'revisions' not in a for a in listed)
    foreign = store.create_artifact('other', 'progression', 'Private', {})
    assert client.post(f'/api/v2/library/{foreign.id}/restore', json={'revision': 'old', 'expected_updated_at': foreign.updated_at}).status_code == 404
