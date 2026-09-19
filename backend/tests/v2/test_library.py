import pytest

from app.v2.progression_state import ProgressionIdeaDraft, ProgressionWorkspaceState
from app.v2.tutor.saved_work import saved_work_tools
from tests.v2.workspace_fixtures import client, store, session_and_branch


def test_library_revisions_restore_and_fresh_conversation(client, store):
    source = store.create_session('user_1')
    artifact = store.create_artifact('user_1', 'progression', 'Dreamy', {'title': 'Dreamy', 'chords': [{'id': 'd', 'root': 'D', 'quality': 'major', 'duration_beats': 4}]}).model_dump()
    store.create_tutor_message(source.branches[0].tutor_thread_id, 'user', {'text': 'old conversation'})
    assert [a['id'] for a in client.get('/api/v2/library').json()] == [artifact['id']]
    changed = store.update_artifact(artifact['id'], 'user_1', {**artifact['payload'], 'title': 'Revised'}, artifact['updated_at'], save=True).model_dump()
    revisions = client.get(f"/api/v2/library/{artifact['id']}/revisions").json()
    assert len(revisions) == 2
    assert 'payload' not in revisions[0]
    restored = client.post(f"/api/v2/library/{artifact['id']}/restore", json={'revision': artifact['updated_at'], 'expected_updated_at': changed['updated_at']})
    assert restored.status_code == 200, restored.text
    assert restored.json()['payload'] == artifact['payload']
    assert len(client.get(f"/api/v2/library/{artifact['id']}/revisions").json()) == 3
    assert client.post(f"/api/v2/library/{artifact['id']}/restore", json={'revision': artifact['updated_at'], 'expected_updated_at': changed['updated_at']}).status_code == 409
    # Reopen gets a fresh Progression idea and conversation.
    opened = client.post(f"/api/v2/library/{artifact['id']}/open").json()
    assert opened['id'] != source.id
    branch = opened['branches'][0]
    assert branch['active_workspace'] == 'progression'
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
        assert response.json()['branches'][0]['active_workspace'] == ('progression' if kind == 'progression' else 'harmony')
    listed = client.get('/api/v2/library').json()
    assert {a['kind'] for a in listed} == set(payloads)
    assert all('payload' not in a and 'revisions' not in a for a in listed)
    by_kind = {a['kind']: a for a in listed}
    assert by_kind['exercise']['provenance'] == {'title': 'Song'}
    assert by_kind['song_study']['provenance']['title'] == 'song_study'
    foreign = store.create_artifact('other', 'progression', 'Private', {})
    assert client.post(f'/api/v2/library/{foreign.id}/restore', json={'revision': 'old', 'expected_updated_at': foreign.updated_at}).status_code == 404


def test_song_library_title_keeps_artist_when_saving_and_editing(client, store):
    song = store.create_artifact('user_1', 'song_study', 'Artist - Song', {'artist': 'Artist', 'title': 'Song'}, saved=False)
    saved = client.post(f'/api/v2/library/{song.id}/save', json={'expected_updated_at': song.updated_at}).json()
    assert saved['title'] == 'Artist - Song'
    changed = store.update_artifact(song.id, 'user_1', {**song.payload, 'saved_ranges': []}, saved['updated_at'])
    assert changed.title == 'Artist - Song'


@pytest.mark.parametrize('tonal_center, provenance, source, source_query', [
    ({'root': 'D', 'scale': 'dorian'},
     {'kind': 'song-idea', 'song': {'title': 'Northern lights', 'artist': 'Example artist', 'song_id': 7}},
     {'title': 'Northern lights', 'artist': 'Example artist', 'song_id': 7}, 'Northern lights'),
    ({'root': 'E', 'scale': 'natural_minor'},
     {'kind': 'concept-seed', 'concept': 'Circle of fifths'},
     {'title': 'Circle of fifths'}, 'Circle fifths'),
    ({'root': 'F#', 'scale': 'major'},
     {'kind': 'harmony-develop', 'scratch': [{'id': 'g', 'root': 'G', 'quality': 'major'}]},
     {'title': 'Harmony'}, 'Harmony'),
])
def test_saved_progression_key_and_source_are_visible_to_library_and_tutor(
    client, store, session_and_branch, tonal_center, provenance, source, source_query,
):
    session_id, branch_id = session_and_branch
    idea = ProgressionIdeaDraft(label='Night loop', tonal_center=tonal_center,
                                chords=[{'root': 'G', 'quality': 'major'}], provenance=provenance)
    branch = store.update_branch(session_id, branch_id, 'user_1', active_workspace='progression',
        progression_workspace=ProgressionWorkspaceState(ideas=[idea], active_idea_id=idea.id))
    response = client.post(f'/api/v2/sessions/{session_id}/branches/{branch_id}/progression/save',
                           json={'expected_updated_at': branch.updated_at})
    assert response.status_code == 200, response.text
    saved = response.json()['artifact']
    search, _ = saved_work_tools(store, 'user_1')
    key = f"{tonal_center['root']} {tonal_center['scale'].replace('_', ' ')}"
    assert [match['id'] for match in search.invoke({'query': key})['matches']] == [saved['id']]
    assert [match['id'] for match in search.invoke({'query': source_query})['matches']] == [saved['id']]
    listed = client.get('/api/v2/library').json()
    assert listed[0]['provenance'] == source
    assert 'payload' not in listed[0]
    assert store.get_artifact(saved['id'], 'user_1').payload == saved['payload']
