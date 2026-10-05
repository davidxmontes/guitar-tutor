from copy import deepcopy

import pytest

from tests.v2.workspace_fixtures import client, store


def riff():
    return {
        'title': 'Low D answer', 'tempo': 93, 'tuning': [64, 59, 55, 50, 45, 38],
        'tonal_center': {'root': 'D', 'scale': 'natural_minor'},
        'events': [
            {'id': 'bass', 'beats': 2, 'position': {'string': 6, 'fret': 0}},
            {'id': 'space', 'beats': 0.5, 'position': None},
            {'id': 'answer', 'beats': 1, 'position': {'string': 2, 'fret': 3}},
        ],
    }


def test_save_reopen_update_restore_preserves_physical_music_without_a_session(client, store):
    payload = riff()
    response = client.post('/api/v2/riffs', json=payload)
    assert response.status_code == 201, response.text
    saved = response.json()
    path = f"/api/v2/riffs/{saved['id']}"
    assert saved['kind'] == 'riff' and saved['saved_at']
    assert saved['payload'] == payload
    assert client.get(path).json() == saved
    listed = client.get('/api/v2/library').json()
    assert [(a['id'], a['kind'], a['title']) for a in listed] == [(saved['id'], 'riff', payload['title'])]
    assert 'payload' not in listed[0]
    assert client.get('/api/v2/sessions').json() == []
    assert client.post(f"/api/v2/library/{saved['id']}/open").status_code == 422
    assert client.get('/api/v2/sessions').json() == []

    changed = deepcopy(payload)
    changed.update(title='Revised answer', tempo=108, tonal_center=None)
    changed['events'][0]['position']['fret'] = 5
    updated = client.put(path, json={'expected_updated_at': saved['updated_at'], 'payload': changed})
    assert updated.status_code == 200, updated.text
    updated = updated.json()
    assert updated['id'] == saved['id'] and updated['title'] == changed['title']
    assert client.get(path).json()['payload'] == changed
    assert len(store.list_artifacts('user_1')) == 1
    revisions_path = f"/api/v2/library/{saved['id']}/revisions"
    assert client.get(revisions_path).json() == [
        {'revision': saved['updated_at'], 'current': False},
        {'revision': updated['updated_at'], 'current': True},
    ]
    repeated = client.put(path, json={'expected_updated_at': updated['updated_at'], 'payload': changed})
    assert repeated.json()['updated_at'] == updated['updated_at']
    assert len(client.get(revisions_path).json()) == 2
    stale = client.put(path, json={'expected_updated_at': saved['updated_at'], 'payload': payload})
    assert stale.status_code == 409
    assert client.get(path).json()['payload'] == changed
    restore_path = f"/api/v2/library/{saved['id']}/restore"
    restored = client.post(restore_path, json={'revision': saved['updated_at'], 'expected_updated_at': updated['updated_at']})
    assert restored.status_code == 200, restored.text
    assert restored.json()['payload'] == payload
    assert restored.json()['title'] == payload['title']
    assert client.get(path).json()['payload'] == payload
    assert len(client.get(revisions_path).json()) == 3
    assert client.post(restore_path, json={'revision': saved['updated_at'], 'expected_updated_at': updated['updated_at']}).status_code == 409


@pytest.mark.parametrize('field,value', [
    ('title', ''), ('title', '  '), ('title', 'a' * 121), ('title', 10),
    ('tempo', 44), ('tempo', 181), ('tempo', 80.5), ('tempo', True), ('tempo', '90'),
    ('tuning', [64]), ('tuning', [64, 59, 55, 50, 45, 40, 38]),
    ('tuning', [128, 59, 55, 50, 45, 40]), ('tuning', [-1, 59, 55, 50, 45, 40]),
    ('tuning', [64.1, 59, 55, 50, 45, 40]), ('tuning', [True, 59, 55, 50, 45, 40]),
    ('tonal_center', {'root': 'H', 'scale': 'major'}),
    ('tonal_center', {'root': 'A', 'scale': 'unknown'}),
    ('events', []), ('events', [{'id': 'rest', 'beats': 1, 'position': None}]),
    ('events', [dict(riff()['events'][0], id=str(i)) for i in range(257)]),
])
def test_invalid_payload_never_creates_or_overwrites_saved_work(client, store, field, value):
    saved_response = client.post('/api/v2/riffs', json=riff())
    assert saved_response.status_code == 201, saved_response.text
    saved = saved_response.json()
    invalid = riff()
    invalid[field] = value
    assert client.post('/api/v2/riffs', json=invalid).status_code == 422
    assert client.put(f"/api/v2/riffs/{saved['id']}", json={'expected_updated_at': saved['updated_at'], 'payload': invalid}).status_code == 422
    current = store.get_artifact(saved['id'], 'user_1')
    assert current.payload == saved['payload'] and current.updated_at == saved['updated_at']
    assert current.revisions == [] and len(store.list_artifacts('user_1')) == 1


@pytest.mark.parametrize('change', [
    {'id': ''}, {'id': ' '}, {'id': 'a' * 81}, {'id': 'space'},
    {'beats': 0}, {'beats': 1.5}, {'beats': True}, {'beats': '1'},
    {'position': {'string': 0, 'fret': 0}}, {'position': {'string': 7, 'fret': 0}},
    {'position': {'string': 1, 'fret': -1}}, {'position': {'string': 1, 'fret': 25}},
    {'position': {'string': 1, 'fret': 0.5}}, {'pitch': 38},
])
def test_invalid_or_duplicate_event_is_rejected(client, store, change):
    invalid = riff()
    invalid['events'][0].update(change)
    assert client.post('/api/v2/riffs', json=invalid).status_code == 422
    assert store.list_artifacts('user_1') == []


def test_tuning_is_authoritative_and_payload_has_no_editor_or_computed_state(client, store):
    payload = riff()
    payload['tuning'][5] = 127
    payload['events'][0]['position']['fret'] = 1
    assert client.post('/api/v2/riffs', json=payload).status_code == 422
    payload['events'][0]['position']['fret'] = 0
    payload['title'] = '  Highest note  '
    response = client.post('/api/v2/riffs', json=payload)
    assert response.status_code == 201, response.text
    assert response.json()['title'] == response.json()['payload']['title'] == 'Highest note'
    for extra in ('pitches', 'preview', 'selected_id', 'playing', '_library'):
        invalid = riff() | {extra: []}
        assert client.post('/api/v2/riffs', json=invalid).status_code == 422
    assert len(store.list_artifacts('user_1')) == 1


def test_read_update_history_restore_hide_foreign_and_wrong_kind_artifacts(client, store):
    # API creation failure provides the RED evidence before ArtifactKind includes riff.
    response = client.post('/api/v2/riffs', json=riff())
    assert response.status_code == 201, response.text
    for owner, kind in [('other', 'riff'), ('user_1', 'progression')]:
        artifact = store.create_artifact(owner, kind, 'Private', riff())
        assert client.get(f'/api/v2/riffs/{artifact.id}').status_code == 404
        assert client.put(f'/api/v2/riffs/{artifact.id}', json={'expected_updated_at': artifact.updated_at, 'payload': riff()}).status_code == 404
        if owner == 'other':
            assert client.get(f'/api/v2/library/{artifact.id}/revisions').status_code == 404
            assert client.post(f'/api/v2/library/{artifact.id}/restore', json={'revision': artifact.updated_at, 'expected_updated_at': artifact.updated_at}).status_code == 404
    assert client.get('/api/v2/riffs/missing').status_code == 404
    assert client.put('/api/v2/riffs/missing', json={'expected_updated_at': 'old', 'payload': riff()}).status_code == 404


def test_unsupported_saved_riff_is_rejected_without_rewriting_it(client, store):
    response = client.post('/api/v2/riffs', json=riff())
    assert response.status_code == 201, response.text
    saved = response.json()
    corrupt = store.update_artifact(saved['id'], 'user_1', {'title': 'Unsupported', 'events': []}, saved['updated_at'])
    assert client.get(f"/api/v2/riffs/{saved['id']}").status_code == 422
    assert client.put(f"/api/v2/riffs/{saved['id']}", json={'expected_updated_at': corrupt.updated_at, 'payload': riff()}).status_code == 422
    assert client.post(f"/api/v2/library/{saved['id']}/save", json={'expected_updated_at': corrupt.updated_at}).status_code == 422
    assert store.get_artifact(saved['id'], 'user_1').payload == corrupt.payload

    # An unsupported historical payload cannot replace a valid current version.
    repaired = store.update_artifact(saved['id'], 'user_1', riff(), corrupt.updated_at, save=True)
    response = client.post(f"/api/v2/library/{saved['id']}/restore", json={
        'revision': corrupt.updated_at, 'expected_updated_at': repaired.updated_at,
    })
    assert response.status_code == 422
    assert store.get_artifact(saved['id'], 'user_1').payload == repaired.payload
    assert store.get_artifact(saved['id'], 'user_1').updated_at == repaired.updated_at
