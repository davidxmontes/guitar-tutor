"""
Custom exceptions and global exception handlers.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AgentConfigError(Exception):
    """Raised when the agent is not properly configured (e.g., missing API key)."""
    pass


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AgentConfigError)
    async def agent_config_error_handler(request: Request, exc: AgentConfigError):
        logger.error(f"Agent configuration error: {exc}")
        return JSONResponse(
            status_code=500,
            content={"detail": "Agent not configured properly. Please check OPENAI_API_KEY."},
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        logger.warning(f"Bad request: {exc}")
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception):
        logger.exception(f"Unhandled error: {exc}")
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal error occurred."},
        )
