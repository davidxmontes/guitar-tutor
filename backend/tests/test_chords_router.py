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
    from app.music import chords_db

    monkeypatch.delitem(chords_db._CHORD_INDEX, ("C", "major"))
    response = client.get("/api/chords/C/major")
    assert response.status_code == 404
    assert response.json()["detail"] == "Chord C major not available in voicings database"


def test_mode_query_param_is_ignored() -> None:
    response = client.get("/api/chords/C/major?mode=caged")
    assert response.status_code == 200
    assert "voicings" in response.json()
