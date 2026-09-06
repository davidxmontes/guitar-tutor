from copy import deepcopy
import pytest
from app.v2.store import InMemoryV2Store, RevisionConflictError
from app.v2.turns import musical_snapshot, live_composition

SURFACE = {'pattern': 'explanation-led', 'focal': 'explanation', 'slots': {
    'explanation': [{'kind': 'explanation', 'config': {'text': 'First view'}}], 'illustration': [{'kind': 'fretboard'}]}}


def test_commit_snapshot_undo_restore_and_stale_write():
    store = InMemoryV2Store()
    session = store.create_session('owner')
    branch = deepcopy(session.branches[0])
    new = branch.model_copy(deep=True)
    from app.v2.harmony_state import TonalCenter
    new.harmony_exploration.tonal_center = TonalCenter(root='D', scale='major')
    content = {'text': 'Changed', 'presentation': SURFACE}
    result = store.commit_workspace_turn(branch, 'owner', musical_snapshot(new), 'Question', content)
    messages = store.list_tutor_messages(branch.tutor_thread_id, 'owner')
    assert len(messages) == 2
    assert messages[1].content['musical_snapshot'] == musical_snapshot(branch)
    assert result.live_presentation_turn_id == messages[1].id
    assert live_composition(result, messages).pattern == SURFACE['pattern']
    with pytest.raises(RevisionConflictError):
        store.commit_workspace_turn(branch, 'owner', musical_snapshot(new), 'stale', content)
    undone = store.restore_workspace_turn(result, 'owner', messages[1].id, undo=True)
    assert musical_snapshot(undone) == musical_snapshot(branch)
    assert len(store.list_tutor_messages(branch.tutor_thread_id, 'owner')) == 2
    restored = store.restore_workspace_turn(undone, 'owner', messages[1].id)
    assert restored.live_presentation_turn_id == messages[1].id
    assert musical_snapshot(restored) == musical_snapshot(undone)


def test_invalid_commit_preserves_both_state_and_message_log():
    store = InMemoryV2Store()
    session = store.create_session('owner')
    branch = deepcopy(session.branches[0])
    with pytest.raises(ValueError):
        store.commit_workspace_turn(branch, 'owner', {'harmony_exploration': None, 'progression_workspace': None, 'active_workspace': 'harmony'}, 'Question', {'text': 'bad', 'presentation': SURFACE})
    assert store.list_tutor_messages(branch.tutor_thread_id, 'owner') == []
    assert store.get_session(session.id, 'owner').branches[0] == branch


def test_no_turns_have_a_nonempty_deterministic_surface():
    branch = InMemoryV2Store().create_session('owner').branches[0]
    assert live_composition(branch, []).slots


def test_scripted_invalid_presentation_retries_once_and_preserves_valid_music(monkeypatch):
    from app.v2.tutor import runner
    from tests.v2.test_tutor_router import _app, _scripted_factory
    from tests.v2.tutor_fakes import ScriptedTutorModel
    from app.v2.harmony_state import TonalCenter
    def mutation(branch, operation):
        updated = branch.model_copy(deep=True)
        if operation:
            updated.harmony_exploration.tonal_center = TonalCenter(root='D', scale='major')
        return updated
    monkeypatch.setattr(runner, 'apply_mutation', mutation)
    store = InMemoryV2Store()
    session = store.create_session('user_1')
    branch = deepcopy(session.branches[0])
    prior = live_composition(branch, [])
    model = ScriptedTutorModel(outcomes=[
        {'message': 'Changed the music.', 'mutation': {'kind': 'noop'}, 'presentation': {'pattern': 'bad'}},
        {'message': 'Ignore this replacement message.', 'presentation': {'pattern': 'still-bad'}},
    ])
    client = _app(store, _scripted_factory(model))
    response = client.post('/api/v2/tutor/turns', json={'session_id': session.id, 'branch_id': branch.id, 'message': 'Change the music'})
    assert response.status_code == 200, response.text
    assert len(model.calls) == 2
    assert response.json()['presentation'] == prior.model_dump()
    assert not response.json()['presentation_applied']
    assert response.json()['message'] == 'Changed the music.'
    assert response.json()['branch']['harmony_exploration']['tonal_center']['root'] == 'D'
    turn_id = response.json()['branch']['live_presentation_turn_id']
    undo = client.post('/api/v2/tutor/restore', json={'session_id': session.id, 'branch_id': branch.id, 'turn_id': turn_id, 'undo': True})
    assert undo.status_code == 200
    assert undo.json()['branch']['harmony_exploration']['tonal_center'] is None


def test_sibling_tool_call_and_attention_not_persisted():
    from tests.v2.test_tutor_router import _app, _scripted_factory
    from tests.v2.tutor_fakes import ScriptedTutorModel
    store = InMemoryV2Store()
    session = store.create_session('user_1')
    branch = session.branches[0]
    model = ScriptedTutorModel(outcomes=[
        {'tool_calls': [{'name': 'read_harmony', 'args': {}, 'id': 'read1', 'type': 'tool_call'}]},
        {'message': 'The scratch is empty.', 'attention': {'role': 'active', 'notes': []}},
    ])
    client = _app(store, _scripted_factory(model))
    result = client.post('/api/v2/tutor/turns', json={'session_id': session.id, 'branch_id': branch.id, 'message': 'Read the Harmony context'})
    assert result.status_code == 200, result.text
    assert result.json()['tool_call_count'] == 1
    assert 'scratch' in str(model.calls[1])
    assert result.json()['attention']['role'] == 'active'
    assert all('attention' not in message.content for message in store.list_tutor_messages(branch.tutor_thread_id, 'user_1'))


def test_progression_sibling_read_is_on_demand_and_detached():
    from app.v2.models import ProgressionWorkspaceState
    from app.v2.tutor.workspace_tools import workspace_tools
    from app.v2.tutor.prompt import volatile_turn_message
    branch = InMemoryV2Store().create_session('owner').branches[0]
    branch.progression_workspace = ProgressionWorkspaceState(ideas=[{'id': 'idea', 'label': 'One', 'chords': [{'id': 'step', 'root': 'D', 'quality': 'minor'}]}], active_idea_id='idea')
    initial = str(volatile_turn_message(branch=branch, user_message='Compare').content)
    assert '"label": "One"' in initial and '"quality"' not in initial
    read = workspace_tools(branch)[1]
    value = read.invoke({'idea_id': 'idea'})
    assert value['chords'][0]['root'] == 'D'
    value['chords'][0]['root'] = 'E'
    assert branch.progression_workspace.ideas[0]['chords'][0]['root'] == 'D'
    assert 'error' in read.invoke({'idea_id': 'foreign'})
