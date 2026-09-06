from unittest.mock import Mock

import pytest

from app.v2.store import InMemoryV2Store
from tests.v2.test_tutor_router import _app, _scripted_factory, _open_session_and_branch, _settings
from tests.v2.tutor_fakes import ScriptedTutorModel


@pytest.mark.parametrize("provider", ["openai", "anthropic", "openrouter"])
def test_saved_lookup_runs_on_demand_and_cannot_mutate_library(provider):
    store = InMemoryV2Store()
    saved = store.create_artifact('user_1', 'progression', 'Dreamy dusk', {'title': 'Dreamy dusk', 'chords': [{'root': 'E', 'quality': 'minor', 'voicing': [{'string': 6, 'fret': 0}], 'tuning': 'standard'}]})
    model = ScriptedTutorModel(outcomes=[
        {'tool_calls': [{'name': 'search_saved_work', 'args': {'query': 'dreamy'}, 'id': 'search'}]},
        {'tool_calls': [{'name': 'read_saved_work', 'args': {'artifact_id': saved.id}, 'id': 'read'}]},
        {'message': 'Dreamy dusk starts with E minor. Want to use it as a starting point?'},
    ], usage_metadatas=[{'input_tokens': 10, 'output_tokens': 5, 'total_tokens': 15}] * 3)
    client = _app(store, _scripted_factory(model), _settings(v2_tutor_provider=provider))
    sid, bid = _open_session_and_branch(client)
    before = store.get_session(sid, 'user_1').model_dump()
    response = client.post('/api/v2/tutor/turns', json={'session_id': sid, 'branch_id': bid, 'message': 'Use my saved dreamy progression'})
    assert response.status_code == 200, response.text
    assert response.json()['tool_call_count'] == 2
    assert response.json()['usage']['input_tokens'] == 30
    assert response.json()['usage']['output_tokens'] == 15
    assert 'Dreamy dusk' not in str([m.content for m in model.calls[0]])
    assert 'Dreamy dusk' in str([m.content for m in model.calls[1]])
    assert 'voicing' in str([m.content for m in model.calls[2]])
    assert store.get_artifact(saved.id, 'user_1') == saved
    after = store.get_session(sid, 'user_1').model_dump()
    # A Tutor turn now advances presentation metadata, never the read music.
    assert after['branches'][0]['live_presentation_turn_id']
    for key in ('updated_at', 'live_presentation_turn_id'):
        after['branches'][0][key] = before['branches'][0][key]
    assert after == before


def test_unrelated_creative_prompt_does_not_query_or_inject_saved_library():
    store = InMemoryV2Store()
    store.create_artifact('user_1', 'progression', 'Private library title', {})
    store.list_artifacts = Mock(wraps=store.list_artifacts)
    model = ScriptedTutorModel(outcomes=[{'message': 'Try E with a high F ringing above it.'}])
    client = _app(store, _scripted_factory(model))
    sid, bid = _open_session_and_branch(client)
    response = client.post('/api/v2/tutor/turns', json={'session_id': sid, 'branch_id': bid, 'message': 'give me something weird in E'})
    assert response.status_code == 200
    store.list_artifacts.assert_not_called()
    assert 'Private library title' not in str([m.content for m in model.calls[0]])


def test_search_ambiguity_dates_ownership_and_detached_reads():
    from app.v2.tutor.saved_work import saved_work_tools
    store = InMemoryV2Store()
    first = store.create_artifact('user_1', 'progression', 'Dreamy dusk', {'title': 'Dreamy dusk', 'chords': [{'root': 'D', 'quality': 'minor'}]})
    second = store.create_artifact('user_1', 'progression', 'Dreamy dawn', {'title': 'Dreamy dawn'})
    foreign = store.create_artifact('other', 'progression', 'Dreamy private', {})
    unsaved = store.create_artifact('user_1', 'song_study', 'Dreamy unsaved', {}, saved=False)
    search, read = saved_work_tools(store, 'user_1')
    found = search.invoke({'query': 'dreamy', 'kind': 'progression'})
    assert found['needs_clarification'] is True
    assert {m['id'] for m in found['matches']} == {first.id, second.id}
    assert all('payload' not in match for match in found['matches'])
    assert search.invoke({'query': 'dreamy', 'saved_before': '2000-01-01'})['matches'] == []
    assert search.invoke({'query': 'unmatched'})['matches'] == []
    assert read.invoke({'artifact_id': foreign.id}) == read.invoke({'artifact_id': unsaved.id}) == {'error': 'Saved work not found'}
    result = read.invoke({'artifact_id': first.id})
    result['payload']['chords'][0]['root'] = 'G'
    assert store.get_artifact(first.id, 'user_1').payload['chords'][0]['root'] == 'D'


def test_ambiguous_lookup_returns_a_clarification_through_the_tutor_api():
    store = InMemoryV2Store()
    for title in ('Dreamy dusk', 'Dreamy dawn'):
        store.create_artifact('user_1', 'progression', title, {})
    model = ScriptedTutorModel(outcomes=[
        {'tool_calls': [{'name': 'search_saved_work', 'args': {'query': 'dreamy'}, 'id': 'search'}]},
        {'message': 'Do you mean Dreamy dusk or Dreamy dawn?'},
    ])
    client = _app(store, _scripted_factory(model))
    sid, bid = _open_session_and_branch(client)
    response = client.post('/api/v2/tutor/turns', json={'session_id': sid, 'branch_id': bid, 'message': 'Use my saved dreamy progression'})
    assert response.status_code == 200
    assert response.json()['message'] == 'Do you mean Dreamy dusk or Dreamy dawn?'
    assert response.json()['candidates'] is None
    assert '"needs_clarification": true' in str([m.content for m in model.calls[-1]])


def test_song_reads_are_windowed_and_do_not_expose_history_or_other_raw_layers():
    from app.v2.tutor.saved_work import saved_work_tools
    store = InMemoryV2Store()
    song = store.create_artifact('user_1', 'song_study', 'Saved song', {'track': {'tuning': [64,59,55,50,45,38]}, 'tab_data': {'measures': [{'number': n} for n in range(20)]}, 'chordpro': 'long lyrics', 'shape_events': ['derived'], 'enrichment': {}})
    _, read = saved_work_tools(store, 'user_1')
    first = read.invoke({'artifact_id': song.id})
    assert len(first['payload']['tab_data']['measures']) == 8
    assert first['next_measure'] == 8
    assert first['payload']['track']['tuning'][-1] == 38
    assert not {'revisions', 'chordpro', 'shape_events', 'enrichment'} & first['payload'].keys()
    last = read.invoke({'artifact_id': song.id, 'start_measure': 16})
    assert len(last['payload']['tab_data']['measures']) == 4
    assert last['next_measure'] is None


def test_repeated_lookup_loop_is_bounded_without_persisting_a_partial_answer():
    store = InMemoryV2Store()
    model = ScriptedTutorModel(outcomes=[{'tool_calls': [{'name': 'search_saved_work', 'args': {'query': 'dreamy'}, 'id': f'loop-{i}'}]} for i in range(50)])
    client = _app(store, _scripted_factory(model))
    sid, bid = _open_session_and_branch(client)
    response = client.post('/api/v2/tutor/turns', json={'session_id': sid, 'branch_id': bid, 'message': 'Find my saved dreamy progression'})
    assert response.status_code == 502
    assert len(model.calls) < 20
    branch = store.get_session(sid, 'user_1').branches[0]
    assert store.list_tutor_messages(branch.tutor_thread_id, 'user_1') == []
