-- Run after v2-schema.sql on the hard-cutover store. Save one idea and its
-- artifact/revision atomically; a stale Branch or artifact changes neither.
CREATE OR REPLACE FUNCTION v2_save_progression_idea(
  p_branch_id uuid, p_user_id text, p_expected_updated_at timestamptz, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  b v2_branches;
  a v2_artifacts;
  idea jsonb;
  ideas jsonb;
  stamp timestamptz := clock_timestamp();
  revisions jsonb;
BEGIN
  SELECT branches.* INTO b FROM v2_branches branches
    JOIN v2_sessions sessions ON sessions.id = branches.session_id
    WHERE branches.id = p_branch_id AND sessions.clerk_user_id = p_user_id FOR UPDATE OF branches;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found' USING ERRCODE = 'P0002'; END IF;
  IF b.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'Workspace changed' USING ERRCODE = '40001'; END IF;
  SELECT value INTO idea FROM jsonb_array_elements(b.progression_workspace->'ideas')
    WHERE value->>'id' = b.progression_workspace->>'active_idea_id';
  IF idea IS NULL THEN RAISE EXCEPTION 'Choose an idea to save'; END IF;
  IF idea->>'artifact_id' IS NULL THEN
    INSERT INTO v2_artifacts(clerk_user_id,kind,title,payload,created_at,updated_at)
      VALUES (p_user_id,'progression',p_payload->>'title',p_payload || jsonb_build_object('_library',
        jsonb_build_object('saved_at',stamp,'revisions','[]'::jsonb)),stamp,stamp) RETURNING * INTO a;
  ELSE
    SELECT * INTO a FROM v2_artifacts WHERE id=(idea->>'artifact_id')::uuid AND clerk_user_id=p_user_id AND kind='progression' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Artifact not found' USING ERRCODE = 'P0002'; END IF;
    IF a.updated_at <> (idea->>'base_revision_id')::timestamptz THEN RAISE EXCEPTION 'Artifact changed' USING ERRCODE = '40001'; END IF;
    IF (a.payload - '_library') <> p_payload THEN
      revisions := COALESCE(a.payload->'_library'->'revisions','[]'::jsonb) || jsonb_build_array(jsonb_build_object('revision',a.updated_at,'payload',a.payload - '_library'));
      UPDATE v2_artifacts SET title=p_payload->>'title', updated_at=stamp,
        payload=p_payload || jsonb_build_object('_library',jsonb_build_object('saved_at',a.payload->'_library'->'saved_at','revisions',revisions))
        WHERE id=a.id RETURNING * INTO a;
    END IF;
  END IF;
  SELECT jsonb_agg(CASE WHEN value->>'id'=idea->>'id' THEN value || jsonb_build_object(
    'artifact_id',a.id::text,'base_revision_id',a.updated_at::text,'dirty',false) ELSE value END ORDER BY ordinal)
    INTO ideas FROM jsonb_array_elements(b.progression_workspace->'ideas') WITH ORDINALITY AS items(value,ordinal);
  UPDATE v2_branches SET progression_workspace=jsonb_set(b.progression_workspace,'{ideas}',ideas),updated_at=stamp
    WHERE id=b.id RETURNING * INTO b;
  RETURN jsonb_build_object('branch',to_jsonb(b),'artifact',to_jsonb(a));
END $$;
REVOKE ALL ON FUNCTION v2_save_progression_idea(uuid,text,timestamptz,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION v2_save_progression_idea(uuid,text,timestamptz,jsonb) TO service_role;
