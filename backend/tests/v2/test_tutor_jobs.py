from threading import Event
from time import monotonic, sleep

from app.dependencies.auth import get_current_user
from app.v2.store import InMemoryV2Store
from tests.v2.test_tutor_router import _app, _scripted_factory, _open_session_and_branch
from tests.v2.tutor_fakes import ScriptedTutorModel


def test_background_turn_reconnects_deduplicates_and_checks_ownership(monkeypatch):
    import importlib
    routes = importlib.import_module('app.v2.router')
    release = Event()
    original = routes.run_tutor_turn

    def delayed(**kwargs):
        assert release.wait(5)
        return original(**kwargs)

    monkeypatch.setattr(routes, 'run_tutor_turn', delayed)
    store = InMemoryV2Store()
    model = ScriptedTutorModel(outcomes=[{'message': 'Your answer is saved.'}])
    with _app(store, _scripted_factory(model)) as client:
        session, branch = _open_session_and_branch(client)
        data = {'session_id': session, 'branch_id': branch, 'message': 'Explain this', 'request_id': 'reconnect-test'}
        response = client.post('/api/v2/tutor/jobs', json=data)
        assert response.status_code == 202
        assert response.json()['status'] == 'running'
        job_id = response.json()['id']
        assert client.post('/api/v2/tutor/jobs', json=data).json()['id'] == job_id
        assert client.post('/api/v2/tutor/jobs', json={**data, 'message': 'Another question'}).status_code == 409
        client.app.dependency_overrides[get_current_user] = lambda: 'other'
        assert client.get('/api/v2/tutor/jobs', params=data).status_code == 404
        assert client.post('/api/v2/tutor/jobs', json=data).status_code == 404
        client.app.dependency_overrides[get_current_user] = lambda: 'user_1'
        release.set()  # The POST has ended; no browser request is holding the work open.
        deadline = monotonic() + 5
        while monotonic() < deadline:
            job = client.get('/api/v2/tutor/jobs', params=data).json()
            if job['status'] != 'running':
                break
            sleep(.02)
        assert job['status'] == 'completed', job
        assert job['result']['message'] == 'Your answer is saved.'
        assert client.post('/api/v2/tutor/jobs', json=data).json()['id'] == job_id
        thread = store.get_session(session, 'user_1').branches[0].tutor_thread_id
        assert len(store.list_tutor_messages(thread, 'user_1')) == 2


def test_background_failure_keeps_question_and_allows_retry():
    model = ScriptedTutorModel(unsupported_tools=True)
    with _app(InMemoryV2Store(), _scripted_factory(model)) as client:
        session, branch = _open_session_and_branch(client)
        data = {'session_id': session, 'branch_id': branch, 'message': 'Please explain'}
        first = client.post('/api/v2/tutor/jobs', json=data).json()
        deadline = monotonic() + 5
        while monotonic() < deadline:
            job = client.get('/api/v2/tutor/jobs', params=data).json()
            if job['status'] != 'running':
                break
            sleep(.02)
        assert job['status'] == 'failed'
        assert job['message'] == data['message']
        assert job['error']
        assert client.post('/api/v2/tutor/jobs', json=data).json()['id'] != first['id']
