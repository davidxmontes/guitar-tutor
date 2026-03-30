"""
Application configuration, CORS middleware, and logging setup.
"""

import logging
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Resolve .env from project root (two levels up from this file: app/ -> backend/ -> root/)
# Falls back to empty string if file doesn't exist (e.g., Docker where env vars come from compose)
_candidate = Path(__file__).resolve().parents[2] / ".env"
_ENV_FILE = str(_candidate) if _candidate.exists() else None


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    llm_provider: str = "openai"  # "openai" or "openrouter"
    openai_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    model_name: Optional[str] = None
    log_level: str = "INFO"
    agent_actions_enabled: bool = True
    agent_tool_calling_enabled: bool = True
    agent_summary_enabled: bool = True
    agent_summary_turn_interval: int = 6
    agent_summary_char_threshold: int = 7000
    agent_recent_turn_window: int = 10
    agent_checkpoint_backend: str = "memory"  # memory | sqlite
    agent_checkpoint_sqlite_path: str = ".agent_checkpoints.sqlite"

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

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    model_config = {"env_file": _ENV_FILE, "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


# --- CORS ---

# Regex patterns for dynamic origins (Vercel preview deployments)
ORIGIN_PATTERNS = [
    re.compile(r"^https://guitar-tutor-.*\.vercel\.app$"),
    re.compile(r"^https://.*-david-montes-de-ocas-projects\.vercel\.app$"),
]


def is_origin_allowed(origin: str) -> bool:
    """Check if origin is in the allowed list or matches a dynamic pattern."""
    if origin in get_settings().origins_list:
        return True
    return any(p.match(origin) for p in ORIGIN_PATTERNS)


class DynamicCORSMiddleware(BaseHTTPMiddleware):
    """CORS middleware that supports regex patterns for dynamic origins."""

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin")

        if request.method == "OPTIONS":
            response = await call_next(request)
            if origin and is_origin_allowed(origin):
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Access-Control-Allow-Methods"] = "*"
                response.headers["Access-Control-Allow-Headers"] = "*"
            return response

        response = await call_next(request)

        if origin and is_origin_allowed(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"

        return response


# --- Logging ---

def setup_logging() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
