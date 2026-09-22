"""Song questions use owned score data without changing workspace music or layout."""
from copy import deepcopy
from threading import Event
from time import monotonic, sleep

import pytest
from pydantic import Field

from app.v2.store import InMemoryV2Store
from app.v2.turns import musical_snapshot, live_composition
from app.v2.tutor.providers import build_tutor_model
from tests.v2.test_tutor_router import _app, _scripted_factory, _open_session_and_branch, _settings
from tests.v2.tutor_fakes import ScriptedTutorModel


class SongModel(ScriptedTutorModel):
    offered_tools: list[str] = Field(default_factory=list)

    def bind_tools(self, tools, **kwargs):
        self.offered_tools = [tool.name if hasattr(tool, 'name') else str(tool) for tool in tools]
        return super().bind_tools(tools, **kwargs)


def song(store, user='user_1'):
    return store.create_artifact(user, 'song_study', 'Selected song', {
        'song_id': 42, 'artist': 'Artist', 'title': 'Selected song',
        'track': {'index': 2, 'name': 'Lead guitar', 'instrument': 'Guitar', 'tuning': [64, 59, 55, 50, 45, 38]},
        'tab_data': {'capo': 2, 'tuning': [64, 59, 55, 50, 45, 40],
            'automations': {'tempo': [{'type': 4, 'measure': 0, 'position': 0, 'bpm': 88}]},
            'measures': [{'signature': [3, 4], 'voices': [{'beats': [
                {'duration': [1, 8], 'notes': [{'string': 5, 'fret': 5, 'hammerOn': True, 'slide': 'shift'}]},
                {'duration': [1, 4], 'notes': [{'string': 0, 'fret': 12, 'bend': {'type': 'bend', 'value': 2}}]},
            ]}]}, {'voices': [{'beats': [{'duration': [1, 4], 'rest': True, 'notes': []}]}]}]},
        'shape_events': [{'label': 'D shape', 'positions': [{'string': 6, 'fret': 5}, {'string': 5, 'fret': 0}],
                          'tuning': [64, 59, 55, 50, 45, 38], 'sources': [{'measure_index': 0, 'beat_index': 0}]}],
    }, saved=False)


def request(session, branch, artifact, selection=None):
    return {'session_id': session, 'branch_id': branch, 'message': 'Explain this passage',
            'song_context': {'artifact_id': artifact.id, 'selection': selection or {'type': 'beat', 'measureIndex': 0, 'beatIndex': 0}}}


def finished(client, data):
    deadline = monotonic() + 5
    while monotonic() < deadline:
        result = client.get('/api/v2/tutor/jobs', params={'session_id': data['session_id'], 'branch_id': data['branch_id']}).json()
        if result['status'] != 'running':
            return result
        sleep(.01)
    raise AssertionError('Tutor job did not finish')


def test_exact_score_context_history_and_message_only_tools_preserve_music_and_layout():
    store = InMemoryV2Store()
    artifact = song(store)
    model = SongModel(outcomes=[{'message': 'Use the hammer-on.'}, {'message': 'That earlier low note is on string six.'}],
                      usage_metadatas=[{'input_tokens': 50, 'output_tokens': 10, 'total_tokens': 60}])
    with _app(store, _scripted_factory(model)) as client:
        sid, bid = _open_session_and_branch(client)
        before = deepcopy(store.get_session(sid, 'user_1').branches[0])
        response = client.post('/api/v2/tutor/turns', json=request(sid, bid, artifact))
        assert response.status_code == 200, response.text
        body = response.json()
        assert model.offered_tools == ['SongTutorTerminal']
        prompt = model.calls[0][-1].content
        assert 'hammerOn' in prompt and 'shift' in prompt and 'D shape' in prompt
        assert '"capo": 2' in prompt and '[64, 59, 55, 50, 45, 38]' in prompt and '"bpm": 88' in prompt
        assert '"fret": 12' not in prompt and '"bend"' not in prompt
        assert 'read-only' in model.calls[0][0].content
        assert body['usage']['input_tokens'] == 50 and body['tool_call_count'] == 0
        assert body['mutation'] is None and body['candidates'] is None and not body['presentation_applied']
        after = store.get_session(sid, 'user_1').branches[0]
        assert musical_snapshot(after) == musical_snapshot(before)
        history = store.list_tutor_messages(after.tutor_thread_id, 'user_1')
        assert live_composition(after, history) == live_composition(before, [])
        assert history[0].content == {'text': 'Explain this passage'}
        assert history[1].content['song_context']['selection']['beatIndex'] == 0
        second = request(sid, bid, artifact, {'type': 'beat', 'measureIndex': 0, 'beatIndex': 1})
        assert client.post('/api/v2/tutor/turns', json=second).status_code == 200
        assert 'hammerOn' in model.calls[1][2].content  # Persisted context on prior answer.
        assert '"bend"' in model.calls[1][-1].content and 'hammerOn' not in model.calls[1][-1].content


@pytest.mark.parametrize('selection', [
    {'type': 'beat', 'measureIndex': 0, 'beatIndex': 99},
    {'type': 'beat', 'measureIndex': True, 'beatIndex': 0},
    {'type': 'beat', 'measureIndex': '0', 'beatIndex': 0},
    {'type': 'range', 'startMeasureIndex': 1, 'endMeasureIndex': 0},
    {'type': 'range', 'startMeasureIndex': 0, 'endMeasureIndex': 2},
    {'type': 'beat', 'measureIndex': -1, 'beatIndex': 0},
    {'type': 'beat', 'measureIndex': 0, 'beatIndex': 0, 'notes': 'untrusted override'},
])
def test_bad_selection_is_rejected_before_provider(selection):
    store, model = InMemoryV2Store(), SongModel()
    artifact = song(store)
    with _app(store, _scripted_factory(model)) as client:
        sid, bid = _open_session_and_branch(client)
        assert client.post('/api/v2/tutor/jobs', json=request(sid, bid, artifact, selection)).status_code == 422
        assert model.calls == []
        assert client.get('/api/v2/tutor/jobs', params={'session_id': sid, 'branch_id': bid}).json() is None


def test_foreign_song_is_rejected_and_large_owned_context_is_accepted():
    store, model = InMemoryV2Store(), SongModel(outcomes=[{'message': 'Practise the whole section.'}, {'message': 'Explain the full passage.'}])
    foreign, owned = song(store, 'other'), song(store)
    with _app(store, _scripted_factory(model)) as client:
        sid, bid = _open_session_and_branch(client)
        assert client.post('/api/v2/tutor/jobs', json=request(sid, bid, foreign)).status_code == 404
        payload = deepcopy(owned.payload)
        payload['tab_data']['measures'] *= 5
        owned = store.update_artifact(owned.id, 'user_1', payload, owned.updated_at)
        response = client.post('/api/v2/tutor/jobs', json=request(sid, bid, owned, {'type': 'range', 'startMeasureIndex': 0, 'endMeasureIndex': 8}))
        assert response.status_code == 202
        assert finished(client, request(sid, bid, owned))['status'] == 'completed'
        payload = deepcopy(owned.payload)
        payload['tab_data']['measures'][0]['voices'][0]['beats'][0]['notes'][0]['annotation'] = 'x' * 24000
        owned = store.update_artifact(owned.id, 'user_1', payload, owned.updated_at)
        response = client.post('/api/v2/tutor/jobs', json=request(sid, bid, owned))
        assert response.status_code == 202
        assert finished(client, request(sid, bid, owned))['status'] == 'completed'
        assert len(model.calls) == 2
        assert 'x' * 24000 in model.calls[-1][-1].content


def test_song_jobs_echo_context_and_do_not_deduplicate_different_selections(monkeypatch):
    import importlib
    routes = importlib.import_module('app.v2.router')
    release = Event()
    original = routes.run_tutor_turn
    def delayed(**kwargs):
        assert release.wait(5)
        return original(**kwargs)
    monkeypatch.setattr(routes, 'run_tutor_turn', delayed)
    store, model = InMemoryV2Store(), SongModel(outcomes=[{'message': 'The selected rest is silent.'}])
    artifact = song(store)
    with _app(store, _scripted_factory(model)) as client:
        sid, bid = _open_session_and_branch(client)
        data = request(sid, bid, artifact, {'type': 'range', 'startMeasureIndex': 1, 'endMeasureIndex': 1}) | {'request_id': 'song-turn'}
        try:
            first = client.post('/api/v2/tutor/jobs', json=data)
            assert first.status_code == 202 and first.json()['song_context'] == data['song_context']
            assert client.post('/api/v2/tutor/jobs', json=data).json()['id'] == 'song-turn'
            assert client.post('/api/v2/tutor/jobs', json=request(sid, bid, artifact)).status_code == 409
            assert client.post('/api/v2/tutor/jobs', json={**data, 'song_context': None}).status_code == 409
        finally:
            release.set()
        assert finished(client, data)['status'] == 'completed'
        assert '"signature": [3, 4]' in model.calls[0][-1].content
        assert client.post('/api/v2/tutor/jobs', json={**data, 'song_context': request(sid, bid, artifact)['song_context']}).status_code == 409


def test_missing_provider_credentials_explain_configuration_without_a_model_call():
    store = InMemoryV2Store()
    with _app(store, build_tutor_model, _settings(openai_api_key='', anthropic_api_key='', openrouter_api_key='')) as client:
        sid, bid = _open_session_and_branch(client)
        data = request(sid, bid, song(store))
        assert client.post('/api/v2/tutor/jobs', json=data).status_code == 202
        result = finished(client, data)
        assert result['status'] == 'failed'
        assert 'not configured on this server' in result['error'] and 'API key' in result['error']


@pytest.mark.parametrize('automations', ['bad', {'tempo': 'bad'}, {'tempo': [None]}, {'tempo': [{'measure': 0, 'position': 'bad'}]}])
def test_malformed_tempo_is_a_readable_validation_error(automations):
    store, model = InMemoryV2Store(), SongModel()
    artifact = song(store)
    payload = deepcopy(artifact.payload)
    payload['tab_data']['automations'] = automations
    artifact = store.update_artifact(artifact.id, 'user_1', payload, artifact.updated_at)
    with _app(store, _scripted_factory(model)) as client:
        sid, bid = _open_session_and_branch(client)
        response = client.post('/api/v2/tutor/jobs', json=request(sid, bid, artifact))
        assert response.status_code == 422 and 'tempo data' in response.text
        assert model.calls == []


def test_read_only_schema_rejects_model_mutation_and_large_beat_ranges():
    store = InMemoryV2Store()
    artifact = song(store)
    model = SongModel(outcomes=[{'message': 'Changed it.', 'mutation': {'kind': 'set_scale', 'scale': 'dorian'}}, {'message': 'Try this slowly.'}, {'message': 'Practise the entire measure.'}])
    with _app(store, _scripted_factory(model)) as client:
        sid, bid = _open_session_and_branch(client)
        before = musical_snapshot(store.get_session(sid, 'user_1').branches[0])
        response = client.post('/api/v2/tutor/turns', json=request(sid, bid, artifact))
        assert response.status_code == 200 and response.json()['message'] == 'Try this slowly.'
        assert musical_snapshot(store.get_session(sid, 'user_1').branches[0]) == before
        payload = deepcopy(artifact.payload)
        payload['tab_data']['measures'][0]['voices'][0]['beats'] *= 65
        artifact = store.update_artifact(artifact.id, 'user_1', payload, artifact.updated_at)
        response = client.post('/api/v2/tutor/jobs', json=request(sid, bid, artifact, {'type': 'range', 'startMeasureIndex': 0, 'endMeasureIndex': 0}))
        assert response.status_code == 202
        assert finished(client, request(sid, bid, artifact))['status'] == 'completed'


def test_tempo_context_keeps_active_change_and_selected_measures_only():
    from app.v2.tutor.song_context import resolve_song_context, SongRangeSelection
    store = InMemoryV2Store()
    artifact = song(store)
    artifact.payload['tab_data']['automations']['tempo'] = [
        {'measure': 0, 'position': 0, 'bpm': 88}, {'measure': 0, 'position': .5, 'bpm': 92},
        {'measure': 1, 'position': .25, 'bpm': 100}, {'measure': 2, 'position': 0, 'bpm': 120},
    ]
    context = resolve_song_context(artifact, SongRangeSelection(type='range', startMeasureIndex=1, endMeasureIndex=1))
    assert [change['bpm'] for change in context['tempo']] == [92, 100]


def test_identical_shapes_share_one_definition_without_losing_occurrences():
    from app.v2.tutor.song_context import resolve_song_context, SongRangeSelection
    artifact = song(InMemoryV2Store())
    duplicate = deepcopy(artifact.payload['shape_events'][0])
    duplicate['sources'] = [{'measure_index': 0, 'beat_index': 1}]
    artifact.payload['shape_events'].append(duplicate)
    context = resolve_song_context(artifact, SongRangeSelection(type='range', startMeasureIndex=0, endMeasureIndex=0))
    assert len(context['shapes']) == 1
    assert context['shapes'][0]['sources'] == [
        {'measure_index': 0, 'beat_index': 0}, {'measure_index': 0, 'beat_index': 1}]
    assert context['measures'][0]['beats'][1]['raw']['notes'][0]['bend'] == {'type': 'bend', 'value': 2}
