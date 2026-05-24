from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.dependencies.auth import get_current_user

client = TestClient(app, raise_server_exceptions=False)


def test_get_progressions_requires_auth():
    response = client.get("/api/user/progressions")
    assert response.status_code == 401


def test_get_favorites_requires_auth():
    response = client.get("/api/user/favorites")
    assert response.status_code == 401


def test_get_threads_requires_auth():
    response = client.get("/api/user/threads")
    assert response.status_code == 401


@patch("app.routers.user.user_service.list_progressions", return_value=[])
def test_get_progressions_returns_list_when_authed(mock_list):
    app.dependency_overrides[get_current_user] = lambda: "user_test_123"
    try:
        response = client.get("/api/user/progressions", headers={"Authorization": "Bearer fake"})
        assert response.status_code == 200
        assert response.json() == []
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@patch("app.routers.user.user_service.list_favorites", return_value=[])
def test_get_favorites_returns_list_when_authed(mock_list):
    app.dependency_overrides[get_current_user] = lambda: "user_test_123"
    try:
        response = client.get("/api/user/favorites", headers={"Authorization": "Bearer fake"})
        assert response.status_code == 200
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@patch("app.routers.user.user_service.delete_progression")
def test_delete_progression_calls_service(mock_delete):
    app.dependency_overrides[get_current_user] = lambda: "user_test_123"
    try:
        response = client.delete(
            "/api/user/progressions/some-uuid",
            headers={"Authorization": "Bearer fake"},
        )
        assert response.status_code == 204
        mock_delete.assert_called_once_with("user_test_123", "some-uuid")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
