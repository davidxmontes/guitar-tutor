def test_get_supabase_client_returns_none_when_not_configured(monkeypatch):
    """When SUPABASE_URL/KEY are not set, get_supabase_client returns None."""
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "")
    # Clear any cached settings
    from app.config import get_settings
    get_settings.cache_clear()

    from app import db
    # Force re-evaluation
    import importlib
    importlib.reload(db)

    assert db.get_supabase_client() is None
    get_settings.cache_clear()
