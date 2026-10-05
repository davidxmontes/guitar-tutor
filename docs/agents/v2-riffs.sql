-- Additive Riff rollout for an existing store. Never run v2-schema.sql as an
-- upgrade: it is an installation document. This migration changes no rows,
-- ownership rules, indexes, RLS settings or RPCs.
-- Prerequisite: public.v2_artifacts has the kind CHECK named
-- v2_artifacts_kind_check (the name from the installation schema). If a deployed
-- constraint was renamed, identify it and adapt this migration before execution.
-- Rollout: apply this constraint migration, deploy the supporting backend, then
-- expose the frontend. Application deployment alone cannot enable hosted Saves.

BEGIN;

ALTER TABLE public.v2_artifacts
  DROP CONSTRAINT v2_artifacts_kind_check,
  ADD CONSTRAINT v2_artifacts_kind_check
    CHECK (kind IN ('song_study', 'progression', 'exercise', 'riff'));

COMMIT;
