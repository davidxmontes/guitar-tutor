import httpx
import pytest

from app.v2.tutor.web_search import search_song, SongSearchError
from app.v2.store import InMemoryV2Store
from tests.v2.test_song_tutor import song, request, finished, SongModel
from tests.v2.test_tutor_router import _app, _scripted_factory, _open_session_and_branch, _settings


def test_tavily_request_and_safe_bounded_sources(monkeypatch):
    def post(url, **kwargs):
        assert url == 'https://api.tavily.com/search'
        assert kwargs['headers']['Authorization'] == 'Bearer test-key'
        assert kwargs['json']['search_depth'] == 'basic'
        assert kwargs['json']['max_results'] == 5
        assert not kwargs['json']['include_raw_content']
        assert len(kwargs['json']['query']) == 400
        return httpx.Response(200, json={'results': [
            {'url': 'https://example.com/tab', 'title': 'A tab', 'content': 'G string 8h9'},
            {'url': 'javascript:alert(1)', 'title': 'Bad'}]}, request=httpx.Request('POST', url))
    monkeypatch.setattr(httpx, 'post', post)
    assert search_song('x' * 500, 'test-key') == [{'url': 'https://example.com/tab', 'title': 'A tab', 'content': 'G string 8h9'}]


@pytest.mark.parametrize('status', [401, 429, 500])
def test_search_failure_hides_provider_body(monkeypatch, status):
    monkeypatch.setattr(httpx, 'post', lambda url, **kwargs: httpx.Response(status, text='private account details', request=httpx.Request('POST', url)))
    with pytest.raises(SongSearchError, match='Check the Tavily key') as error:
        search_song('song', 'test-key')
    assert 'private' not in str(error.value)


def test_search_is_opt_in_owned_and_persisted_with_answer(monkeypatch):
    calls = []
    def post(url, **kwargs):
        calls.append(kwargs['json'])
        return httpx.Response(200, json={'results': [{'url': 'https://example.com/tab', 'title': 'Alternative tab', 'content': 'G string 8h9'}]}, request=httpx.Request('POST', url))
    monkeypatch.setattr(httpx, 'post', post)
    store = InMemoryV2Store()
    model = SongModel(outcomes=[{'message': 'Local score.'}, {'tool_calls': [{'name': 'search_online', 'args': {'query': 'Artist Selected song alternate solo tab'}, 'id': 'search-1', 'type': 'tool_call'}]}, {'message': 'The excerpt shows 8h9 [source](https://example.com/tab).'}])
    with _app(store, _scripted_factory(model), _settings(tavily_api_key='test-key')) as client:
        sid, bid = _open_session_and_branch(client)
        artifact = song(store)
        data = request(sid, bid, artifact)
        assert client.post('/api/v2/tutor/turns', json=data).status_code == 200
        assert calls == []
        foreign = request(sid, bid, song(store, 'other')) | {'web_search': True}
        assert client.post('/api/v2/tutor/turns', json=foreign).status_code == 404
        assert calls == []
        online = data | {'web_search': True, 'request_id': 'online'}
        accepted = client.post('/api/v2/tutor/jobs', json=online)
        assert accepted.status_code == 202 and accepted.json()['web_search']
        assert finished(client, online)['status'] == 'completed'
        assert len(calls) == 1 and 'Artist Selected song' in calls[0]['query']
        assert any('G string 8h9' in str(message.content) for message in model.calls[-1])
        assert 'untrusted evidence' in model.calls[-1][0].content
        thread = store.get_session(sid, 'user_1').branches[0].tutor_thread_id
        assert store.list_tutor_messages(thread, 'user_1')[-1].content['song_context']['web_sources'][0]['url'] == 'https://example.com/tab'
        assert client.post('/api/v2/tutor/jobs', json=online | {'web_search': False}).status_code == 409


def test_missing_key_is_returned_to_agent_and_persisted_without_fake_sources():
    store, model = InMemoryV2Store(), SongModel(outcomes=[
        {'tool_calls': [{'name': 'search_online', 'args': {'query': 'song tab'}, 'id': 'search-1', 'type': 'tool_call'}]},
        {'message': 'Online search needs TAVILY_API_KEY. I can explain your score meanwhile.'}])
    with _app(store, _scripted_factory(model), _settings(tavily_api_key='')) as client:
        sid, bid = _open_session_and_branch(client)
        data = request(sid, bid, song(store)) | {'web_search': True}
        assert client.post('/api/v2/tutor/jobs', json=data).status_code == 202
        result = finished(client, data)
        assert result['status'] == 'completed'
        assert 'TAVILY_API_KEY' in result['result']['message']
        assert result['message'] == data['message'] and result['web_search']
        assert 'TAVILY_API_KEY' in str(model.calls[-1][-1].content)
        thread = store.get_session(sid, 'user_1').branches[0].tutor_thread_id
        context = store.list_tutor_messages(thread, 'user_1')[-1].content['song_context']
        assert context['web_sources'] == [] and 'TAVILY_API_KEY' in context['web_search_error']


def test_empty_results_are_explicit_and_timeout_is_recoverable(monkeypatch):
    monkeypatch.setattr(httpx, 'post', lambda url, **kwargs: httpx.Response(200, json={'results': []}, request=httpx.Request('POST', url)))
    assert search_song('song', 'test-key') == []
    def timeout(*args, **kwargs):
        raise httpx.ReadTimeout('provider detail')
    monkeypatch.setattr(httpx, 'post', timeout)
    with pytest.raises(SongSearchError, match='Online search could not finish'):
        search_song('song', 'test-key')


def test_agent_can_answer_without_search_even_when_enabled(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError('Search must not be automatic')
    monkeypatch.setattr(httpx, 'post', forbidden)
    store, model = InMemoryV2Store(), SongModel(outcomes=[{'message': 'A hammer-on sounds the higher fret without picking again.'}])
    with _app(store, _scripted_factory(model)) as client:
        sid, bid = _open_session_and_branch(client)
        result = client.post('/api/v2/tutor/turns', json=request(sid, bid, song(store)) | {'web_search': True})
        assert result.status_code == 200
        assert 'search_online' in model.offered_tools
        assert result.json()['tool_call_count'] == 0


def test_agent_can_refine_search_with_bounded_calls(monkeypatch):
    from app.v2.tutor.web_search import song_search_tools
    queries = []
    def post(url, **kwargs):
        queries.append(kwargs['json']['query'])
        return httpx.Response(200, json={'results': []}, request=httpx.Request('POST', url))
    monkeypatch.setattr(httpx, 'post', post)
    tool = song_search_tools('test-key', {})[0]
    for query in ['song tabs', 'song solo alternate', 'song solo live']:
        assert tool.invoke({'query': query}) == {'results': []}
    assert 'budget' in tool.invoke({'query': 'one more'})['error']
    assert len(queries) == 3
