from app.v2.store import InMemoryV2Store
from tests.v2.test_tutor_router import _app, _scripted_factory
from tests.v2.tutor_fakes import ScriptedTutorModel


def test_comparison_reads_only_referenced_branch_and_preserves_both_workspaces():
    store = InMemoryV2Store()
    session = store.create_session('user_1')
    current = session.branches[0]
    song = store.create_artifact('user_1', 'song_study', 'Little Wing', {'track': {'tuning': [64,59,55,50,45,38]}, 'tab_data': {'measures': [{'marker': f'raw-{i}'} for i in range(20)]}}, saved=False)
    source = store.create_branch(session.id, 'user_1', title='Little Wing section', current_artifact_kind='song_study', current_artifact_id=song.id, selection={'type': 'range', 'startMeasureIndex': 10, 'endMeasureIndex': 12})
    store.create_tutor_message(source.tutor_thread_id, 'user', {'text': 'Private source conversation'})
    model = ScriptedTutorModel(outcomes=[
        {'tool_calls': [{'name': 'read_branch', 'args': {'branch_id': source.id}, 'id': 'read-source'}]},
        {'message': 'The song uses a low D, while this shape adds a higher F.', 'focus': {'role': 'comparison', 'groups': [
            {'branch_id': source.id, 'label': 'Song bass', 'notes': [{'string': 6, 'fret': 0}], 'tuning': [64,59,55,50,45,38]},
            {'branch_id': current.id, 'label': 'Current shape', 'notes': [{'string': 1, 'fret': 1}], 'tuning': [64,59,55,50,45,40]},
        ]}},
    ])
    before = store.get_session(session.id, 'user_1').model_dump()
    client = _app(store, _scripted_factory(model))
    response = client.post('/api/v2/tutor/turns', json={'session_id': session.id, 'branch_id': current.id, 'message': 'How is this different from the Little Wing section?'})
    assert response.status_code == 200, response.text
    initial = str([m.content for m in model.calls[0]])
    assert 'Little Wing section' in initial and source.id in initial
    assert 'raw-10' not in initial and 'Private source conversation' not in initial
    after_read = str([m.content for m in model.calls[1]])
    assert 'raw-10' in after_read and 'raw-0' not in after_read
    assert 'Private source conversation' not in after_read
    assert response.json()['focus']['groups'][0]['tuning'][-1] == 38
    assert store.get_session(session.id, 'user_1').model_dump() == before
    assert len(store.list_tutor_messages(source.tutor_thread_id, 'user_1')) == 1
    assert store.list_tutor_messages(current.tutor_thread_id, 'user_1')[-1].content['focus']['groups']
    next_model = ScriptedTutorModel(outcomes=[{'message': 'Continue your song passage.'}])
    next_client = _app(store, _scripted_factory(next_model))
    assert next_client.post('/api/v2/tutor/turns', json={'session_id': session.id, 'branch_id': source.id, 'message': 'Continue here'}).status_code == 200
    assert 'Private source conversation' in str([m.content for m in next_model.calls[0]])
    assert 'higher F' not in str([m.content for m in next_model.calls[0]])


def test_branch_read_rejects_closed_foreign_and_other_session_branches():
    from app.v2.tutor.branch_comparison import branch_tools
    store = InMemoryV2Store()
    session = store.create_session('user_1')
    closed = store.create_branch(session.id, 'user_1', title='Closed work', closed=True)
    other_session = store.create_session('user_1')
    foreign = store.create_session('other')
    read = branch_tools(store, 'user_1', session.id)[0]
    for branch in (closed, other_session.branches[0], foreign.branches[0]):
        assert read.invoke({'branch_id': branch.id}) == {'error': 'Open workspace not found'}
    assert read.invoke({'branch_id': session.branches[0].id})['artifact'] is None


def test_comparison_groups_are_scoped_and_source_titles_are_application_owned():
    store = InMemoryV2Store()
    session = store.create_session('user_1')
    current = session.branches[0]
    foreign = store.create_session('other').branches[0]
    groups = [{'branch_id': branch.id, 'branch_title': 'Forged title', 'label': 'Shape', 'notes': [{'string': 1, 'fret': 0}], 'tuning': [64,59,55,50,45,40]} for branch in (current, foreign)]
    model = ScriptedTutorModel(outcomes=[{'message': 'Compare these.', 'focus': {'role': 'comparison', 'groups': groups}}])
    client = _app(store, _scripted_factory(model))
    response = client.post('/api/v2/tutor/turns', json={'session_id': session.id, 'branch_id': current.id, 'message': 'Compare'})
    assert response.status_code == 200
    returned = response.json()['focus']['groups']
    assert len(returned) == 1
    assert returned[0]['branch_title'] == current.title
