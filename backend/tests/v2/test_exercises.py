import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.dependencies.auth import get_current_user
from app.v2.router import router
from app.v2.store import InMemoryV2Store, get_v2_store

@pytest.fixture
def setup():
    store = InMemoryV2Store()
    app = FastAPI()
    app.include_router(router, prefix='/api/v2')
    app.dependency_overrides[get_current_user] = lambda: 'learner'
    app.dependency_overrides[get_v2_store] = lambda: store
    return TestClient(app), store

def drill(source):
    return dict(title='Low D transition', intent='Keep the open bass ringing between changes',
                source_artifact_id=source.id, expected_updated_at=source.updated_at,
                source_selection={'type': 'range', 'startMeasureIndex': 2, 'endMeasureIndex': 3},
                tempo=90, steps=[dict(label='D bass', beats=1.5, positions=[dict(string=6, fret=0)], tuning=[64,59,55,50,45,38]),
                                 dict(label='Rest', beats=0.5, positions=[], tuning=[64,59,55,50,45,38])])

@pytest.mark.parametrize('kind', ['song_study', 'progression'])
def test_save_copies_drill_and_reopens_with_fresh_conversation(setup, kind):
    client, store = setup
    source = store.create_artifact('learner', kind, 'Source', {'original': True})
    assert client.get('/api/v2/exercises').json() == []
    response = client.post('/api/v2/exercises', json=drill(source))
    assert response.status_code == 201, response.text
    saved = response.json()
    store.update_artifact(source.id, 'learner', {'changed': True})
    assert saved['payload']['steps'] == drill(source)['steps']
    assert saved['payload']['created_from']['artifact_id'] == source.id
    assert saved['payload']['created_from']['selection']['startMeasureIndex'] == 2
    first = client.post(f"/api/v2/exercises/{saved['id']}/open").json()
    second = client.post(f"/api/v2/exercises/{saved['id']}/open").json()
    assert first['id'] != second['id']
    assert first['branches'][0]['tutor_thread_id'] != second['branches'][0]['tutor_thread_id']
    assert client.get(f"/api/v2/exercises/{saved['id']}").json()['payload'] == saved['payload']
    assert len(client.get('/api/v2/exercises').json()) == 1
    assert store.get_artifact(source.id, 'learner').payload == {'changed': True}

def test_ownership_stale_sources_and_invalid_music(setup):
    client, store = setup
    source = store.create_artifact('another-user', 'progression', 'Private', {})
    assert client.post('/api/v2/exercises', json=drill(source)).status_code == 404
    source = store.create_artifact('learner', 'progression', 'Source', {})
    request = drill(source)
    request['expected_updated_at'] = 'stale'
    assert client.post('/api/v2/exercises', json=request).status_code == 409
    for field, value in [('steps', []), ('intent', ' '), ('tempo', 0)]:
        request = drill(source); request[field] = value
        assert client.post('/api/v2/exercises', json=request).status_code == 422
    for field, value in [('beats', 0), ('tuning', [64]), ('positions', [{'string': 7, 'fret': 0}]), ('positions', [{'string': 1, 'fret': 0}, {'string': 1, 'fret': 2}])]:
        request = drill(source); request['steps'][0][field] = value
        assert client.post('/api/v2/exercises', json=request).status_code == 422
    foreign = store.create_artifact('another-user', 'exercise', 'Private exercise', {})
    assert client.get(f'/api/v2/exercises/{foreign.id}').status_code == 404
    assert client.post(f'/api/v2/exercises/{foreign.id}/open').status_code == 404
    assert client.get('/api/v2/exercises').json() == []
