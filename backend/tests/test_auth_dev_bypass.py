import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from app.config import get_settings


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _make_test_app(dependency):
    test_app = FastAPI()

    @test_app.get("/protected")
    async def protected(user_id: str = Depends(dependency)):
        return {"user_id": user_id}

    return test_app


def test_get_current_user_bypass_enabled_returns_dev_user_without_header(monkeypatch):
    """AUTH_DEV_BYPASS=true → get_current_user succeeds with no Authorization header."""
    monkeypatch.setenv("AUTH_DEV_BYPASS", "true")
    from app.dependencies.auth import get_current_user

    app = _make_test_app(get_current_user)
    client = TestClient(app)
    response = client.get("/protected")
    assert response.status_code == 200
    assert response.json()["user_id"] == "dev-user"


def test_get_optional_user_bypass_enabled_returns_dev_user(monkeypatch):
    monkeypatch.setenv("AUTH_DEV_BYPASS", "true")
    from app.dependencies.auth import get_optional_user

    app = _make_test_app(get_optional_user)
    client = TestClient(app)
    response = client.get("/protected")
    assert response.status_code == 200
    assert response.json()["user_id"] == "dev-user"


def test_get_current_user_bypass_disabled_still_requires_header(monkeypatch):
    """Default (bypass off) behavior is unchanged — still 401 with no header."""
    monkeypatch.setenv("AUTH_DEV_BYPASS", "false")
    from app.dependencies.auth import get_current_user

    app = _make_test_app(get_current_user)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/protected")
    assert response.status_code == 401
