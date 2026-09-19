"""Slow synchronous storage/model work must not stall the ASGI event loop."""

from concurrent.futures import ThreadPoolExecutor
import importlib
from threading import Event
from time import monotonic, sleep
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user, get_optional_user
from app.routers import agent, user
from app.v2.router import get_enrichment_model_factory
from app.v2.store import InMemoryV2Store
from tests.v2.test_song_studies_router import TAB_DATA, _create_raw_song_study, _revision
from tests.v2.test_tutor_router import _app, _open_session_and_branch, _scripted_factory
from tests.v2.tutor_fakes import ScriptedTutorModel

routes = importlib.import_module("app.v2.router")


@pytest.fixture
def client():
    store = InMemoryV2Store()
    model = ScriptedTutorModel(outcomes=[{"message": "Your answer is saved."}])
    with _app(store, _scripted_factory(model)) as client:
        @client.app.get("/health")
        async def health():
            return {"status": "healthy"}

        yield client, store


def _while_blocked(monkeypatch, client, target, method, request, *, call_number=1):
    """Hold real work until an unrelated request finishes on the same server."""
    entered, release = Event(), Event()
    original = getattr(target, method)
    calls = 0

    def delayed(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == call_number:
            entered.set()
            assert release.wait(5), "Timed out waiting for the health request"
        return original(*args, **kwargs)

    monkeypatch.setattr(target, method, delayed)
    with ThreadPoolExecutor(max_workers=2) as pool:
        pending = pool.submit(request)
        try:
            assert entered.wait(2), f"Request did not reach {method}"
            healthy = pool.submit(client.get, "/health")
            assert healthy.result(timeout=2).json() == {"status": "healthy"}
        finally:
            release.set()
        return pending.result(timeout=5)


def test_slow_library_storage_does_not_block_health(monkeypatch, client):
    client, store = client
    response = _while_blocked(monkeypatch, client, store, "list_artifacts",
                              lambda: client.get("/api/v2/library"))
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.parametrize("endpoint", ["turns", "jobs"])
@pytest.mark.parametrize("method", ["get_session", "commit_workspace_turn"])
def test_slow_tutor_storage_does_not_block_health(monkeypatch, client, endpoint, method):
    client, store = client
    session, branch = _open_session_and_branch(client)
    data = {"session_id": session, "branch_id": branch, "message": "Explain this"}
    response = _while_blocked(monkeypatch, client, store, method,
                              lambda: client.post(f"/api/v2/tutor/{endpoint}", json=data))
    if endpoint == "jobs":
        assert response.status_code == 202
        deadline = monotonic() + 5
        while monotonic() < deadline:
            response = client.get("/api/v2/tutor/jobs", params=data)
            if response.json()["status"] != "running":
                break
            sleep(.01)
        assert response.json()["status"] == "completed"
        assert response.json()["result"]["message"] == "Your answer is saved."
    else:
        assert response.status_code == 200
        assert response.json()["message"] == "Your answer is saved."
    thread = store.get_session(session, "user_1").branches[0].tutor_thread_id
    assert [message.role for message in store.list_tutor_messages(thread, "user_1")] == ["user", "assistant"]


def test_slow_job_poll_ownership_check_does_not_block_health(monkeypatch, client):
    client, store = client
    session, branch = _open_session_and_branch(client)
    response = _while_blocked(monkeypatch, client, store, "get_session",
                              lambda: client.get("/api/v2/tutor/jobs", params={"session_id": session, "branch_id": branch}))
    assert response.status_code == 200
    assert response.json() is None


@pytest.mark.parametrize("method", ["get_session", "create_artifact"])
def test_slow_song_load_storage_does_not_block_health(monkeypatch, client, method):
    client, store = client
    session, branch = _open_session_and_branch(client)
    monkeypatch.setattr(routes.songsterr, "get_song_revision", AsyncMock(return_value=_revision()))
    monkeypatch.setattr(routes.songsterr, "get_tab_data", AsyncMock(return_value=TAB_DATA))
    response = _while_blocked(monkeypatch, client, store, method,
                              lambda: client.post("/api/v2/song-studies", json={"session_id": session, "branch_id": branch, "song_id": 7}))
    assert response.status_code == 201
    assert response.json()["payload"]["tab_data"] == TAB_DATA


@pytest.mark.parametrize("method,call_number", [
    ("get_artifact", 1),
    ("update_artifact", 1),  # Preserve fetched ChordPro before model execution.
    ("update_artifact", 2),  # Persist the completed enrichment.
    ("run_song_enrichment", 1),
])
def test_slow_song_enrichment_does_not_block_health(monkeypatch, client, method, call_number):
    client, store = client
    raw = _create_raw_song_study(client, _open_session_and_branch(client))
    monkeypatch.setattr(routes.songsterr, "get_chordpro", AsyncMock(return_value="{section: Intro}\n[G]Today"))
    model = ScriptedTutorModel(outcomes=[{"ranges": []}])
    client.app.dependency_overrides[get_enrichment_model_factory] = lambda: _scripted_factory(model)
    target = routes if method == "run_song_enrichment" else store
    response = _while_blocked(monkeypatch, client, target, method,
                              lambda: client.post(f"/api/v2/song-studies/{raw['id']}/enrichment"),
                              call_number=call_number)
    assert response.status_code == 200
    assert response.json()["payload"]["enrichment"] is not None
    assert response.json()["payload"]["chordpro"] == "{section: Intro}\n[G]Today"


@pytest.fixture
def classic_client(monkeypatch):
    model = MagicMock(model_name="scripted")
    answer = {"answer": "A saved answer."}
    model.chat.return_value = model.resume_chat.return_value = answer
    model.stream_chat.return_value = iter([{"event": "answer", "data": dict(answer)}])
    model.stream_resume.return_value = iter([{"event": "answer", "data": dict(answer)}])
    monkeypatch.setattr(agent, "get_agent", MagicMock(return_value=model))
    monkeypatch.setattr(agent.user_service, "upsert_thread", MagicMock())
    app = FastAPI()
    app.include_router(agent.router)
    app.include_router(user.router)
    app.dependency_overrides[get_current_user] = lambda: "owner"
    app.dependency_overrides[get_optional_user] = lambda: "owner"

    @app.get("/health")
    async def health():
        return {"status": "healthy"}

    with TestClient(app) as client:
        yield client, model


def test_slow_profile_storage_does_not_block_health(monkeypatch, classic_client):
    client, _ = classic_client
    listing = MagicMock(return_value=[])
    monkeypatch.setattr(user.user_service, "list_threads", listing)
    response = _while_blocked(monkeypatch, client, user.user_service, "list_threads",
                              lambda: client.get("/user/threads"))
    assert response.status_code == 200
    assert response.json() == []
    listing.assert_called_once_with("owner")


@pytest.mark.parametrize("path,field,method", [
    ("chat", "message", "chat"),
    ("resume", "response", "resume_chat"),
    ("chat/stream", "message", "stream_chat"),
    ("resume/stream", "response", "stream_resume"),
])
@pytest.mark.parametrize("phase", ["agent", "metadata"])
def test_slow_classic_chat_does_not_block_health(monkeypatch, classic_client, path, field, method, phase):
    client, model = classic_client
    target, operation = (model, method) if phase == "agent" else (agent.user_service, "upsert_thread")
    execution = getattr(model, method)
    metadata = agent.user_service.upsert_thread
    response = _while_blocked(monkeypatch, client, target, operation,
                              lambda: client.post(f"/agent/{path}", json={field: "Explain this", "thread_id": "thread-1"}))
    assert response.status_code == 200
    if path.endswith("/stream"):
        assert '"answer": "A saved answer."' in response.text
        assert "event: done" in response.text
    else:
        assert response.json()["answer"] == "A saved answer."
    assert execution.call_args.kwargs["thread_id"] == "owner:thread-1"
    assert metadata.call_args.kwargs["thread_id"] == "thread-1"
    assert metadata.call_args.kwargs["user_id"] == "owner"


def test_slow_agent_initialization_does_not_block_health(monkeypatch, classic_client):
    client, _ = classic_client
    response = _while_blocked(monkeypatch, client, agent, "get_agent",
                              lambda: client.get("/agent/health"))
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "model": "scripted"}
