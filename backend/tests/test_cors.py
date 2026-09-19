import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.mark.parametrize("origin", [
    "http://localhost:5173",
    "https://guitar-tutor-preview.vercel.app",
    "https://preview-david-montes-de-ocas-projects.vercel.app",
])
def test_allowed_origins_support_authenticated_preflight_and_response(origin):
    client = TestClient(app)
    preflight = client.options("/api/v2/sessions", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert preflight.status_code == 200
    assert preflight.headers["Access-Control-Allow-Origin"] == origin
    assert preflight.headers["Access-Control-Allow-Credentials"] == "true"
    assert "authorization" in preflight.headers["Access-Control-Allow-Headers"].lower()

    response = client.get("/health", headers={"Origin": origin})
    assert response.headers["Access-Control-Allow-Origin"] == origin
    assert "origin" in response.headers["Vary"].lower()


@pytest.mark.parametrize("origin", [
    "https://unrelated.vercel.app",
    "https://guitar-tutor-preview.vercel.app.example.com",
])
def test_unapproved_origins_are_rejected(origin):
    client = TestClient(app)
    preflight = client.options("/api/v2/sessions", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
    })
    assert preflight.status_code == 400
    assert "Access-Control-Allow-Origin" not in preflight.headers
    assert "Access-Control-Allow-Origin" not in client.get("/health", headers={"Origin": origin}).headers
