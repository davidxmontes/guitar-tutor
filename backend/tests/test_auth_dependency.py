import time
import json
import base64
import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
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
