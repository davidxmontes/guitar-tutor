"""Clerk JWT verification FastAPI dependencies."""

import logging
import time
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import get_settings

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)

DEV_BYPASS_USER_ID = "dev-user"

# JWKS cache: (keys_list, fetched_at_timestamp)
_jwks_cache: tuple[list, float] = ([], 0.0)
_JWKS_TTL = 3600  # 1 hour


def _fetch_jwks() -> list:
    """Fetch JWKS from Clerk and return the list of keys. Cached for 1 hour."""
    global _jwks_cache
    keys, fetched_at = _jwks_cache
    if keys and (time.time() - fetched_at) < _JWKS_TTL:
        return keys

    settings = get_settings()
    if not settings.clerk_issuer_url:
        logger.warning("CLERK_ISSUER_URL not configured — JWT verification disabled")
        return []

    jwks_url = f"{settings.clerk_issuer_url.rstrip('/')}/.well-known/jwks.json"
    try:
        response = httpx.get(jwks_url, timeout=10)
        response.raise_for_status()
        keys = response.json().get("keys", [])
        _jwks_cache = (keys, time.time())
        logger.debug("Fetched %d JWKS keys from Clerk", len(keys))
        return keys
    except Exception as exc:
        logger.error("Failed to fetch Clerk JWKS: %s", exc)
        return keys  # Return stale cache on failure


def _verify_token(token: str) -> str:
    """Verify a Clerk JWT and return the user_id (sub claim).

    Raises HTTPException 401 if the token is invalid or JWKS unavailable.
    """
    keys = _fetch_jwks()
    if not keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Auth not configured on this server",
        )

    settings = get_settings()
    for key in keys:
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                options={"verify_aud": False},
                issuer=settings.clerk_issuer_url,
            )
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim")
            return user_id
        except JWTError:
            continue

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> str:
    """FastAPI dependency: verify Bearer token, return user_id. Raises 401 if missing/invalid."""
    if get_settings().auth_dev_bypass:
        return DEV_BYPASS_USER_ID
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _verify_token(credentials.credentials)


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> Optional[str]:
    """FastAPI dependency: verify Bearer token if present, return user_id or None."""
    if get_settings().auth_dev_bypass:
        return DEV_BYPASS_USER_ID
    if credentials is None:
        return None
    try:
        return _verify_token(credentials.credentials)
    except HTTPException:
        return None
