from app.v2.models import ProgressionWorkspaceState
from app.v2.store import InMemoryV2Store
from tests.v2.test_tutor_router import _app, _scripted_factory
from tests.v2.tutor_fakes import ScriptedTutorModel


def test_comparison_reads_only_referenced_branch_and_preserves_both_workspaces():
    store = InMemoryV2Store()
    session = store.create_session('user_1')
    current = session.branches[0]
    source = store.create_branch(
        session.id, 'user_1', title='Progression fork',
        progression_workspace=ProgressionWorkspaceState(ideas=[{'id': 'i1', 'label': 'Idea A'}], active_idea_id='i1'),
        active_workspace='progression',
    )
    store.create_tutor_message(source.tutor_thread_id, 'user', {'text': 'Private source conversation'})
    model = ScriptedTutorModel(outcomes=[
        {'tool_calls': [{'name': 'read_branch', 'args': {'branch_id': source.id}, 'id': 'read-source'}]},
        {'message': 'One branch explores harmony, the other develops a progression.', 'comparison_groups': [
            {'branch_id': source.id, 'label': 'Idea A shape', 'notes': [{'string': 6, 'fret': 0}], 'tuning': [64, 59, 55, 50, 45, 38]},
            {'branch_id': current.id, 'label': 'Current shape', 'notes': [{'string': 1, 'fret': 1}], 'tuning': [64, 59, 55, 50, 45, 40]},
        ]},
    ])
    before = store.get_session(session.id, 'user_1').model_dump()
    client = _app(store, _scripted_factory(model))
    response = client.post('/api/v2/tutor/turns', json={'session_id': session.id, 'branch_id': current.id,
                                                        'message': 'How is this different from the progression fork?'})
    assert response.status_code == 200, response.text
    initial = str([m.content for m in model.calls[0]])
    assert 'Progression fork' in initial and source.id in initial
    assert 'Idea A' not in initial and 'Private source conversation' not in initial
    after_read = str([m.content for m in model.calls[1]])
    assert 'Idea A' in after_read
    assert 'Private source conversation' not in after_read
    assert response.json()['comparison_groups'][0]['tuning'][-1] == 38
    after = store.get_session(session.id, 'user_1').model_dump()
    # A Tutor turn now advances presentation metadata, never the read music.
    assert after['branches'][0]['live_presentation_turn_id']
    for key in ('updated_at', 'live_presentation_turn_id'):
        after['branches'][0][key] = before['branches'][0][key]
    assert after == before
    assert len(store.list_tutor_messages(source.tutor_thread_id, 'user_1')) == 1
    assert store.list_tutor_messages(current.tutor_thread_id, 'user_1')[-1].content['comparison_groups']


def test_branch_read_rejects_closed_foreign_and_other_session_branches():
    from app.v2.tutor.branch_comparison import branch_tools
    store = InMemoryV2Store()
    session = store.create_session('user_1')
    closed = store.create_branch(session.id, 'user_1', title='Closed work')
    store.update_branch(session.id, closed.id, 'user_1', closed=True)
    other_session = store.create_session('user_1')
    foreign = store.create_session('other')
    read = branch_tools(store, 'user_1', session.id)[0]
    for branch in (closed, other_session.branches[0], foreign.branches[0]):
        assert read.invoke({'branch_id': branch.id}) == {'error': 'Open workspace not found'}
    ok = read.invoke({'branch_id': session.branches[0].id})
    assert ok['active_workspace'] == 'harmony'
    assert ok['harmony_exploration'] is not None
    assert ok['progression_workspace'] is None


def test_comparison_groups_are_scoped_and_source_titles_are_application_owned():
    store = InMemoryV2Store()
    session = store.create_session('user_1')
    current = session.branches[0]
    foreign = store.create_session('other').branches[0]
    groups = [{'branch_id': branch.id, 'branch_title': 'Forged title', 'label': 'Shape', 'notes': [{'string': 1, 'fret': 0}], 'tuning': [64, 59, 55, 50, 45, 40]} for branch in (current, foreign)]
    model = ScriptedTutorModel(outcomes=[{'message': 'Compare these.', 'comparison_groups': groups}])
    client = _app(store, _scripted_factory(model))
    response = client.post('/api/v2/tutor/turns', json={'session_id': session.id, 'branch_id': current.id, 'message': 'Compare'})
    assert response.status_code == 200
    returned = response.json()['comparison_groups']
    assert len(returned) == 1
    assert returned[0]['branch_title'] == current.title
