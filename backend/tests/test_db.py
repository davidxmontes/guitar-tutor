def test_build_checkpointer_uses_memory_when_no_db_url(monkeypatch):
    """When SUPABASE_DB_URL is not set, falls back to MemorySaver."""
    from app.config import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("AGENT_CHECKPOINT_BACKEND", "postgres")
    monkeypatch.setenv("SUPABASE_DB_URL", "")

    import importlib
    from app.agent import agent as agent_mod
    importlib.reload(agent_mod)

    from langgraph.checkpoint.memory import MemorySaver
    from app.agent.agent import GuitarTutorAgent
    instance = object.__new__(GuitarTutorAgent)
    result = instance._build_checkpointer(backend="postgres", sqlite_path="")
    assert isinstance(result, MemorySaver)
    get_settings.cache_clear()


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
