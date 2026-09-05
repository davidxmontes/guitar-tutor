-- Apply after v2-schema.sql, before deploying ConceptWorkspace Save/reopen.
ALTER TABLE v2_branches ADD COLUMN IF NOT EXISTS saved_artifact_revision timestamptz;

-- Link the branch and intentional Artifact snapshot together. Concurrent saves
-- lock the branch first, then the artifact; stale branches never overwrite it.
CREATE OR REPLACE FUNCTION public.v2_save_workspace_study(
  p_session_id uuid, p_branch_id uuid, p_user_id text,
  p_expected_version integer, p_title text, p_as_new boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  b v2_branches%ROWTYPE;
  a v2_artifacts%ROWTYPE;
  draft jsonb;
  metadata jsonb;
  stamp timestamptz := clock_timestamp();
BEGIN
  SELECT branch.* INTO b FROM v2_branches branch
    JOIN v2_sessions session ON session.id = branch.session_id
    WHERE branch.id = p_branch_id AND branch.session_id = p_session_id
      AND session.clerk_user_id = p_user_id FOR UPDATE OF branch;
  IF NOT FOUND OR b.working_draft IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF (b.working_draft->>'version')::integer <> p_expected_version THEN
    RETURN jsonb_build_object('error', 'conflict');
  END IF;
  IF length(btrim(p_title)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Give the study a name between 1 and 120 characters';
  END IF;
  draft := jsonb_set(b.working_draft, '{title}', to_jsonb(btrim(p_title)));
  IF draft->>'title' IS DISTINCT FROM b.working_draft->>'title' THEN
    draft := jsonb_set(draft, '{version}', to_jsonb(p_expected_version + 1));
  END IF;
  IF b.current_artifact_id IS NOT NULL AND NOT p_as_new THEN
    SELECT * INTO a FROM v2_artifacts WHERE id::text = b.current_artifact_id
      AND clerk_user_id = p_user_id AND kind = 'concept_study' FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
    IF b.saved_artifact_revision IS DISTINCT FROM a.updated_at THEN
      RETURN jsonb_build_object('error', 'conflict');
    END IF;
    IF draft IS DISTINCT FROM (a.payload - '_library') THEN
      metadata := a.payload->'_library';
      metadata := metadata || jsonb_build_object('revisions', COALESCE(metadata->'revisions', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('revision', a.updated_at, 'payload', a.payload - '_library')));
      UPDATE v2_artifacts SET title = btrim(p_title), payload = draft || jsonb_build_object('_library', metadata),
        updated_at = stamp WHERE id = a.id RETURNING * INTO a;
    END IF;
  ELSE
    INSERT INTO v2_artifacts(clerk_user_id, kind, title, payload, created_at, updated_at)
      VALUES(p_user_id, 'concept_study', btrim(p_title), draft || jsonb_build_object('_library',
        jsonb_build_object('saved_at', stamp, 'revisions', '[]'::jsonb)), stamp, stamp) RETURNING * INTO a;
  END IF;
  UPDATE v2_branches SET working_draft = draft, title = btrim(p_title), current_artifact_kind = 'concept_study',
    current_artifact_id = a.id::text, saved_artifact_revision = a.updated_at, updated_at = stamp
    WHERE id = b.id RETURNING * INTO b;
  RETURN jsonb_build_object('branch', to_jsonb(b));
END;
$$;
REVOKE ALL ON FUNCTION public.v2_save_workspace_study(uuid,uuid,text,integer,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v2_save_workspace_study(uuid,uuid,text,integer,text,boolean) TO service_role;
