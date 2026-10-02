import asyncio
from threading import Event
from time import monotonic, sleep

import pytest
from fastapi import HTTPException

from app.dependencies.auth import get_current_user
from app.v2.store import InMemoryV2Store
from app.v2.tutor.contract import TutorResponse, TutorUsage
from app.v2.tutor.jobs import TutorJobs, TutorTurnRequest
from app.v2.tutor.providers import TutorConfigurationError
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


def _request(**fields):
    return TutorTurnRequest(**{'session_id': 'session', 'branch_id': 'branch', 'message': 'Explain this', **fields})


def _answer():
    return TutorResponse(message='An answer.', provider='test', model='scripted', latency_ms=0,
                         usage=TutorUsage(), tool_call_count=0)


async def _finished(*jobs):
    deadline = monotonic() + 5
    while any(job.status == 'running' for job in jobs):
        assert monotonic() < deadline, 'Tutor job did not finish'
        await asyncio.sleep(.001)


def test_job_registry_deduplicates_context_and_isolates_user_session_and_branch():
    async def check():
        registry = TutorJobs()
        request = _request(request_id='first')
        first = registry.start('owner', request, _answer)
        assert registry.start('owner', _request(request_id='another'), _answer) is first
        for changed in ({'message': 'Another question'}, {'web_search': True},
                        {'song_context': {'artifact_id': 'song', 'selection': {'type': 'beat', 'measureIndex': 0, 'beatIndex': 0}}}):
            with pytest.raises(HTTPException) as error:
                registry.start('owner', _request(**changed), _answer)
            assert (error.value.status_code, error.value.detail) == (409, 'A Tutor question is already in progress.')
        separate = [registry.start('other', request, _answer),
                    registry.start('owner', _request(session_id='other'), _answer),
                    registry.start('owner', _request(branch_id='other'), _answer)]
        assert all(job is not first for job in separate)
        assert registry.latest('owner', 'session', 'branch') is first
        assert registry.latest('absent', 'session', 'branch') is None
        await _finished(first, *separate)
        assert first.result == _answer()
        assert registry.start('owner', request, _answer) is first
        retry = registry.start('owner', _request(request_id='retry'), _answer)
        assert retry is not first
        await _finished(retry)

    asyncio.run(check())


def test_job_registry_capacity_expiry_and_running_job_retention(monkeypatch):
    import app.v2.tutor.jobs as jobs_module
    now = 0
    monkeypatch.setattr(jobs_module, 'monotonic', lambda: now)

    async def check():
        nonlocal now
        registry = TutorJobs()
        jobs = [registry.start('owner', _request(branch_id=str(index)), _answer) for index in range(1000)]
        with pytest.raises(HTTPException) as error:
            registry.start('owner', _request(branch_id='new'), _answer)
        assert (error.value.status_code, error.value.detail) == (429, 'The Tutor is busy. Please try again shortly.')
        await _finished(*jobs)
        now = 86400
        assert registry.latest('owner', 'session', '0') is jobs[0]
        replacement = registry.start('owner', _request(branch_id='0'), _answer)
        assert replacement is not jobs[0]  # Existing Branches can retry even at capacity.
        now = 172801
        assert registry.latest('owner', 'session', '0') is replacement
        assert registry.latest('owner', 'session', '1') is None
        await _finished(replacement)
        assert registry.latest('owner', 'session', '0') is None
        admitted = registry.start('owner', _request(branch_id='new'), _answer)
        await _finished(admitted)

    asyncio.run(check())


@pytest.mark.parametrize('failure,cause,message', [
    (HTTPException(422), TutorConfigurationError('missing key'),
     'Tutor is not configured on this server. Add an API key for the selected Tutor provider, then try again.'),
    (HTTPException(409), None, 'The music changed while the Tutor was working. Please ask again.'),
    (HTTPException(422), None, 'The Tutor returned a suggestion this view could not apply. Your question is kept; please try again.'),
    (RuntimeError('provider failed'), HTTPException(429),
     'The Tutor provider is busy. Your question is kept; please try again shortly.'),
    (ValueError('failed'), None, 'The Tutor could not finish this turn. Please try again.'),
])
def test_job_registry_failure_keeps_request_and_preserves_error_message(failure, cause, message):
    def fail():
        raise failure from cause

    async def check():
        registry = TutorJobs()
        request = _request(request_id='failed')
        job = registry.start('owner', request, fail)
        await _finished(job)
        assert (job.status, job.message, job.error, job.result) == ('failed', request.message, message, None)
        assert registry.start('owner', request, _answer) is job
        retry = registry.start('owner', _request(request_id='retry'), _answer)
        await _finished(retry)
        assert retry.status == 'completed'

    asyncio.run(check())
