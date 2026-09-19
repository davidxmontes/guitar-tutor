from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_optional_user
from app.routers import agent


@pytest.mark.parametrize(("path", "field"), [
    ("/chat", "message"), ("/resume", "response"),
    ("/chat/stream", "message"), ("/resume/stream", "response"),
])
def test_anonymous_requests_cannot_address_an_authenticated_checkpoint(monkeypatch, path, field):
    model = MagicMock()
    model.chat.return_value = model.resume_chat.return_value = {"answer": "Private conversation"}
    model.stream_chat.return_value = model.stream_resume.return_value = iter([])
    factory = MagicMock(return_value=model)
    monkeypatch.setattr(agent, "get_agent", factory)
    app = FastAPI()
    app.include_router(agent.router)
    app.dependency_overrides[get_optional_user] = lambda: None

    response = TestClient(app).post("/agent" + path, json={field: "Continue", "thread_id": "user_owner:private-thread"})

    assert response.status_code == 422
    factory.assert_not_called()
