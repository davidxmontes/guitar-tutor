-- Apply after v2-schema.sql, before deploying ConceptWorkspace Tutor changes.
-- A single transaction owns CAS, exact snapshots, conversation, and undo.
CREATE OR REPLACE FUNCTION public.v2_commit_workspace_turn(
  p_session_id uuid, p_branch_id uuid, p_user_id text,
  p_expected_version integer, p_workspace jsonb, p_user_text text,
  p_assistant jsonb, p_undo_message_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  b v2_branches%ROWTYPE;
  m v2_tutor_messages%ROWTYPE;
  latest v2_tutor_messages%ROWTYPE;
  before_draft jsonb;
  next_draft jsonb := p_workspace;
  content jsonb := p_assistant;
  change jsonb := COALESCE(p_assistant->'workspace_change', '{"status":"unchanged","reason":null}'::jsonb);
BEGIN
  SELECT branch.* INTO b FROM v2_branches branch
    JOIN v2_sessions session ON session.id = branch.session_id
    WHERE branch.id = p_branch_id AND branch.session_id = p_session_id
      AND session.clerk_user_id = p_user_id
    FOR UPDATE OF branch;
  IF NOT FOUND OR b.working_draft IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  before_draft := b.working_draft;
  IF p_undo_message_id IS NOT NULL THEN
    SELECT history.* INTO latest FROM v2_tutor_messages history
      WHERE history.tutor_thread_id = b.tutor_thread_id
        AND history.content->'workspace_change'->>'status' IN ('applied', 'undone')
      ORDER BY history.created_at DESC, history.id DESC LIMIT 1;
    IF latest.id IS DISTINCT FROM p_undo_message_id
      OR latest.content->'workspace_change'->>'status' IS DISTINCT FROM 'applied'
      OR latest.content->'workspace_before' IS NULL
      OR latest.content->'workspace_before' = 'null'::jsonb
      OR (before_draft->>'version')::integer <> p_expected_version THEN
      RETURN jsonb_build_object('error', 'conflict');
    END IF;
    next_draft := latest.content->'workspace_before';
    change := change || jsonb_build_object('status', 'undone', 'undo_of', p_undo_message_id::text);
  ELSIF next_draft IS NOT NULL AND (before_draft->>'version')::integer <> p_expected_version THEN
    next_draft := NULL;
    change := jsonb_build_object('status', 'rejected', 'reason',
      'The draft changed while the Tutor was responding. No change was applied; ask again.');
  END IF;
  content := content || jsonb_build_object('workspace_before', NULL);
  IF next_draft IS NOT NULL THEN
    next_draft := jsonb_set(next_draft, '{version}', to_jsonb((before_draft->>'version')::integer + 1));
    UPDATE v2_branches SET working_draft = next_draft, updated_at = clock_timestamp()
      WHERE id = b.id RETURNING * INTO b;
    content := content || jsonb_build_object('workspace_before', before_draft);
  END IF;
  content := content || jsonb_build_object('workspace_after', b.working_draft, 'workspace_change', change);
  IF p_user_text IS NOT NULL THEN
    INSERT INTO v2_tutor_messages (tutor_thread_id, role, content, created_at)
      VALUES (b.tutor_thread_id, 'user', jsonb_build_object('text', p_user_text), clock_timestamp());
  END IF;
  INSERT INTO v2_tutor_messages (tutor_thread_id, role, content, created_at)
    VALUES (b.tutor_thread_id, 'assistant', content, clock_timestamp()) RETURNING * INTO m;
  RETURN jsonb_build_object('branch', to_jsonb(b), 'message', to_jsonb(m));
END;
$$;

-- Only the existing backend service may call the transaction. Caller-supplied
-- owner IDs are never accepted from anonymous/browser PostgREST clients.
REVOKE ALL ON FUNCTION public.v2_commit_workspace_turn(uuid,uuid,text,integer,jsonb,text,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v2_commit_workspace_turn(uuid,uuid,text,integer,jsonb,text,jsonb,uuid) TO service_role;
