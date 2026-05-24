"""Supabase client singleton."""

import logging
from typing import Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

_client = None


def get_supabase_client():
    """Return the Supabase client, or None if not configured."""
    global _client
    if _client is not None:
        return _client

    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_key:
        return None

    try:
        from supabase import create_client
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
        logger.info("Supabase client initialized")
        return _client
    except Exception as exc:
        logger.error("Failed to initialize Supabase client: %s", exc)
        return None
