-- V2 Session/Branch persistence (Supabase / Postgres).
-- Run manually on your Supabase project when V2_STORAGE_BACKEND=supabase.
-- Same pattern as the saved_progressions/favorite_songs/conversation_threads
-- tables (docs/superpowers/specs/2026-05-23-user-profiles-design.md) — no
-- automated migrations in this repo yet.

CREATE TABLE v2_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON v2_sessions (clerk_user_id, created_at DESC);

CREATE TABLE v2_branches (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id             uuid NOT NULL REFERENCES v2_sessions(id) ON DELETE CASCADE,
  tutor_thread_id        uuid NOT NULL,
  current_artifact_kind  text CHECK (current_artifact_kind IN ('song_study', 'progression', 'concept_study', 'exercise')),
  current_artifact_id    text,
  selection              jsonb,
  focus                  jsonb,
  recent_ideas           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON v2_branches (session_id);

-- Artifact CRUD (ticket #12): common columns + a JSON payload, strictly typed
-- per kind at the application layer (only song_study's SongStudyPayload
-- exists so far — see backend/app/v2/models.py).
CREATE TABLE v2_artifacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('song_study', 'progression', 'concept_study', 'exercise')),
  title        text NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON v2_artifacts (clerk_user_id, created_at DESC);
