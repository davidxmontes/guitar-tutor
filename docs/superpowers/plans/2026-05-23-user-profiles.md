# User Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user profile persistence — saved chord progressions, favorite songs, and conversation thread history — backed by Supabase Postgres, gated behind Clerk JWT auth on the FastAPI backend, with OTEL/Langfuse observability.

**Architecture:** The FastAPI backend verifies Clerk JWTs via a `get_current_user` dependency and calls Supabase using the service-role key (backend enforces ownership, not RLS). The frontend continues using the same `/api/` endpoints with an `Authorization: Bearer` header added by the Clerk-aware API client. LangGraph conversation state migrates from in-memory to Postgres checkpointing.

**Tech Stack:** FastAPI, Supabase (Python client + Postgres), python-jose (JWT), langgraph-checkpoint-postgres, psycopg, OpenTelemetry SDK, Langfuse (OTLP target), React/TypeScript, @clerk/clerk-react

---

## Phase 1: Backend Foundation

### Task 1: Dependencies, env vars, and database migrations

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/config.py`
- Modify: `.env` (add commented-out example lines)

> No tests for this task — it is config only. Validate by running the app and checking settings load.

- [ ] **Step 1: Add new backend dependencies**

Open `backend/requirements.txt` and add these lines after the existing entries:

```
supabase>=2.0.0
python-jose[cryptography]>=3.3.0
langgraph-checkpoint-postgres
psycopg[binary]>=3.1.0
opentelemetry-sdk>=1.27.0
opentelemetry-exporter-otlp-proto-http>=1.27.0
opentelemetry-instrumentation-fastapi>=0.48b0
```

- [ ] **Step 2: Add new settings to `backend/app/config.py`**

Find the `Settings` class (around line 22) and add these new fields after `agent_checkpoint_sqlite_path`:

```python
# Supabase
supabase_url: Optional[str] = None
supabase_service_key: Optional[str] = None
supabase_db_url: Optional[str] = None  # postgres:// connection string for LangGraph checkpoint saver

# Clerk
clerk_issuer_url: Optional[str] = None  # e.g. https://your-app.clerk.accounts.dev

# OTEL / Langfuse
otel_exporter_otlp_endpoint: Optional[str] = None  # e.g. https://cloud.langfuse.com/api/public/otel/v1/traces
langfuse_public_key: Optional[str] = None
langfuse_secret_key: Optional[str] = None
```

- [ ] **Step 3: Add placeholder env vars to `.env`**

Append these commented lines to `.env` so every dev sees what's needed:

```
# Supabase
# SUPABASE_URL=https://<project>.supabase.co
# SUPABASE_SERVICE_KEY=<service-role key from Supabase dashboard>
# SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

# Clerk (backend JWT verification)
# CLERK_ISSUER_URL=https://<your-app>.clerk.accounts.dev

# OTEL / Langfuse
# OTEL_EXPORTER_OTLP_ENDPOINT=https://cloud.langfuse.com/api/public/otel/v1/traces
# LANGFUSE_PUBLIC_KEY=pk-lf-...
# LANGFUSE_SECRET_KEY=sk-lf-...
```

- [ ] **Step 4: Run database migrations in Supabase**

In the Supabase dashboard (SQL editor), run the following SQL to create the three tables. This is a one-time manual step — there is no migration tool yet.

```sql
-- Saved chord progressions
CREATE TABLE saved_progressions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  name          text NOT NULL,
  key_root      text,
  key_mode      text,
  slots         jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON saved_progressions (clerk_user_id, created_at DESC);

-- Favorite songs
CREATE TABLE favorite_songs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id     text NOT NULL,
  songsterr_song_id int  NOT NULL,
  title             text NOT NULL,
  artist            text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, songsterr_song_id)
);
CREATE INDEX ON favorite_songs (clerk_user_id, created_at DESC);

-- Conversation thread metadata (LangGraph stores actual state separately)
CREATE TABLE conversation_threads (
  id              uuid PRIMARY KEY,
  clerk_user_id   text NOT NULL,
  title           text NOT NULL,
  preview         text,
  last_message_at timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON conversation_threads (clerk_user_id, last_message_at DESC);
```

- [ ] **Step 5: Install new dependencies**

```bash
cd backend && pip install -r requirements.txt
```

Expected: all packages install without errors. The `psycopg[binary]` and `supabase` packages will pull the most dependencies.

- [ ] **Step 6: Verify settings load**

```bash
cd backend && python -c "from app.config import get_settings; s = get_settings(); print('supabase_url:', s.supabase_url); print('clerk_issuer_url:', s.clerk_issuer_url)"
```

Expected output (values are None until .env is filled):
```
supabase_url: None
clerk_issuer_url: None
```

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/app/config.py .env
git commit -m "feat(user-profiles): add deps, config, and Supabase schema"
```

---

### Task 2: Supabase client singleton

**Files:**
- Create: `backend/app/db.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_db.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_db.py -v
```

Expected: `ModuleNotFoundError` or `ImportError` — `db.py` doesn't exist yet.

- [ ] **Step 3: Create `backend/app/db.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_db.py -v
```

Expected: `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/db.py backend/tests/test_db.py
git commit -m "feat(user-profiles): add Supabase client singleton"
```

---

### Task 3: Clerk JWT auth dependency

**Files:**
- Create: `backend/app/dependencies/__init__.py`
- Create: `backend/app/dependencies/auth.py`
- Create: `backend/tests/test_auth_dependency.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_auth_dependency.py`:

```python
import time
import json
import base64
import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from fastapi.testclient import TestClient
from fastapi import FastAPI, Depends

# We'll test the dependency by importing it directly.
# The JWKS fetch is mocked in all tests.


def _make_test_app(dependency):
    """Build a minimal FastAPI app that uses the dependency."""
    test_app = FastAPI()

    @test_app.get("/protected")
    async def protected(user_id: str = Depends(dependency)):
        return {"user_id": user_id}

    return test_app


def test_get_current_user_missing_header():
    """Missing Authorization header → 401."""
    from app.dependencies.auth import get_current_user
    app = _make_test_app(get_current_user)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/protected")
    assert response.status_code == 401


def test_get_current_user_malformed_token():
    """Malformed token (not Bearer format) → 401."""
    from app.dependencies.auth import get_current_user
    app = _make_test_app(get_current_user)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/protected", headers={"Authorization": "not-a-bearer-token"})
    assert response.status_code == 401


def test_get_optional_user_missing_header_returns_none():
    """Missing Authorization header with optional dependency → None (200)."""
    from app.dependencies.auth import get_optional_user
    test_app = FastAPI()

    @test_app.get("/optional")
    async def optional_route(user_id=Depends(get_optional_user)):
        return {"user_id": user_id}

    client = TestClient(test_app)
    response = client.get("/optional")
    assert response.status_code == 200
    assert response.json()["user_id"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_auth_dependency.py -v
```

Expected: `ImportError` — module doesn't exist yet.

- [ ] **Step 3: Create the dependency module**

Create `backend/app/dependencies/__init__.py` (empty):
```python
```

Create `backend/app/dependencies/auth.py`:

```python
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
    if credentials is None:
        return None
    try:
        return _verify_token(credentials.credentials)
    except HTTPException:
        return None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_auth_dependency.py -v
```

Expected: all 3 tests `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/dependencies/ backend/tests/test_auth_dependency.py
git commit -m "feat(user-profiles): add Clerk JWT auth dependency"
```

---

### Task 4: User Pydantic models

**Files:**
- Create: `backend/app/models/user.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_user_models.py`:

```python
from app.models.user import (
    SavedProgression,
    SaveProgressionRequest,
    FavoriteSong,
    AddFavoriteRequest,
    ConversationThread,
)


def test_save_progression_request_validates_required_fields():
    req = SaveProgressionRequest(
        name="My blues",
        key_root="A",
        key_mode="minor",
        slots=[{"root": "A", "quality": "minor"}],
    )
    assert req.name == "My blues"
    assert len(req.slots) == 1


def test_save_progression_request_allows_null_key():
    req = SaveProgressionRequest(name="Unnamed", slots=[])
    assert req.key_root is None
    assert req.key_mode is None


def test_add_favorite_request_validates():
    req = AddFavoriteRequest(songsterr_song_id=12345, title="Wish You Were Here", artist="Pink Floyd")
    assert req.songsterr_song_id == 12345


def test_conversation_thread_model():
    thread = ConversationThread(
        id="abc-123",
        title="How do barre chords work?",
        preview="Barre chords involve pressing...",
        last_message_at="2026-05-23T12:00:00Z",
        created_at="2026-05-23T12:00:00Z",
    )
    assert thread.id == "abc-123"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_user_models.py -v
```

Expected: `ImportError`.

- [ ] **Step 3: Create `backend/app/models/user.py`**

```python
"""Pydantic schemas for user profile endpoints."""

from typing import Any, Optional
from pydantic import BaseModel


class SaveProgressionRequest(BaseModel):
    name: str
    key_root: Optional[str] = None
    key_mode: Optional[str] = None
    slots: list[dict[str, Any]]


class SavedProgression(BaseModel):
    id: str
    clerk_user_id: str
    name: str
    key_root: Optional[str]
    key_mode: Optional[str]
    slots: list[dict[str, Any]]
    created_at: str


class AddFavoriteRequest(BaseModel):
    songsterr_song_id: int
    title: str
    artist: str


class FavoriteSong(BaseModel):
    id: str
    clerk_user_id: str
    songsterr_song_id: int
    title: str
    artist: str
    created_at: str


class ConversationThread(BaseModel):
    id: str
    clerk_user_id: Optional[str] = None
    title: str
    preview: Optional[str]
    last_message_at: str
    created_at: str
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_user_models.py -v
```

Expected: all 4 tests `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/user.py backend/tests/test_user_models.py
git commit -m "feat(user-profiles): add user Pydantic models"
```

---

## Phase 2: Backend API

### Task 5: User service

**Files:**
- Create: `backend/app/services/user_service.py`
- Create: `backend/tests/test_user_service.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_user_service.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_user_service.py -v
```

Expected: `ImportError`.

- [ ] **Step 3: Create `backend/app/services/user_service.py`**

```python
"""User profile service — progressions, favorites, and conversation threads."""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status

from app.db import get_supabase_client
from app.models.user import (
    AddFavoriteRequest,
    ConversationThread,
    FavoriteSong,
    SavedProgression,
    SaveProgressionRequest,
)

logger = logging.getLogger(__name__)


def _require_client():
    client = get_supabase_client()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not configured",
        )
    return client


# --- Progressions ---

def list_progressions(user_id: str) -> list[SavedProgression]:
    client = _require_client()
    result = (
        client.table("saved_progressions")
        .select("*")
        .eq("clerk_user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [SavedProgression(**row) for row in result.data]


def save_progression(user_id: str, data: SaveProgressionRequest) -> SavedProgression:
    client = _require_client()
    payload = {
        "clerk_user_id": user_id,
        "name": data.name,
        "key_root": data.key_root,
        "key_mode": data.key_mode,
        "slots": data.slots,
    }
    result = client.table("saved_progressions").insert(payload).execute()
    return SavedProgression(**result.data[0])


def delete_progression(user_id: str, progression_id: str) -> None:
    client = _require_client()
    check = (
        client.table("saved_progressions")
        .select("id")
        .eq("id", progression_id)
        .eq("clerk_user_id", user_id)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progression not found")
    client.table("saved_progressions").delete().eq("id", progression_id).execute()


# --- Favorites ---

def list_favorites(user_id: str) -> list[FavoriteSong]:
    client = _require_client()
    result = (
        client.table("favorite_songs")
        .select("*")
        .eq("clerk_user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [FavoriteSong(**row) for row in result.data]


def add_favorite(user_id: str, data: AddFavoriteRequest) -> FavoriteSong:
    client = _require_client()
    payload = {
        "clerk_user_id": user_id,
        "songsterr_song_id": data.songsterr_song_id,
        "title": data.title,
        "artist": data.artist,
    }
    result = (
        client.table("favorite_songs")
        .upsert(payload, on_conflict="clerk_user_id,songsterr_song_id")
        .execute()
    )
    return FavoriteSong(**result.data[0])


def remove_favorite(user_id: str, songsterr_song_id: int) -> None:
    client = _require_client()
    check = (
        client.table("favorite_songs")
        .select("id")
        .eq("clerk_user_id", user_id)
        .eq("songsterr_song_id", songsterr_song_id)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Favorite not found")
    (
        client.table("favorite_songs")
        .delete()
        .eq("clerk_user_id", user_id)
        .eq("songsterr_song_id", songsterr_song_id)
        .execute()
    )


# --- Conversation threads ---

def list_threads(user_id: str) -> list[ConversationThread]:
    client = _require_client()
    result = (
        client.table("conversation_threads")
        .select("*")
        .eq("clerk_user_id", user_id)
        .order("last_message_at", desc=True)
        .execute()
    )
    return [ConversationThread(**row) for row in result.data]


def upsert_thread(
    user_id: str,
    thread_id: str,
    title: str,
    preview: Optional[str],
    last_message_at: datetime,
) -> None:
    client = _require_client()
    payload = {
        "id": thread_id,
        "clerk_user_id": user_id,
        "title": title[:80],
        "preview": preview[:120] if preview else None,
        "last_message_at": last_message_at.isoformat(),
    }
    client.table("conversation_threads").upsert(payload, on_conflict="id").execute()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_user_service.py -v
```

Expected: all 4 tests `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/user_service.py backend/tests/test_user_service.py
git commit -m "feat(user-profiles): add user service"
```

---

### Task 6: User router

**Files:**
- Create: `backend/app/routers/user.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_user_router.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_user_router.py`:

```python
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def test_get_progressions_requires_auth():
    response = client.get("/api/user/progressions")
    assert response.status_code == 401


def test_get_favorites_requires_auth():
    response = client.get("/api/user/favorites")
    assert response.status_code == 401


def test_get_threads_requires_auth():
    response = client.get("/api/user/threads")
    assert response.status_code == 401


@patch("app.routers.user.get_current_user", return_value="user_test_123")
@patch("app.routers.user.user_service.list_progressions", return_value=[])
def test_get_progressions_returns_list_when_authed(mock_list, mock_auth):
    response = client.get("/api/user/progressions", headers={"Authorization": "Bearer fake"})
    assert response.status_code == 200
    assert response.json() == []


@patch("app.routers.user.get_current_user", return_value="user_test_123")
@patch("app.routers.user.user_service.list_favorites", return_value=[])
def test_get_favorites_returns_list_when_authed(mock_list, mock_auth):
    response = client.get("/api/user/favorites", headers={"Authorization": "Bearer fake"})
    assert response.status_code == 200


@patch("app.routers.user.get_current_user", return_value="user_test_123")
@patch("app.routers.user.user_service.delete_progression")
def test_delete_progression_calls_service(mock_delete, mock_auth):
    response = client.delete(
        "/api/user/progressions/some-uuid",
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 204
    mock_delete.assert_called_once_with("user_test_123", "some-uuid")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_user_router.py -v
```

Expected: failures because the router doesn't exist yet (the auth tests will give 404, not 401).

- [ ] **Step 3: Create `backend/app/routers/user.py`**

```python
"""User profile routes — progressions, favorites, conversation threads."""

from fastapi import APIRouter, Depends, status

from app.dependencies.auth import get_current_user
from app.models.user import (
    AddFavoriteRequest,
    ConversationThread,
    FavoriteSong,
    SavedProgression,
    SaveProgressionRequest,
)
from app.services import user_service

router = APIRouter()


@router.get("/user/progressions", response_model=list[SavedProgression])
async def get_progressions(user_id: str = Depends(get_current_user)):
    return user_service.list_progressions(user_id)


@router.post("/user/progressions", response_model=SavedProgression, status_code=status.HTTP_201_CREATED)
async def post_progression(
    data: SaveProgressionRequest,
    user_id: str = Depends(get_current_user),
):
    return user_service.save_progression(user_id, data)


@router.delete("/user/progressions/{progression_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_progression(
    progression_id: str,
    user_id: str = Depends(get_current_user),
):
    user_service.delete_progression(user_id, progression_id)


@router.get("/user/favorites", response_model=list[FavoriteSong])
async def get_favorites(user_id: str = Depends(get_current_user)):
    return user_service.list_favorites(user_id)


@router.post("/user/favorites", response_model=FavoriteSong, status_code=status.HTTP_201_CREATED)
async def post_favorite(
    data: AddFavoriteRequest,
    user_id: str = Depends(get_current_user),
):
    return user_service.add_favorite(user_id, data)


@router.delete("/user/favorites/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_favorite(
    song_id: int,
    user_id: str = Depends(get_current_user),
):
    user_service.remove_favorite(user_id, song_id)


@router.get("/user/threads", response_model=list[ConversationThread])
async def get_threads(user_id: str = Depends(get_current_user)):
    return user_service.list_threads(user_id)
```

- [ ] **Step 4: Register the router in `backend/app/main.py`**

Add the user router import and `include_router` call. In `main.py`, add after line 6 (existing router imports):

```python
from app.routers import fretboard, tunings, scales, chords, agent, songs, user
```

And after the existing `app.include_router(songs.router, ...)` line:

```python
app.include_router(user.router, prefix="/api", tags=["user"])
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_user_router.py -v
```

Expected: all 6 tests `PASSED`.

- [ ] **Step 6: Run all backend tests to check for regressions**

```bash
cd backend && python -m pytest tests/ -v --ignore=tests/test_agent_song_tools.py
```

Expected: all tests pass. (The agent song tools test may require live LLM calls; skip it.)

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/user.py backend/app/main.py backend/tests/test_user_router.py
git commit -m "feat(user-profiles): add user router"
```

---

### Task 7: Agent router — thread scoping + thread upsert

**Files:**
- Modify: `backend/app/routers/agent.py`

The agent router gets two additions:
1. An optional `user_id` from `get_optional_user` on the chat/resume endpoints
2. After a successful chat response, call `upsert_thread` to persist thread metadata

For thread scoping: the backend prepends `{user_id}:` to the `thread_id` before passing it to LangGraph. The frontend thread ID is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_user_router.py` (append at the end of the file):

```python
from unittest.mock import patch, MagicMock


@patch("app.routers.agent.get_optional_user", return_value="user_123")
@patch("app.routers.agent.user_service.upsert_thread")
@patch("app.routers.agent.get_agent")
def test_authenticated_chat_scopes_thread_id(mock_get_agent, mock_upsert, mock_auth):
    """When user is authenticated, thread_id passed to agent is scoped."""
    mock_agent = MagicMock()
    mock_agent.stream_chat.return_value = iter([
        {"event": "answer", "data": {
            "answer": "C major has notes C, E, G",
            "scale": None,
            "chord_choices": [],
            "visualizations": False,
            "out_of_scope": False,
            "interrupted": False,
            "actions": [],
            "memory_status": "fresh",
            "intent": None,
        }}
    ])
    mock_get_agent.return_value = mock_agent

    # Can't easily test SSE streaming via TestClient, so test the sync endpoint
    mock_agent.chat.return_value = {
        "answer": "C major has notes C, E, G",
        "interrupted": False,
        "scale": None,
        "chord_choices": [],
        "visualizations": False,
        "out_of_scope": False,
        "actions": [],
        "memory_status": "fresh",
    }
    response = client.post(
        "/api/agent/chat",
        json={"message": "What notes are in C major?", "thread_id": "thread-abc"},
        headers={"Authorization": "Bearer fake"},
    )
    assert response.status_code == 200
    # Verify thread was scoped
    call_kwargs = mock_agent.chat.call_args.kwargs
    assert call_kwargs["thread_id"] == "user_123:thread-abc"
    # Verify upsert was called
    mock_upsert.assert_called_once()
    upsert_kwargs = mock_upsert.call_args.kwargs
    assert upsert_kwargs["user_id"] == "user_123"
    assert upsert_kwargs["thread_id"] == "thread-abc"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_user_router.py::test_authenticated_chat_scopes_thread_id -v
```

Expected: `FAILED` — the agent router doesn't scope threads yet.

- [ ] **Step 3: Modify `backend/app/routers/agent.py`**

Add these imports at the top of the file (after existing imports):

```python
from datetime import datetime, timezone
from typing import Optional

from app.dependencies.auth import get_optional_user
from app.services import user_service
```

Replace the `chat_with_agent` function:

```python
@router.post("/agent/chat", response_model=AgentResponse)
async def chat_with_agent(
    request: AgentRequest,
    user_id: Optional[str] = Depends(get_optional_user),
):
    """Chat with the Guitar Tutor agent."""
    scoped_thread_id = f"{user_id}:{request.thread_id}" if user_id else request.thread_id
    logger.info(f"Chat request: thread={scoped_thread_id}, message={request.message[:80]}")
    agent = get_agent()
    try:
        result = agent.chat(
            message=request.message,
            conversation_history=_history_to_dicts(request),
            bootstrap_history=_bootstrap_to_dicts(request),
            require_existing_thread=request.require_existing_thread,
            ui_context=_ui_context_dict(request.ui_context),
            thread_id=scoped_thread_id,
        )
    except ThreadNotFoundError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "THREAD_NOT_FOUND",
                "detail": str(exc),
                "thread_id": exc.thread_id,
            },
        )
    response = _build_agent_response(result)
    if user_id and not result.get("interrupted"):
        _try_upsert_thread(user_id, request.thread_id, request.message, response.answer)
    return response
```

Add the `resume_agent_chat` function similarly — replace it with:

```python
@router.post("/agent/resume", response_model=AgentResponse)
async def resume_agent_chat(
    request: ResumeRequest,
    user_id: Optional[str] = Depends(get_optional_user),
):
    """Resume agent chat after user answers a clarifying question."""
    scoped_thread_id = f"{user_id}:{request.thread_id}" if user_id else request.thread_id
    logger.info(f"Resume request: thread={scoped_thread_id}")
    agent = get_agent()
    try:
        result = agent.resume_chat(
            human_response=request.response,
            thread_id=scoped_thread_id,
            ui_context=_ui_context_dict(request.ui_context),
        )
    except ThreadNotFoundError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "THREAD_NOT_FOUND",
                "detail": str(exc),
                "thread_id": exc.thread_id,
            },
        )
    response = _build_agent_response(result)
    if user_id and not result.get("interrupted"):
        _try_upsert_thread(user_id, request.thread_id, None, response.answer)
    return response
```

Add the `stream_chat_with_agent` and `stream_resume_agent_chat` functions — add `user_id: Optional[str] = Depends(get_optional_user)` as a parameter to each and scope the thread_id the same way (`scoped_thread_id = f"{user_id}:{request.thread_id}" if user_id else request.thread_id`), then use `scoped_thread_id` in the `agent.stream_chat(...)` and `agent.stream_resume(...)` calls. After the `yield "event: done..."` line in the `event_generator`, add a call to `_try_upsert_thread` if `user_id` is set.

Add this helper function before the route handlers:

```python
def _try_upsert_thread(
    user_id: str,
    thread_id: str,
    user_message: Optional[str],
    ai_answer: str,
) -> None:
    """Upsert thread metadata. Swallows errors to avoid failing the chat response."""
    try:
        title = (user_message or ai_answer)[:80] if (user_message or ai_answer) else "Conversation"
        preview = ai_answer[:120] if ai_answer else None
        user_service.upsert_thread(
            user_id=user_id,
            thread_id=thread_id,
            title=title,
            preview=preview,
            last_message_at=datetime.now(timezone.utc),
        )
    except Exception as exc:
        logger.warning("Failed to upsert conversation thread: %s", exc)
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && python -m pytest tests/test_user_router.py::test_authenticated_chat_scopes_thread_id -v
```

Expected: `PASSED`.

- [ ] **Step 5: Run all backend tests**

```bash
cd backend && python -m pytest tests/ -v --ignore=tests/test_agent_song_tools.py
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/agent.py
git commit -m "feat(user-profiles): scope agent threads by user, upsert thread metadata"
```

---

### Task 8: LangGraph Postgres checkpoint saver

**Files:**
- Modify: `backend/app/agent/agent.py`
- Modify: `backend/app/config.py`

The `_build_checkpointer` method currently supports `memory` and `sqlite`. This task adds `postgres`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_db.py`:

```python
def test_build_checkpointer_uses_memory_when_no_db_url(monkeypatch):
    """When SUPABASE_DB_URL is not set, falls back to MemorySaver."""
    from app.config import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("AGENT_CHECKPOINT_BACKEND", "postgres")
    monkeypatch.setenv("SUPABASE_DB_URL", "")

    # Re-import to get fresh settings
    import importlib
    from app.agent import agent as agent_mod
    importlib.reload(agent_mod)

    from langgraph.checkpoint.memory import MemorySaver
    # Build without actually connecting (no DB URL) — expect memory fallback
    from app.agent.agent import GuitarTutorAgent
    # Can't fully instantiate without LLM key; test _build_checkpointer directly
    instance = object.__new__(GuitarTutorAgent)
    result = instance._build_checkpointer(backend="postgres", sqlite_path="")
    assert isinstance(result, MemorySaver)
    get_settings.cache_clear()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_db.py::test_build_checkpointer_uses_memory_when_no_db_url -v
```

Expected: `FAILED` — `_build_checkpointer` doesn't handle `"postgres"` yet.

- [ ] **Step 3: Modify `_build_checkpointer` in `backend/app/agent/agent.py`**

Find the `_build_checkpointer` method (around line 104) and replace the whole method:

```python
def _build_checkpointer(self, *, backend: str, sqlite_path: str):
    backend_normalized = (backend or "memory").strip().lower()

    if backend_normalized == "postgres":
        try:
            import psycopg
            from langgraph.checkpoint.postgres import PostgresSaver
            from app.config import get_settings

            db_url = get_settings().supabase_db_url
            if not db_url:
                logger.warning("SUPABASE_DB_URL not set — falling back to in-memory checkpoints")
                return MemorySaver()

            conn = psycopg.connect(db_url, autocommit=True)
            saver = PostgresSaver(conn)
            saver.setup()  # creates LangGraph checkpoint tables if they don't exist
            logger.info("Using Postgres checkpoint backend")
            return saver
        except Exception as exc:
            logger.warning("Falling back to in-memory checkpoints (Postgres unavailable): %s", exc)
            return MemorySaver()

    if backend_normalized == "sqlite":
        try:
            import sqlite3
            from pathlib import Path
            from langgraph.checkpoint.sqlite import SqliteSaver

            db_path = Path(sqlite_path).expanduser().resolve()
            db_path.parent.mkdir(parents=True, exist_ok=True)
            self._sqlite_conn = sqlite3.connect(str(db_path), check_same_thread=False)
            logger.info("Using SQLite checkpoint backend at %s", db_path)
            return SqliteSaver(self._sqlite_conn)
        except Exception as exc:
            logger.warning("Falling back to in-memory checkpoints (SQLite unavailable): %s", exc)
            return MemorySaver()

    return MemorySaver()
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && python -m pytest tests/test_db.py -v
```

Expected: all tests `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/agent/agent.py
git commit -m "feat(user-profiles): add Postgres LangGraph checkpoint saver"
```

---

## Phase 3: Observability

### Task 9: OTEL / Langfuse instrumentation

**Files:**
- Create: `backend/app/telemetry.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create `backend/app/telemetry.py`**

```python
"""OTEL setup — call setup_telemetry() once from main.py before the app starts."""

import base64
import logging

logger = logging.getLogger(__name__)


def setup_telemetry() -> None:
    """Configure OTEL TracerProvider and instrument FastAPI. No-ops if not configured."""
    from app.config import get_settings
    settings = get_settings()

    if not settings.otel_exporter_otlp_endpoint:
        logger.info("OTEL_EXPORTER_OTLP_ENDPOINT not set — telemetry disabled")
        return

    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        logger.info("Langfuse keys not set — telemetry disabled")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        auth = base64.b64encode(
            f"{settings.langfuse_public_key}:{settings.langfuse_secret_key}".encode()
        ).decode()

        exporter = OTLPSpanExporter(
            endpoint=settings.otel_exporter_otlp_endpoint,
            headers={"Authorization": f"Basic {auth}"},
        )
        provider = TracerProvider()
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        logger.info("OTEL TracerProvider configured → %s", settings.otel_exporter_otlp_endpoint)
    except Exception as exc:
        logger.warning("Failed to configure OTEL: %s", exc)
```

- [ ] **Step 2: Call `setup_telemetry()` from `backend/app/main.py` and instrument FastAPI**

In `main.py`, add after the existing imports and before `app = FastAPI(...)`:

```python
from app.telemetry import setup_telemetry
setup_telemetry()
```

After `app = FastAPI(...)`, add the FastAPI instrumentation:

```python
try:
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    FastAPIInstrumentor.instrument_app(app)
except ImportError:
    pass
```

- [ ] **Step 3: Verify the app still starts without OTEL env vars**

```bash
cd backend && python -c "from app.main import app; print('app loaded OK')"
```

Expected:
```
app loaded OK
```

No errors. The telemetry setup is no-op without env vars.

- [ ] **Step 4: Run all backend tests**

```bash
cd backend && python -m pytest tests/ -v --ignore=tests/test_agent_song_tools.py
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/telemetry.py backend/app/main.py
git commit -m "feat(user-profiles): add OTEL/Langfuse instrumentation"
```

---

## Phase 4: Frontend Foundation

### Task 10: Auth token in API client + user API methods

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/App.tsx`

The `ApiClient` singleton gets a `setTokenGetter` method. Before every request (including SSE), it calls the getter (which is Clerk's `getToken()`) to attach an `Authorization` header. Because Clerk's `getToken()` caches and auto-refreshes, this handles token expiry correctly.

- [ ] **Step 1: Add user API types to `frontend/src/types/index.ts`**

Find the end of the file (after `export * from './song';`) and append:

```typescript
// User profile types
export interface SavedProgression {
  id: string;
  name: string;
  key_root: string | null;
  key_mode: string | null;
  slots: ProgressionSlot[];
  created_at: string;
}

export interface SaveProgressionRequest {
  name: string;
  key_root: string | null;
  key_mode: string | null;
  slots: ProgressionSlot[];
}

export interface FavoriteSong {
  id: string;
  songsterr_song_id: number;
  title: string;
  artist: string;
  created_at: string;
}

export interface AddFavoriteRequest {
  songsterr_song_id: number;
  title: string;
  artist: string;
}

export interface ConversationThread {
  id: string;
  title: string;
  preview: string | null;
  last_message_at: string;
  created_at: string;
}
```

- [ ] **Step 2: Modify `frontend/src/api/client.ts` — add token getter support**

After the `const API_BASE_URL` line, find the `ApiClient` class. Add a `tokenGetter` private field and helper, then thread it through `fetch` and `_runStream`.

Replace the entire `ApiClient` class definition with the following (keep `nodeLabel` and `nodeDebugLabel` helpers unchanged above it):

```typescript
class ApiClient {
  private baseUrl: string;
  private tokenGetter: (() => Promise<string | null>) | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  setTokenGetter(getter: (() => Promise<string | null>) | null) {
    this.tokenGetter = getter;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.tokenGetter) return {};
    const token = await this.tokenGetter();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const authHeaders = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // ... keep _parseSseStream unchanged ...

  private async _runStream(
    endpoint: string,
    body: object,
    onStatus?: (node: string) => void,
    onToken?: (text: string) => void,
  ): Promise<AgentResponse> {
    const authHeaders = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
    });

    // ... keep the rest of _runStream unchanged (error handling and stream parsing) ...
  }
```

> **Important:** Only modify `fetch` (add `authHeaders`) and `_runStream` (add `authHeaders`). Do not change `_parseSseStream` or any of the existing API methods (`getFretboard`, `streamChat`, etc.).

- [ ] **Step 3: Add user API methods to `ApiClient`**

Before the closing `}` of the `ApiClient` class (after `getChordPro`), add:

```typescript
  // --- User profile endpoints ---

  async getProgressions(): Promise<SavedProgression[]> {
    return this.fetch<SavedProgression[]>('/user/progressions');
  }

  async saveProgression(data: SaveProgressionRequest): Promise<SavedProgression> {
    return this.fetch<SavedProgression>('/user/progressions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteProgression(id: string): Promise<void> {
    await this.fetch<void>(`/user/progressions/${id}`, { method: 'DELETE' });
  }

  async getFavorites(): Promise<FavoriteSong[]> {
    return this.fetch<FavoriteSong[]>('/user/favorites');
  }

  async addFavorite(data: AddFavoriteRequest): Promise<FavoriteSong> {
    return this.fetch<FavoriteSong>('/user/favorites', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeFavorite(songId: number): Promise<void> {
    await this.fetch<void>(`/user/favorites/${songId}`, { method: 'DELETE' });
  }

  async getThreads(): Promise<ConversationThread[]> {
    return this.fetch<ConversationThread[]>('/user/threads');
  }
```

Add the new types to the import at the top of `client.ts`:

```typescript
import type {
  // ... existing imports ...
  SavedProgression,
  SaveProgressionRequest,
  FavoriteSong,
  AddFavoriteRequest,
  ConversationThread,
} from '../types';
```

- [ ] **Step 4: Wire Clerk's `getToken` to the API client in `frontend/src/App.tsx`**

Find the `App` component function. Add a `useEffect` that sets the token getter when auth state changes. Add near the top of `App` (where other hooks are called):

```typescript
import { useAuth } from '@clerk/clerk-react';

// Inside App():
const { getToken, isSignedIn } = useAuth();

useEffect(() => {
  if (isSignedIn) {
    apiClient.setTokenGetter(() => getToken());
  } else {
    apiClient.setTokenGetter(null);
  }
}, [isSignedIn, getToken]);
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors. (Build may warn about other things but no type errors.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/types/index.ts frontend/src/App.tsx
git commit -m "feat(user-profiles): add auth token to API client and user API methods"
```

---

## Phase 5: Frontend Features

### Task 11: User store slice

**Files:**
- Modify: `frontend/src/stores/useAppStore.ts`
- Modify: `frontend/src/stores/index.ts`

The `UserSlice` manages local state for saved progressions, favorites, and thread history. It also tracks `favoriteIds` (a `Set<number>` of Songsterr IDs) for O(1) lookups in the UI.

- [ ] **Step 1: Add `UserSlice` interface to `useAppStore.ts`**

Find the line `type AppStore = ThemeSlice & UISlice & ...` and the interface section above it. Before that `type AppStore` line, add the interface and slice type:

```typescript
// ============================================================================
// User Slice
// ============================================================================
interface UserSlice {
  savedProgressions: SavedProgression[];
  favorites: FavoriteSong[];
  favoriteIds: Set<number>;
  threads: ConversationThread[];
  userDataLoading: boolean;

  fetchProgressions: () => Promise<void>;
  saveCurrentProgression: (name: string) => Promise<void>;
  deleteProgression: (id: string) => Promise<void>;

  fetchFavorites: () => Promise<void>;
  toggleFavorite: (song: { songsterr_song_id: number; title: string; artist: string }) => Promise<void>;

  fetchThreads: () => Promise<void>;
  loadThread: (threadId: string) => void;
}
```

- [ ] **Step 2: Add `UserSlice` to the `AppStore` type**

Find the `type AppStore = ...` line and append `& UserSlice`:

```typescript
type AppStore = ThemeSlice & UISlice & ScaleSlice & ChordSlice & ChatSlice & ChatPanelSlice & SongSlice & TuningSlice & AgentHighlightSlice & ProgressionSlice & UserSlice;
```

- [ ] **Step 3: Add user slice imports to `useAppStore.ts`**

Find the existing `import type { ... } from '../types';` block and add to it:

```typescript
  SavedProgression,
  FavoriteSong,
  ConversationThread,
```

- [ ] **Step 4: Implement the user slice in the `create()` call**

Find the large `create<AppStore>()(...)` call. Near the end of the object literal (after the progression slice implementation), add the user slice implementation:

```typescript
  // ============================================================================
  // User Slice
  // ============================================================================
  savedProgressions: [],
  favorites: [],
  favoriteIds: new Set<number>(),
  threads: [],
  userDataLoading: false,

  fetchProgressions: async () => {
    set({ userDataLoading: true });
    try {
      const progressions = await apiClient.getProgressions();
      set({ savedProgressions: progressions });
    } catch (err) {
      console.error('Failed to fetch progressions:', err);
    } finally {
      set({ userDataLoading: false });
    }
  },

  saveCurrentProgression: async (name: string) => {
    const state = get();
    const data = {
      name,
      key_root: state.progressionKeyRoot,
      key_mode: state.progressionKeyMode,
      slots: state.progressionSlots,
    };
    const saved = await apiClient.saveProgression(data);
    set((s) => ({ savedProgressions: [saved, ...s.savedProgressions] }));
  },

  deleteProgression: async (id: string) => {
    await apiClient.deleteProgression(id);
    set((s) => ({ savedProgressions: s.savedProgressions.filter((p) => p.id !== id) }));
  },

  fetchFavorites: async () => {
    try {
      const favorites = await apiClient.getFavorites();
      const ids = new Set(favorites.map((f) => f.songsterr_song_id));
      set({ favorites, favoriteIds: ids });
    } catch (err) {
      console.error('Failed to fetch favorites:', err);
    }
  },

  toggleFavorite: async (song) => {
    const { favoriteIds } = get();
    const isFav = favoriteIds.has(song.songsterr_song_id);
    // Optimistic update
    const newIds = new Set(favoriteIds);
    if (isFav) {
      newIds.delete(song.songsterr_song_id);
      set({ favoriteIds: newIds });
      try {
        await apiClient.removeFavorite(song.songsterr_song_id);
        set((s) => ({
          favorites: s.favorites.filter((f) => f.songsterr_song_id !== song.songsterr_song_id),
        }));
      } catch {
        // Revert on error
        const revertIds = new Set(get().favoriteIds);
        revertIds.add(song.songsterr_song_id);
        set({ favoriteIds: revertIds });
      }
    } else {
      newIds.add(song.songsterr_song_id);
      set({ favoriteIds: newIds });
      try {
        const fav = await apiClient.addFavorite(song);
        set((s) => ({ favorites: [fav, ...s.favorites] }));
      } catch {
        const revertIds = new Set(get().favoriteIds);
        revertIds.delete(song.songsterr_song_id);
        set({ favoriteIds: revertIds });
      }
    }
  },

  fetchThreads: async () => {
    try {
      const threads = await apiClient.getThreads();
      set({ threads });
    } catch (err) {
      console.error('Failed to fetch threads:', err);
    }
  },

  loadThread: (threadId: string) => {
    // Set the thread ID in localStorage so the next chat message uses it
    try {
      localStorage.setItem('guitar-tutor-thread-id', threadId);
      localStorage.removeItem('guitar-tutor-messages');
    } catch { /* ignore */ }
    // Reset local chat messages — the backend will restore the thread from checkpoints
    set({ messages: [], threadId });
  },
```

> **Note:** The store currently stores `threadId` in `localStorage` via `loadThreadId()`. Check whether a `threadId` field already exists in the `ChatSlice` or `AppStore`. If it does, use it; if not, add `threadId: string` to the store with initial value `loadThreadId()`.

- [ ] **Step 5: Export new selectors from `frontend/src/stores/index.ts`**

Add these exports (following the pattern of existing selectors):

```typescript
export const useSavedProgressions = () => useAppStore((s) => s.savedProgressions);
export const useFavoriteIds = () => useAppStore((s) => s.favoriteIds);
export const useThreads = () => useAppStore((s) => s.threads);
```

- [ ] **Step 6: Fetch user data on sign-in in `frontend/src/App.tsx`**

In the same `useEffect` that sets the token getter, also fetch user data when signed in:

```typescript
useEffect(() => {
  if (isSignedIn) {
    apiClient.setTokenGetter(() => getToken());
    fetchProgressions();
    fetchFavorites();
    fetchThreads();
  } else {
    apiClient.setTokenGetter(null);
  }
}, [isSignedIn, getToken]);
```

Add `fetchProgressions`, `fetchFavorites`, `fetchThreads` to the destructured values from `useAppStore`.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -30
```

Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/stores/useAppStore.ts frontend/src/stores/index.ts frontend/src/App.tsx
git commit -m "feat(user-profiles): add user store slice"
```

---

### Task 12: Save & load progression UI

**Files:**
- Modify: `frontend/src/components/ProgressionMode/ProgressionTimeline.tsx`
- Create: `frontend/src/components/ProgressionMode/SaveProgressionModal.tsx`
- Create: `frontend/src/components/ProgressionMode/SavedProgressionsList.tsx`

- [ ] **Step 1: Create `SaveProgressionModal.tsx`**

Create `frontend/src/components/ProgressionMode/SaveProgressionModal.tsx`:

```tsx
import { useState } from 'react';

interface SaveProgressionModalProps {
  defaultName: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function SaveProgressionModal({ defaultName, onSave, onCancel }: SaveProgressionModalProps) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim());
    } catch {
      setError('Failed to save. Try again.');
      setSaving(false);
    }
  };

  return (
    <div
      className="absolute top-full left-0 mt-2 z-50 rounded-xl border shadow-lg p-3 w-72"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Save progression
        </span>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border px-2 py-1.5 text-sm outline-none"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
          }}
          placeholder="Name this progression..."
          maxLength={60}
        />
        {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 rounded-lg text-xs"
            style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-600)', color: 'white' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `SavedProgressionsList.tsx`**

Create `frontend/src/components/ProgressionMode/SavedProgressionsList.tsx`:

```tsx
import { useState } from 'react';
import type { SavedProgression } from '../../types';

interface SavedProgressionsListProps {
  progressions: SavedProgression[];
  loading: boolean;
  onLoad: (progression: SavedProgression) => void;
  onDelete: (id: string) => Promise<void>;
}

export function SavedProgressionsList({ progressions, loading, onLoad, onDelete }: SavedProgressionsListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  if (progressions.length === 0) {
    return (
      <div className="py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        No saved progressions yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
      {progressions.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {p.name}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {p.key_root && p.key_mode ? `${p.key_root} ${p.key_mode} · ` : ''}
              {p.slots.length} chord{p.slots.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button
            onClick={() => onLoad(p)}
            className="text-[10px] px-2 py-0.5 rounded font-medium flex-shrink-0"
            style={{ backgroundColor: 'var(--accent-600)', color: 'white' }}
          >
            Load
          </button>
          <button
            onClick={() => handleDelete(p.id)}
            disabled={deletingId === p.id}
            className="text-[10px] px-2 py-0.5 rounded flex-shrink-0 disabled:opacity-50"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Modify `ProgressionTimeline.tsx` to add save and saved-list controls**

In `ProgressionTimeline.tsx`, add imports and new UI. Replace the entire file with:

```tsx
import { useState, useRef, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useAppStore } from '../../stores';
import { ProgressionSlotCard } from './ProgressionSlotCard';
import { SaveProgressionModal } from './SaveProgressionModal';
import { SavedProgressionsList } from './SavedProgressionsList';
import { playChord } from '../../utils/audio';
import type { SavedProgression } from '../../types';

export function ProgressionTimeline() {
  const {
    progressionSlots,
    activeSlotIndex,
    progressionKeyRoot,
    progressionKeyMode,
    setActiveSlot,
    removeSlot,
    addSlot,
    diatonicChords,
    autoPlay,
    savedProgressions,
    userDataLoading,
    saveCurrentProgression,
    deleteProgression,
    fetchProgressions,
    setProgressionFromAgent,
  } = useAppStore();
  const { isSignedIn } = useUser();

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedList, setShowSavedList] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveRef = useRef<HTMLDivElement>(null);

  // Close panels on outside click
  useEffect(() => {
    if (!showSaveModal && !showSavedList) return;
    function handle(e: MouseEvent) {
      if (saveRef.current && !saveRef.current.contains(e.target as Node)) {
        setShowSaveModal(false);
        setShowSavedList(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showSaveModal, showSavedList]);

  const handleSetActive = async (index: number) => {
    const slot = progressionSlots[index];
    await setActiveSlot(index);
    if (!autoPlay) return;
    if (slot.positions) {
      playChord(slot.positions.map(p => ({ string: p.string, fret: p.fret })));
    } else if (slot.selectedVoicing) {
      playChord(slot.selectedVoicing.positions.map(p => ({ string: p.string, fret: p.fret })));
    } else {
      const { progressionChordData } = useAppStore.getState();
      const voicings = progressionChordData?.voicings;
      if (voicings?.length) {
        playChord(voicings[0].positions.map(p => ({ string: p.string, fret: p.fret })));
      }
    }
  };

  const handlePrev = () => {
    if (progressionSlots.length === 0) return;
    handleSetActive((activeSlotIndex - 1 + progressionSlots.length) % progressionSlots.length);
  };

  const handleNext = () => {
    if (progressionSlots.length === 0) return;
    handleSetActive((activeSlotIndex + 1) % progressionSlots.length);
  };

  const handleAddDefault = () => {
    if (diatonicChords.length > 0) {
      const first = diatonicChords[0];
      addSlot({ root: first.root, quality: first.quality });
    } else {
      addSlot({ root: 'C', quality: 'major' });
    }
  };

  const defaultSaveName = [
    progressionKeyRoot,
    progressionKeyMode,
    progressionSlots.length > 0 ? `— ${progressionSlots.length} chord${progressionSlots.length !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' ') || 'My progression';

  const handleSave = async (name: string) => {
    await saveCurrentProgression(name);
    setShowSaveModal(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleLoad = async (p: SavedProgression) => {
    await setProgressionFromAgent(
      p.slots as any,
      p.key_root ?? undefined,
      p.key_mode ?? undefined,
    );
    setShowSavedList(false);
  };

  const handleOpenSavedList = () => {
    fetchProgressions();
    setShowSavedList(true);
    setShowSaveModal(false);
  };

  if (progressionSlots.length === 0) {
    return (
      <div
        className="py-4 text-sm text-center rounded-xl border"
        style={{
          color: 'var(--text-muted)',
          borderColor: 'var(--border-primary)',
          borderStyle: 'dashed',
        }}
      >
        Select a key and click chords above to build a progression
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Slot row */}
      <div className="flex items-center gap-2">
        <button
          onClick={handlePrev}
          disabled={progressionSlots.length <= 1}
          className="flex-shrink-0 p-1.5 rounded-lg border transition-colors disabled:opacity-30"
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          aria-label="Previous slot"
        >◀</button>

        <div className="flex gap-2 overflow-x-auto flex-1 py-1 min-w-0">
          {progressionSlots.map((slot, index) => (
            <ProgressionSlotCard
              key={index}
              slot={slot}
              index={index}
              isActive={index === activeSlotIndex}
              onSetActive={handleSetActive}
              onRemove={removeSlot}
            />
          ))}
          <button
            onClick={handleAddDefault}
            className="flex-shrink-0 rounded-xl border px-4 py-2 min-w-[60px] flex items-center justify-center transition-all hover:opacity-70"
            style={{ borderColor: 'var(--border-primary)', borderStyle: 'dashed', color: 'var(--text-muted)' }}
            aria-label="Add slot"
          >
            <span className="text-xl leading-none">+</span>
          </button>
        </div>

        <button
          onClick={handleNext}
          disabled={progressionSlots.length <= 1}
          className="flex-shrink-0 p-1.5 rounded-lg border transition-colors disabled:opacity-30"
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          aria-label="Next slot"
        >▶</button>

        <span className="flex-shrink-0 text-xs tabular-nums min-w-[36px] text-right" style={{ color: 'var(--text-muted)' }}>
          {activeSlotIndex + 1}/{progressionSlots.length}
        </span>
      </div>

      {/* Save / Saved controls (only when signed in) */}
      {isSignedIn && (
        <div ref={saveRef} className="relative flex gap-2 justify-end">
          {saveSuccess && (
            <span className="text-xs self-center" style={{ color: 'var(--accent-600)' }}>Saved!</span>
          )}
          <button
            onClick={() => { setShowSavedList(false); setShowSaveModal((v) => !v); }}
            className="text-xs px-2 py-1 rounded-lg border"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          >
            Save
          </button>
          <button
            onClick={handleOpenSavedList}
            className="text-xs px-2 py-1 rounded-lg border"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          >
            Saved ({savedProgressions.length})
          </button>

          {showSaveModal && (
            <SaveProgressionModal
              defaultName={defaultSaveName}
              onSave={handleSave}
              onCancel={() => setShowSaveModal(false)}
            />
          )}

          {showSavedList && (
            <div
              className="absolute top-full right-0 mt-2 z-50 rounded-xl border shadow-lg p-3 w-80"
              style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide block mb-2" style={{ color: 'var(--text-muted)' }}>
                Saved progressions
              </span>
              <SavedProgressionsList
                progressions={savedProgressions}
                loading={userDataLoading}
                onLoad={handleLoad}
                onDelete={deleteProgression}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -30
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ProgressionMode/
git commit -m "feat(user-profiles): add save/load progression UI"
```

---

### Task 13: Favorite songs UI

**Files:**
- Modify: `frontend/src/components/SongSearch/SongSearch.tsx`

Add a heart button on each search result row and a Favorites tab above the search results.

- [ ] **Step 1: Replace `SongSearch.tsx` with the updated version**

```tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useAppStore, useSongSearch } from '../../stores/useAppStore';
import type { SongSearchResult, FavoriteSong } from '../../types';
import { pickPrimaryTuning } from '../../utils/tuning';

export function SongSearch() {
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'favorites'>('search');
  const { results, loading, error } = useSongSearch();
  const searchSongs = useAppStore((s) => s.searchSongs);
  const selectSong = useAppStore((s) => s.selectSong);
  const favorites = useAppStore((s) => s.favorites);
  const favoriteIds = useAppStore((s) => s.favoriteIds);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const { isSignedIn } = useUser();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (query: string) => {
      setInputValue(query);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (query.trim().length < 2) return;
      debounceRef.current = setTimeout(() => searchSongs(query.trim()), 300);
    },
    [searchSongs],
  );

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim().length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchSongs(inputValue.trim());
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      {isSignedIn && (
        <div
          className="flex rounded-lg p-0.5 border"
          style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
        >
          {(['search', 'favorites'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1 rounded-md text-xs font-medium transition-all ${activeTab === tab ? 'shadow-sm border font-bold' : ''}`}
              style={{
                backgroundColor: activeTab === tab ? 'var(--card-bg)' : 'transparent',
                borderColor: activeTab === tab ? 'var(--border-primary)' : 'transparent',
                color: activeTab === tab ? 'var(--accent-600)' : 'var(--text-tertiary)',
              }}
            >
              {tab === 'search' ? 'Search' : `Favorites (${favorites.length})`}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'favorites' && isSignedIn ? (
        <FavoritesList
          favorites={favorites}
          onSelect={(fav) =>
            selectSong({
              song_id: fav.songsterr_song_id,
              title: fav.title,
              artist: fav.artist,
              tracks: [],
              has_chords: false,
            } as any)
          }
          onToggle={(fav) => toggleFavorite({
            songsterr_song_id: fav.songsterr_song_id,
            title: fav.title,
            artist: fav.artist,
          })}
          favoriteIds={favoriteIds}
        />
      ) : (
        <>
          {/* Search bar */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search for a song or artist..."
              className="flex-1 px-4 py-2.5 rounded-lg border text-sm outline-none transition-colors"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="submit"
              disabled={loading || inputValue.trim().length < 2}
              className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-500)', color: 'white' }}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {error && (
            <div className="px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              {error}
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-1">
              {results.map((song) => (
                <SongResultRow
                  key={song.song_id}
                  song={song}
                  onSelect={selectSong}
                  isFavorite={favoriteIds.has(song.song_id)}
                  onToggleFavorite={isSignedIn ? () => toggleFavorite({
                    songsterr_song_id: song.song_id,
                    title: song.title,
                    artist: song.artist,
                  }) : undefined}
                />
              ))}
            </div>
          )}

          {!loading && results.length === 0 && inputValue.trim().length >= 2 && (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
              No results found. Try a different search.
            </div>
          )}

          {results.length === 0 && inputValue.trim().length < 2 && (
            <div className="text-center py-16">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Search for a song to view its tab
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

function SongResultRow({
  song,
  onSelect,
  isFavorite,
  onToggleFavorite,
}: {
  song: SongSearchResult;
  onSelect: (song: SongSearchResult) => void;
  isFavorite: boolean;
  onToggleFavorite?: () => void;
}) {
  const instruments = song.tracks
    .map((t) => t.instrument)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 4);
  const tuningText = pickPrimaryTuning(song.tracks.map((t) => t.tuning));

  return (
    <div
      className="flex items-center gap-2 px-3 py-3 rounded-lg"
      style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-primary)' }}
    >
      <button
        onClick={() => onSelect(song)}
        className="flex-1 flex items-center gap-3 text-left min-w-0"
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {song.title}
          </div>
          <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
            {song.artist}
          </div>
          {tuningText && (
            <div className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Tuning: {tuningText}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {instruments.map((inst) => (
            <span key={inst} className="px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
              {inst}
            </span>
          ))}
          {song.has_chords && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: 'var(--accent-500)' }}>
              chords
            </span>
          )}
        </div>
      </button>
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className="flex-shrink-0 p-1 rounded transition-colors"
          style={{ color: isFavorite ? '#ef4444' : 'var(--text-muted)' }}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <HeartIcon filled={isFavorite} />
        </button>
      )}
    </div>
  );
}

function FavoritesList({
  favorites,
  onSelect,
  onToggle,
  favoriteIds,
}: {
  favorites: FavoriteSong[];
  onSelect: (fav: FavoriteSong) => void;
  onToggle: (fav: FavoriteSong) => void;
  favoriteIds: Set<number>;
}) {
  if (favorites.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No favorites yet. Heart a song from search results.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {favorites.map((fav) => (
        <div
          key={fav.id}
          className="flex items-center gap-2 px-3 py-3 rounded-lg"
          style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-primary)' }}
        >
          <button onClick={() => onSelect(fav)} className="flex-1 text-left min-w-0">
            <div className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{fav.title}</div>
            <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{fav.artist}</div>
          </button>
          <button
            onClick={() => onToggle(fav)}
            className="flex-shrink-0 p-1 rounded"
            style={{ color: '#ef4444' }}
            aria-label="Remove from favorites"
          >
            <HeartIcon filled />
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SongSearch/SongSearch.tsx
git commit -m "feat(user-profiles): add favorite songs UI"
```

---

### Task 14: Conversation thread history UI

**Files:**
- Create: `frontend/src/components/Chat/ThreadHistoryDropdown.tsx`
- Modify: `frontend/src/components/Chat/ChatPanel.tsx`

- [ ] **Step 1: Create `ThreadHistoryDropdown.tsx`**

Create `frontend/src/components/Chat/ThreadHistoryDropdown.tsx`:

```tsx
import type { ConversationThread } from '../../types';

interface ThreadHistoryDropdownProps {
  threads: ConversationThread[];
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ThreadHistoryDropdown({ threads, onSelectThread, onNewThread }: ThreadHistoryDropdownProps) {
  return (
    <div
      className="absolute right-0 top-full mt-2 z-50 rounded-xl border shadow-lg w-72"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
    >
      <div className="p-2 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        <button
          onClick={onNewThread}
          className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--accent-600)', color: 'white' }}
        >
          + New conversation
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto p-2 flex flex-col gap-1">
        {threads.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
            No previous conversations.
          </p>
        ) : (
          threads.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectThread(t.id)}
              className="w-full text-left px-3 py-2 rounded-lg transition-colors"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {t.title}
              </div>
              {t.preview && (
                <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {t.preview}
                </div>
              )}
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {formatRelativeTime(t.last_message_at)}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add history icon + dropdown to `ChatPanel.tsx`**

In `ChatPanel.tsx`, add to the imports:

```typescript
import { useState, useRef, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { ThreadHistoryDropdown } from './ThreadHistoryDropdown';
```

Add two new props to `ChatPanelProps`:

```typescript
  threads?: ConversationThread[];
  onSelectThread?: (threadId: string) => void;
  onNewThread?: () => void;
```

Add the import for `ConversationThread` to the import at the top:

```typescript
import type { ConversationThread } from '../../types';
```

Inside `ChatPanel`, add:

```typescript
const { isSignedIn } = useUser();
const [showHistory, setShowHistory] = useState(false);
const historyRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!showHistory) return;
  function handle(e: MouseEvent) {
    if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
      setShowHistory(false);
    }
  }
  document.addEventListener('mousedown', handle);
  return () => document.removeEventListener('mousedown', handle);
}, [showHistory]);
```

In the header section of `ChatPanel` (where the debug button and reset button are), add the history button before the debug button:

```tsx
{isSignedIn && onSelectThread && (
  <div ref={historyRef} className="relative">
    <button
      onClick={() => setShowHistory((v) => !v)}
      title="Conversation history"
      aria-label="Conversation history"
      className="p-1.5 rounded-md transition-colors"
      style={{
        color: showHistory ? 'var(--accent-600)' : 'var(--text-muted)',
        backgroundColor: showHistory ? 'var(--bg-hover)' : 'transparent',
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
      </svg>
    </button>
    {showHistory && (
      <ThreadHistoryDropdown
        threads={threads ?? []}
        onSelectThread={(id) => { onSelectThread(id); setShowHistory(false); }}
        onNewThread={() => { onNewThread?.(); setShowHistory(false); }}
      />
    )}
  </div>
)}
```

- [ ] **Step 3: Wire the new props in `App.tsx`**

Find where `ChatPanel` is rendered in `App.tsx` and add the three new props:

```tsx
threads={threads}
onSelectThread={(threadId) => { loadThread(threadId); }}
onNewThread={() => {
  // Generate a new thread ID and clear chat
  const newId = generateThreadId();
  loadThread(newId);
}}
```

Add `threads`, `loadThread` to the destructured values from `useAppStore`. `generateThreadId` is a module-private function in `useAppStore.ts` — inline the same logic directly in `App.tsx`:

```typescript
const newId = `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -30
```

Expected: no TypeScript errors.

- [ ] **Step 5: Run full frontend check**

```bash
cd frontend && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Chat/ThreadHistoryDropdown.tsx frontend/src/components/Chat/ChatPanel.tsx frontend/src/App.tsx
git commit -m "feat(user-profiles): add conversation thread history UI"
```

---

## Post-implementation checklist

- [ ] Set real env vars in your local `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_URL`, `CLERK_ISSUER_URL`) and verify the backend starts without errors: `cd backend && uvicorn app.main:app --reload`
- [ ] Set `VITE_CLERK_PUBLISHABLE_KEY` in `frontend/.env` and start the frontend: `cd frontend && npm run dev`
- [ ] Sign in with a Clerk account, build a progression, save it, reload the page, verify the saved progression appears
- [ ] Search for a song, heart it, switch to Favorites tab, verify it's there
- [ ] Send a chat message, note the thread, refresh, open thread history, load the thread, verify the conversation restores
- [ ] Set `AGENT_CHECKPOINT_BACKEND=postgres` in `.env` and restart backend — verify agent conversations persist across server restarts
- [ ] (Optional) Set Langfuse keys and verify traces appear in the Langfuse dashboard
