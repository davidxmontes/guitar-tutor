"""
Application configuration, CORS middleware, and logging setup.
"""

import logging
import os
import re
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    openai_api_key: Optional[str] = None
    model_name: str = "gpt-4o-mini"
    log_level: str = "INFO"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    model_config = {"env_file": ".env"}


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
