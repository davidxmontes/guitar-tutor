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

-- Branch = one conversational direction (Spec #100 §5.1): a shared Tutor
-- thread plus a Harmony Exploration and/or a Progression Workspace. Hard
-- cutover from the ConceptWorkspace era — the store is WIPED on deploy, so
-- this is a replacement, not a migration. The old columns
-- (current_artifact_kind/id, working_draft, saved_artifact_revision,
-- selection, focus, recent_ideas, fork_context) are gone with no converter.
CREATE TABLE v2_branches (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                uuid NOT NULL REFERENCES v2_sessions(id) ON DELETE CASCADE,
  tutor_thread_id           uuid NOT NULL,
  title                     text NOT NULL DEFAULT 'New workspace',
  harmony_exploration       jsonb,
  progression_workspace     jsonb,
  active_workspace          text NOT NULL DEFAULT 'harmony' CHECK (active_workspace IN ('harmony', 'progression')),
  live_presentation_turn_id text,
  closed                    boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  -- At least one workspace, and active_workspace names a present one.
  CONSTRAINT v2_branches_active_workspace_present CHECK (
    CASE active_workspace
      WHEN 'harmony' THEN harmony_exploration IS NOT NULL
      WHEN 'progression' THEN progression_workspace IS NOT NULL
    END
  )
);
CREATE INDEX ON v2_branches (session_id);

-- Artifact CRUD: common columns + a JSON payload, strictly typed by each
-- concrete artifact route at the application layer.
-- The store reserves payload._library for saved_at and linear prior snapshots.
-- It strips this metadata from musical payloads and tutor context on reads;
-- snapshots and current state update atomically using updated_at as a CAS token.
-- No DDL change is needed for this metadata. Legacy non-song artifacts already
-- came from explicit Save/Explore/Work on this promotions and remain in My Stuff;
-- raw SongStudy loads enter My Stuff only after an explicit Save.
-- History begins when this feature is deployed; old versions are not fabricated.
CREATE TABLE v2_artifacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('song_study', 'progression', 'exercise')),
  title        text NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON v2_artifacts (clerk_user_id, created_at DESC);

-- Tutor conversation messages (ticket #13): the application-owned message
-- log keyed by Branch.tutor_thread_id — the durable memory the
-- stateless-per-run V2 tutor reconstructs on every request. No provider
-- thread/response id, OpenAI previous_response_id, or LangGraph checkpoint
-- is ever canonical; this table is the whole of "conversation memory".
-- Ownership is derived via v2_branches.tutor_thread_id -> v2_sessions.clerk_user_id
-- (see V2Store.list_tutor_messages) rather than duplicating clerk_user_id here.
CREATE TABLE v2_tutor_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_thread_id  uuid NOT NULL,
  role             text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content          jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON v2_tutor_messages (tutor_thread_id, created_at);
