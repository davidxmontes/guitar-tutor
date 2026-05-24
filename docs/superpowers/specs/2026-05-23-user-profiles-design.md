# User Profiles — Design Spec
**Date:** 2026-05-23
**Status:** Approved

## Overview

Add user profile persistence to the Guitar Tutor app. Clerk authentication is already integrated on the frontend. This spec covers wiring Clerk JWT verification into the FastAPI backend, adding a Supabase Postgres database, and building three persistence features: saved chord progressions, favorite songs, and conversation thread history (with OTEL observability as a companion concern).

## Scope

### In scope
- Backend Clerk JWT verification (FastAPI dependency)
- Supabase Postgres database connection (backend-owned, service-role key)
- Saved chord progressions: save, list, delete
- Favorite songs: add, list, remove
- Conversation thread history: persist LangGraph state to Postgres, list threads in UI
- OTEL instrumentation on the backend, exporting to Langfuse

### Out of scope
- Sharing progressions between users
- User-editable profile fields (display name, avatar)
- Progression versioning / edit history
- Collaborative features

---

## Architecture

**Pattern:** Backend owns all persistence. The FastAPI backend verifies Clerk JWTs and calls Supabase via the Python Supabase client with the service-role key. The frontend continues calling the same `/api/` endpoints — no new data client on the frontend.

**Security boundary:** The backend, not Supabase RLS. The backend filters all queries by the verified `clerk_user_id`.

---

## Database Schema (Supabase / Postgres)

### `saved_progressions`
```sql
CREATE TABLE saved_progressions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  name         text NOT NULL,
  key_root     text,
  key_mode     text,
  slots        jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON saved_progressions (clerk_user_id, created_at DESC);
```

`slots` is a JSON array of `ProgressionSlot` objects matching the frontend type:
```json
[{ "root": "A", "quality": "minor", "positions": [...], "selectedVoicing": {...} }]
```

### `favorite_songs`
```sql
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
```

### `conversation_threads`
```sql
CREATE TABLE conversation_threads (
  id              uuid PRIMARY KEY,  -- same as LangGraph thread_id
  clerk_user_id   text NOT NULL,
  title           text NOT NULL,     -- first user message, truncated to 80 chars
  preview         text,              -- last AI response snippet, truncated to 120 chars
  last_message_at timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON conversation_threads (clerk_user_id, last_message_at DESC);
```

### LangGraph Postgres checkpoint tables
`langgraph-checkpoint-postgres` manages its own schema (tables: `checkpoints`, `checkpoint_blobs`, `checkpoint_writes`). These are created automatically by the library on startup.

---

## Backend Changes

### New dependencies
- `supabase` — Python Supabase client
- `python-jose[cryptography]` — JWT verification
- `langgraph-checkpoint-postgres` — LangGraph Postgres checkpoint saver
- `opentelemetry-sdk`, `opentelemetry-exporter-otlp-proto-grpc` — OTEL
- `opentelemetry-instrumentation-fastapi` — auto-instrument FastAPI

### New environment variables
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<service-role key>
CLERK_ISSUER_URL=https://<your-app>.clerk.accounts.dev
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.eu.langfuse.com/api/public/otel
LANGFUSE_PUBLIC_KEY=<key>
LANGFUSE_SECRET_KEY=<key>
```

### Auth dependency (`backend/app/dependencies/auth.py`)

A single FastAPI dependency `get_current_user`:
1. Reads `Authorization: Bearer <token>` header. Returns `401` if missing.
2. Fetches Clerk's JWKS from `{CLERK_ISSUER_URL}/.well-known/jwks.json`. Cached in-process with a 1-hour TTL.
3. Verifies the JWT using `python-jose`. Returns `401` if invalid or expired.
4. Returns the `sub` claim as `user_id: str`.

Optional variant `get_optional_user` returns `None` if no token is present (for routes that work both signed-in and anonymous).

### New router: `backend/app/routers/user.py`

All routes inject `get_current_user` and call service functions in `backend/app/services/user_service.py`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/user/progressions` | List saved progressions, newest first |
| `POST` | `/api/user/progressions` | Save a progression |
| `DELETE` | `/api/user/progressions/{id}` | Delete a progression (must own it) |
| `GET` | `/api/user/favorites` | List favorite songs, newest first |
| `POST` | `/api/user/favorites` | Add a favorite song |
| `DELETE` | `/api/user/favorites/{song_id}` | Remove a favorite song by Songsterr ID |
| `GET` | `/api/user/threads` | List conversation threads, newest first |

### New service: `backend/app/services/user_service.py`

Plain functions that take `user_id: str` and interact with the Supabase client. No classes.

- `list_progressions(user_id) → list[SavedProgression]`
- `save_progression(user_id, data) → SavedProgression`
- `delete_progression(user_id, progression_id) → None` (raises `404` if not found or not owned by user)
- `list_favorites(user_id) → list[FavoriteSong]`
- `add_favorite(user_id, data) → FavoriteSong`
- `remove_favorite(user_id, songsterr_song_id) → None`
- `list_threads(user_id) → list[ConversationThread]`
- `upsert_thread(user_id, thread_id, title, preview, last_message_at) → None`

### New Pydantic models: `backend/app/models/user.py`

- `SavedProgression` — mirrors `saved_progressions` table
- `SaveProgressionRequest` — `name`, `key_root`, `key_mode`, `slots`
- `FavoriteSong` — mirrors `favorite_songs` table
- `AddFavoriteRequest` — `songsterr_song_id`, `title`, `artist`
- `ConversationThread` — mirrors `conversation_threads` table

### Agent router changes (`backend/app/routers/agent.py`)

- Accept an optional `Authorization` header via `get_optional_user`
- When a user is authenticated:
  - Scope the LangGraph `thread_id` to `{user_id}:{thread_id}` (prevents thread ID collisions across users)
  - After the agent run completes, call `upsert_thread(...)` with the first user message as title and last AI response as preview
- When anonymous: existing behavior unchanged (ephemeral thread)

### LangGraph checkpoint saver

In `backend/app/agent/agent.py`, replace the in-memory checkpointer with `AsyncPostgresSaver` from `langgraph-checkpoint-postgres`, connecting to the same `SUPABASE_URL` + service key (using Postgres connection string format).

The config setting `agent_checkpoint_backend` remains for switching between `memory` (local dev without Supabase) and `postgres` (staging/prod).

### OTEL setup (`backend/app/telemetry.py`)

Called once from `main.py`:
- Configures `TracerProvider` with OTLP gRPC exporter pointed at Langfuse
- Instruments FastAPI with `FastAPIInstrumentor`
- LangGraph emits OTEL spans natively when a tracer provider is configured

---

## Frontend Changes

### Progression Mode — Save & Load

**Save button** (`frontend/src/components/ProgressionMode/`)
- Appears in the progression timeline header when `isSignedIn && progressionSlots.length > 0`
- Click opens an inline input pre-filled with `"{keyRoot} {keyMode} — {slots.length} chords"` as the default name
- Submit calls `POST /api/user/progressions`
- Shows a brief success toast; errors shown inline

**Saved progressions panel**
- A "Saved" button/tab in the progression mode panel opens a list of saved progressions
- Each item shows: name, key, chord count, timestamp
- "Load" action: calls `GET /api/user/progressions` (on open), then calls `setProgressionFromAgent` with the loaded slots
- "Delete" action with confirmation

**Auth gate:** If not signed in, save button shows a `title="Sign in to save"` tooltip and is disabled.

### Song Mode — Favorites

**Heart icon button** in the song viewer header, next to the song title
- Filled when the song is in favorites, outlined when not
- Toggle calls `POST` or `DELETE /api/user/favorites/{song_id}`
- Optimistic update: state flips immediately, reverts on API error

**Favorites tab** in the song search panel
- A tab alongside search results showing the user's favorite songs
- Each item: title, artist, click to load the song tab

**Auth gate:** Heart button hidden entirely when not signed in (no tooltip needed — sign in is already in the header).

### Conversation History

**History icon** in the chat panel header
- Click opens a drawer or dropdown listing past threads
- Each item: title (truncated first message), timestamp
- Click a thread: sets `thread_id` in the agent state store, which the agent router uses to resume that thread via LangGraph's checkpoint

**New thread button** — starts a fresh thread (new UUID), adds it to the list on first message

**Auth gate:** History icon hidden when not signed in. Chat still works anonymously; threads just aren't persisted.

### Store changes (`frontend/src/stores/useAppStore.ts`)

- `threadId: string | null` — current LangGraph thread ID (sent with every agent request)
- `setThreadId(id: string | null) → void`
- Anonymous users get a new UUID per session (stored in sessionStorage, not persisted). On sign-in, the current session thread is abandoned — the user starts a new thread or loads one from history. Anonymous sessions are not migrated to the user's account.
- Authenticated users: thread ID set when loading a saved thread or starting a new one

---

## OTEL / Langfuse

OTEL instrumentation is added to the FastAPI backend only (this spec). Langfuse receives traces for:
- Every FastAPI request (via `FastAPIInstrumentor`)
- Every LangGraph node execution and LLM call (via LangGraph's native OTEL support)

This is a dev/ops concern — no user-facing UI for it. Traces are viewable in the Langfuse dashboard.

---

## Error Handling

- Missing or invalid JWT → `401 Unauthorized`
- Deleting a progression/favorite that doesn't exist or isn't owned by the user → `404 Not Found`
- Supabase connection failure → `503 Service Unavailable` (logged, not exposed to user)
- Frontend: API errors on save/favorite actions show a brief error message inline; they don't interrupt the main flow

---

## Migration / Rollout

1. Apply Supabase migrations (create the 3 tables)
2. Deploy backend with new env vars
3. Deploy frontend — new UI elements are auth-gated, so no impact on unauthenticated users
4. Switch `agent_checkpoint_backend` to `postgres` in production env

No data migration needed — the app has no existing persistent user data.
