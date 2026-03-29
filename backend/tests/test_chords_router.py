from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_get_chord_success_returns_voicings() -> None:
    response = client.get("/api/chords/C/major")
    assert response.status_code == 200

    body = response.json()
    assert "voicings" in body
    assert "caged_shapes" not in body
    assert isinstance(body["voicings"], list)
    assert len(body["voicings"]) > 0


def test_get_chord_invalid_quality_returns_400() -> None:
    response = client.get("/api/chords/C/not_a_quality")
    assert response.status_code == 400


def test_get_chord_invalid_root_returns_400() -> None:
    response = client.get("/api/chords/H/major")
    assert response.status_code == 400


def test_get_chord_returns_404_when_voicing_not_available(monkeypatch) -> None:
    from app.routers import chords as chords_router

    monkeypatch.setattr(chords_router, "get_voicing_positions", lambda _r, _q: None)
    response = client.get("/api/chords/C/major")
    assert response.status_code == 404


def test_mode_query_param_is_ignored() -> None:
    response = client.get("/api/chords/C/major?mode=caged")
    assert response.status_code == 200
    assert "voicings" in response.json()
