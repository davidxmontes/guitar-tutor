from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI, Depends


def _make_test_app(dependency):
    """Build a minimal FastAPI app that uses the dependency."""
    test_app = FastAPI()

    @test_app.get("/protected")
    async def protected(user_id: str = Depends(dependency)):
        return {"user_id": user_id}

    return test_app


def test_get_current_user_missing_header():
    """Missing Authorization header → 401."""
    from app.dependencies.auth import get_current_user
    app = _make_test_app(get_current_user)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/protected")
    assert response.status_code == 401


def test_get_current_user_malformed_token():
    """Malformed token (not Bearer format) → 401."""
    from app.dependencies.auth import get_current_user
    app = _make_test_app(get_current_user)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/protected", headers={"Authorization": "not-a-bearer-token"})
    assert response.status_code == 401


def test_get_optional_user_missing_header_returns_none():
    """Missing Authorization header with optional dependency → None (200)."""
    from app.dependencies.auth import get_optional_user
    test_app = FastAPI()

    @test_app.get("/optional")
    async def optional_route(user_id=Depends(get_optional_user)):
        return {"user_id": user_id}

    client = TestClient(test_app)
    response = client.get("/optional")
    assert response.status_code == 200
    assert response.json()["user_id"] is None


@pytest.mark.parametrize("dependency", ["get_current_user", "get_optional_user"])
def test_slow_key_fetch_does_not_block_other_requests(monkeypatch, dependency):
    from app.dependencies import auth
    entered, release = Event(), Event()

    def slow_fetch():
        entered.set()
        assert release.wait(5)
        return []

    monkeypatch.setattr(auth, "_fetch_jwks", slow_fetch)
    test_app = _make_test_app(getattr(auth, dependency))

    @test_app.get("/health")
    async def health():
        return {"status": "healthy"}

    with TestClient(test_app) as client, ThreadPoolExecutor(max_workers=2) as pool:
        pending = pool.submit(client.get, "/protected", headers={"Authorization": "Bearer test-token"})
        try:
            assert entered.wait(2)
            healthy = pool.submit(client.get, "/health")
            assert healthy.result(timeout=2).status_code == 200
        finally:
            release.set()
        assert pending.result().status_code == (401 if dependency == "get_current_user" else 200)
