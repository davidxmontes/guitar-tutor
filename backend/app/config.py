"""
Application configuration, CORS middleware, and logging setup.
"""

import logging
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic_settings import BaseSettings

# Keep the existing root fallback; the documented backend/.env takes precedence.
# Settings ignores missing files and gives process environment variables priority.
_ENV_FILES = tuple(Path(__file__).resolve().parents[level] / ".env" for level in (2, 1))


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    llm_provider: str = "openai"  # "openai" or "openrouter"
    openai_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    model_name: Optional[str] = None
    llm_timeout_seconds: Optional[float] = 300.0
    log_level: str = "INFO"
    agent_actions_enabled: bool = True
    agent_tool_calling_enabled: bool = True
    agent_summary_enabled: bool = True
    agent_summary_turn_interval: int = 6
    agent_summary_char_threshold: int = 7000
    agent_recent_turn_window: int = 10
    agent_checkpoint_backend: str = "memory"  # memory | sqlite | postgres
    agent_checkpoint_sqlite_path: str = ".agent_checkpoints.sqlite"

    # Supabase
    supabase_url: Optional[str] = None
    supabase_service_key: Optional[str] = None
    supabase_db_url: Optional[str] = None  # postgres:// connection string for LangGraph checkpoint saver

    # V2 (Session/Branch/Artifact) persistence
    v2_storage_backend: Literal["memory", "supabase"] = "memory"

    # V2 tutor (ticket #13) — owns its own provider/model selection,
    # deliberately separate from V1's llm_provider/model_name above (no
    # mixed V1/V2 architecture, per the V2 spec). anthropic_api_key is new
    # here — V1 never used Anthropic despite langchain-anthropic already
    # being a dependency.
    v2_tutor_provider: str = "openai"  # openai | anthropic | openrouter
    v2_tutor_model: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    tavily_api_key: Optional[str] = None

    # Clerk
    clerk_issuer_url: Optional[str] = None  # e.g. https://your-app.clerk.accounts.dev
    auth_dev_bypass: bool = False  # local/test only — skips Clerk verification, returns a fixed dev user

    # OTEL / Langfuse
    otel_exporter_otlp_endpoint: Optional[str] = None  # e.g. https://cloud.langfuse.com/api/public/otel/v1/traces
    langfuse_public_key: Optional[str] = None
    langfuse_secret_key: Optional[str] = None

    _PROVIDER_DEFAULTS: dict = {
        "openai": {"base_url": None, "default_model": "gpt-4o-mini"},
        "openrouter": {"base_url": "https://openrouter.ai/api/v1", "default_model": "minimax/minimax-m2.5"},
    }

    @property
    def llm_api_key(self) -> str | None:
        if self.llm_provider == "openrouter":
            return self.openrouter_api_key
        return self.openai_api_key

    @property
    def llm_base_url(self) -> str | None:
        return self._PROVIDER_DEFAULTS.get(self.llm_provider, {}).get("base_url")

    @property
    def llm_model_name(self) -> str:
        if self.model_name:
            return self.model_name
        return self._PROVIDER_DEFAULTS.get(self.llm_provider, {}).get("default_model", "gpt-4o-mini")

    _V2_TUTOR_MODEL_DEFAULTS: dict = {
        "openai": "gpt-4o-mini",
        "anthropic": "claude-3-5-haiku-20241022",
        "openrouter": "minimax/minimax-m2.5",
    }

    @property
    def v2_tutor_model_name(self) -> str:
        if self.v2_tutor_model:
            return self.v2_tutor_model
        return self._V2_TUTOR_MODEL_DEFAULTS.get(self.v2_tutor_provider, "gpt-4o-mini")

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    model_config = {"env_file": _ENV_FILES, "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


# --- CORS ---

# Vercel preview deployments, handled by the same middleware as fixed origins.
PREVIEW_ORIGIN_REGEX = r"https://(?:guitar-tutor-.*|.*-david-montes-de-ocas-projects)\.vercel\.app"


# --- Logging ---

def setup_logging() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
