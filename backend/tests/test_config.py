from pathlib import Path
import runpy

import pytest
from pydantic import ValidationError


def test_misspelled_storage_backend_fails_instead_of_using_memory(monkeypatch):
    from app.config import Settings
    monkeypatch.setenv("V2_STORAGE_BACKEND", "supabse")
    with pytest.raises(ValidationError, match="v2_storage_backend"):
        Settings(_env_file=None)


def test_settings_load_backend_env_without_classic_imports(tmp_path, monkeypatch):
    monkeypatch.delenv("V2_TUTOR_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    backend = tmp_path / "backend"
    config = backend / "app" / "config.py"
    config.parent.mkdir(parents=True)
    config.write_text((Path(__file__).parents[1] / "app" / "config.py").read_text())
    (tmp_path / ".env").write_text("V2_TUTOR_MODEL=root-model\nOPENAI_API_KEY=root-placeholder\n")
    (backend / ".env").write_text("V2_TUTOR_MODEL=backend-model\nOPENAI_API_KEY=backend-placeholder\n")

    settings_type = runpy.run_path(str(config))["Settings"]
    settings = settings_type()
    assert settings.v2_tutor_model == "backend-model"
    assert settings.openai_api_key == "backend-placeholder"
    monkeypatch.setenv("V2_TUTOR_MODEL", "process-model")
    assert settings_type().v2_tutor_model == "process-model"

    (backend / ".env").unlink()
    assert settings_type().openai_api_key == "root-placeholder"


def test_classic_agent_uses_the_same_settings_key(monkeypatch):
    from app.agent import agent
    from app.config import Settings
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(agent, "get_settings", lambda: Settings(_env_file=None, openai_api_key="settings-placeholder"))
    monkeypatch.setattr(agent, "ChatOpenAI", lambda **kwargs: kwargs)
    monkeypatch.setattr(agent.GuitarTutorAgent, "_build_graph", lambda self: None)

    assert agent.GuitarTutorAgent().llm["api_key"] == "settings-placeholder"
