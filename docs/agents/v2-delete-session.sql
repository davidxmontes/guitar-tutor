-- Apply to Supabase before enabling session deletion in that environment.
CREATE OR REPLACE FUNCTION v2_delete_session(p_session_id uuid, p_user_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM id FROM v2_sessions WHERE id = p_session_id AND clerk_user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  DELETE FROM v2_tutor_messages WHERE tutor_thread_id IN
    (SELECT tutor_thread_id FROM v2_branches WHERE session_id = p_session_id);
  DELETE FROM v2_sessions WHERE id = p_session_id AND clerk_user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION v2_delete_session(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION v2_delete_session(uuid, text) TO service_role;
