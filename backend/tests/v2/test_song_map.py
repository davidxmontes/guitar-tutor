from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.dependencies.auth import get_current_user
from app.v2.router import router
from app.v2.store import InMemoryV2Store, get_v2_store
from app.v2.song_enrichment import run_song_enrichment
from tests.v2.tutor_fakes import ScriptedTutorModel


def test_saved_ranges_are_owned_bounded_revision_checked_and_keep_raw_sources(monkeypatch):
    app = FastAPI()
    app.include_router(router, prefix='/api/v2')
    store = InMemoryV2Store()
    app.dependency_overrides[get_current_user] = lambda: 'owner'
    app.dependency_overrides[get_v2_store] = lambda: store
    client = TestClient(app)
    payload = {'song_id': 1, 'artist': 'Fixture', 'title': 'Map', 'track': {'index': 0, 'name': 'Guitar', 'instrument': 'Guitar'},
               'tab_data': {'measures': [{}, {}, {}]}, 'chordpro': '[C]Source'}
    song = store.create_artifact('owner', 'song_study', 'Map', payload)
    url = f'/api/v2/song-studies/{song.id}/ranges'
    data = {'expected_updated_at': song.updated_at, 'ranges': [{'label': 'Tricky change', 'start_measure': 2, 'end_measure': 3}]}
    saved = client.put(url, json=data)
    assert saved.status_code == 200
    assert saved.json()['payload']['saved_ranges'] == data['ranges']
    assert saved.json()['payload']['tab_data'] == payload['tab_data']
    assert saved.json()['payload']['chordpro'] == payload['chordpro']
    assert client.put(url, json=data).status_code == 409
    data['expected_updated_at'] = saved.json()['updated_at']
    data['ranges'][0]['end_measure'] = 4
    assert client.put(url, json=data).status_code == 422
    data['ranges'][0]['end_measure'] = 1
    assert client.put(url, json=data).status_code == 422
    app.dependency_overrides[get_current_user] = lambda: 'other'
    assert client.put(url, json={**data, 'ranges': []}).status_code == 404
    app.dependency_overrides[get_current_user] = lambda: 'owner'
    assert client.put(url, json={**data, 'ranges': []}).json()['payload']['saved_ranges'] == []
    # A slow enhancement must not overwrite a range saved in another request.
    concurrent = [{'label': 'Keep me', 'start_measure': 1, 'end_measure': 2}]
    def concurrent_enrichment(**kwargs):
        from app.v2.models import SongEnrichment
        current = store.get_artifact(song.id, 'owner')
        store.update_artifact(song.id, 'owner', {**current.payload, 'saved_ranges': concurrent})
        return SongEnrichment(tab_fingerprint='test', generated_at='now')
    monkeypatch.setattr('app.v2.router.run_song_enrichment', concurrent_enrichment)
    assert client.post(f'/api/v2/song-studies/{song.id}/enrichment').status_code == 409
    assert store.get_artifact(song.id, 'owner').payload['saved_ranges'] == concurrent


def test_enrichment_keeps_repeat_groups_and_optional_learning_annotations():
    ranges = [dict(start_measure=i, end_measure=i, section='Phrase', confidence='low', kind='phrase',
                   repeat_group='opening', annotation='Practice the shift slowly') for i in (1, 3)]
    result = run_song_enrichment(artifact_id='s', tab_data={'measures': [{}, {}, {}]}, chordpro=None,
                                provider='openai', model='fake', openai_api_key='k',
                                model_factory=lambda *a, **k: ScriptedTutorModel(outcomes=[{'ranges': ranges}]))
    assert [r.repeat_group for r in result.ranges] == ['opening', 'opening']
    assert result.ranges[0].annotation == 'Practice the shift slowly'
    assert result.ranges[0].provenance == 'ai'
