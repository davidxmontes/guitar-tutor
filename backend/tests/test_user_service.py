from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
import pytest


def _make_mock_client():
    """Build a mock Supabase client with chainable .table().select().eq().order().execute() etc."""
    client = MagicMock()
    table = MagicMock()
    client.table.return_value = table

    def make_chain(**response_data):
        chain = MagicMock()
        execute_result = MagicMock()
        execute_result.data = response_data.get("data", [])
        chain.execute.return_value = execute_result
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.order.return_value = chain
        chain.insert.return_value = chain
        chain.delete.return_value = chain
        chain.upsert.return_value = chain
        return chain

    return client, table, make_chain


@patch("app.services.user_service.get_supabase_client")
def test_list_progressions_returns_models(mock_get_client):
    from app.services.user_service import list_progressions

    client, table, make_chain = _make_mock_client()
    chain = make_chain(data=[{
        "id": "uuid-1",
        "clerk_user_id": "user_abc",
        "name": "Blues in A",
        "key_root": "A",
        "key_mode": "minor",
        "slots": [{"root": "A", "quality": "minor"}],
        "created_at": "2026-05-23T10:00:00Z",
    }])
    table.select.return_value = chain
    mock_get_client.return_value = client

    results = list_progressions("user_abc")
    assert len(results) == 1
    assert results[0].name == "Blues in A"


@patch("app.services.user_service.get_supabase_client")
def test_list_progressions_raises_503_when_no_client(mock_get_client):
    from app.services.user_service import list_progressions
    from fastapi import HTTPException
    mock_get_client.return_value = None
    with pytest.raises(HTTPException) as exc_info:
        list_progressions("user_abc")
    assert exc_info.value.status_code == 503


@patch("app.services.user_service.get_supabase_client")
def test_delete_progression_raises_404_when_not_owned(mock_get_client):
    from app.services.user_service import delete_progression
    from fastapi import HTTPException

    client, table, make_chain = _make_mock_client()
    chain = make_chain(data=[])  # no rows → not owned
    table.select.return_value = chain
    mock_get_client.return_value = client

    with pytest.raises(HTTPException) as exc_info:
        delete_progression("user_abc", "uuid-999")
    assert exc_info.value.status_code == 404


@patch("app.services.user_service.get_supabase_client")
def test_list_favorites_returns_models(mock_get_client):
    from app.services.user_service import list_favorites

    client, table, make_chain = _make_mock_client()
    chain = make_chain(data=[{
        "id": "fav-uuid-1",
        "clerk_user_id": "user_abc",
        "songsterr_song_id": 12345,
        "title": "Comfortably Numb",
        "artist": "Pink Floyd",
        "created_at": "2026-05-23T10:00:00Z",
    }])
    table.select.return_value = chain
    mock_get_client.return_value = client

    results = list_favorites("user_abc")
    assert len(results) == 1
    assert results[0].title == "Comfortably Numb"
