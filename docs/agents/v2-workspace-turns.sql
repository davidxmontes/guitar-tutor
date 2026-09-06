-- Hard-cutover schema addition. Run after v2-schema.sql on the wiped store.
-- One assistant row owns the immutable pre-turn snapshot and Composition.
CREATE OR REPLACE FUNCTION v2_workspace_turn(
  p_branch_id uuid, p_user_id text, p_expected_updated_at timestamptz,
  p_action text, p_music jsonb DEFAULT NULL, p_question text DEFAULT NULL,
  p_content jsonb DEFAULT NULL, p_turn_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  b v2_branches;
  t v2_tutor_messages;
  turn_id uuid := gen_random_uuid();
  stamp timestamptz := clock_timestamp();
  snapshot jsonb;
BEGIN
  SELECT branches.* INTO b FROM v2_branches branches
    JOIN v2_sessions sessions ON sessions.id = branches.session_id
    WHERE branches.id = p_branch_id AND sessions.clerk_user_id = p_user_id
    FOR UPDATE OF branches;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found' USING ERRCODE = 'P0002'; END IF;
  IF b.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Workspace changed' USING ERRCODE = '40001';
  END IF;
  IF p_action = 'commit' THEN
    IF p_content->'presentation' IS NULL OR p_content->'presentation' = 'null'::jsonb THEN
      RAISE EXCEPTION 'Turn requires a Composition';
    END IF;
    snapshot := jsonb_build_object('harmony_exploration', b.harmony_exploration,
      'progression_workspace', b.progression_workspace, 'active_workspace', b.active_workspace);
    UPDATE v2_branches SET
      harmony_exploration = NULLIF(p_music->'harmony_exploration', 'null'::jsonb),
      progression_workspace = NULLIF(p_music->'progression_workspace', 'null'::jsonb),
      active_workspace = p_music->>'active_workspace',
      live_presentation_turn_id = turn_id::text, updated_at = stamp
      WHERE id = b.id;
    INSERT INTO v2_tutor_messages(tutor_thread_id, role, content, created_at)
      VALUES (b.tutor_thread_id, 'user', jsonb_build_object('text', p_question), stamp);
    INSERT INTO v2_tutor_messages(id, tutor_thread_id, role, content, created_at)
      VALUES (turn_id, b.tutor_thread_id, 'assistant',
        (p_content - 'attention') || jsonb_build_object('musical_snapshot', snapshot), stamp + interval '1 microsecond');
  ELSIF p_action IN ('undo', 'restore') THEN
    SELECT * INTO t FROM v2_tutor_messages WHERE id = p_turn_id
      AND tutor_thread_id = b.tutor_thread_id AND role = 'assistant' AND content ? 'presentation';
    IF NOT FOUND THEN RAISE EXCEPTION 'Turn not found' USING ERRCODE = 'P0002'; END IF;
    IF p_action = 'undo' THEN
      snapshot := t.content->'musical_snapshot';
      UPDATE v2_branches SET
        harmony_exploration = NULLIF(snapshot->'harmony_exploration', 'null'::jsonb),
        progression_workspace = NULLIF(snapshot->'progression_workspace', 'null'::jsonb),
        active_workspace = snapshot->>'active_workspace', updated_at = stamp WHERE id = b.id;
    ELSE
      UPDATE v2_branches SET live_presentation_turn_id = t.id::text,
        updated_at = stamp WHERE id = b.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown turn action';
  END IF;
  SELECT * INTO b FROM v2_branches WHERE id = b.id;
  RETURN to_jsonb(b);
END;
$$;
REVOKE ALL ON FUNCTION v2_workspace_turn(uuid, text, timestamptz, text, jsonb, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION v2_workspace_turn(uuid, text, timestamptz, text, jsonb, text, jsonb, uuid) TO service_role;
