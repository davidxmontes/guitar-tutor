"""Run from backend/: python tests/v2/check_workspace_transaction.py.
Uses an isolated temporary PostgreSQL cluster, never a configured database.

Seam 3 for ticket #101: the replaced Branch DDL (Spec #100 §5.1) loads on a
disposable Postgres 16 cluster and a Branch round-trips the new shape --
harmony_exploration / progression_workspace / active_workspace /
live_presentation_turn_id -- with the "at least one workspace, active names a
present one" invariant enforced as a table CHECK. The turn/save transaction
RPCs are ConceptWorkspace-era and were deleted with a hard cutover; the new
turn transaction (§5.7) lands with ticket T3.
"""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile


def check():
    postgres = shutil.which('postgres')
    if not postgres:
        raise SystemExit('Install PostgreSQL to run the transaction check')
    bindir = Path(postgres).parent
    with tempfile.TemporaryDirectory(prefix='workspace-transaction-') as directory:
        root, data = Path(directory), Path(directory) / 'data'
        subprocess.run([str(bindir / 'initdb'), '-D', str(data), '--auth=trust', '--no-locale'], check=True, capture_output=True)
        subprocess.run([str(bindir / 'pg_ctl'), '-D', str(data), '-l', str(root / 'postgres.log'), '-o', f"-k {root} -c listen_addresses=''", '-w', 'start'], check=True, capture_output=True)
        try:
            def sql(statement, success=True):
                result = subprocess.run([str(bindir / 'psql'), '-h', str(root), '-d', 'postgres', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', statement], text=True, capture_output=True)
                assert (result.returncode == 0) == success, result.stderr
                return result.stdout.strip()

            def literal(value):
                return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"

            repo = Path(__file__).resolve().parents[3]
            sql('CREATE ROLE service_role;')
            sql((repo / 'docs/agents/v2-schema.sql').read_text())

            sid = sql("INSERT INTO v2_sessions(clerk_user_id) VALUES ('owner') RETURNING id;").splitlines()[0]
            harmony = {'tonal_center': None, 'tuning': [64, 59, 55, 50, 45, 40], 'scratch': [],
                       'focus': {'kind': 'scale'}, 'pinned_voicings': [], 'kept_note_groups': [], 'provenance': None}
            progression = {'ideas': [], 'active_idea_id': None, 'focus': None}

            # New-session shape: a Harmony Exploration only, active_workspace 'harmony'.
            bid = sql(f"INSERT INTO v2_branches(session_id,tutor_thread_id,harmony_exploration,active_workspace) "
                      f"VALUES ('{sid}',gen_random_uuid(),{literal(harmony)},'harmony') RETURNING id;").splitlines()[0]
            row = json.loads(sql(f"SELECT to_jsonb(b) FROM v2_branches b WHERE id='{bid}';"))
            assert row['harmony_exploration'] == harmony
            assert row['progression_workspace'] is None
            assert row['active_workspace'] == 'harmony'
            assert row['live_presentation_turn_id'] is None

            # Both workspaces present, switch active to progression, set the live turn pointer.
            sql(f"UPDATE v2_branches SET progression_workspace={literal(progression)}, active_workspace='progression', "
                f"live_presentation_turn_id='turn-1' WHERE id='{bid}';")
            row = json.loads(sql(f"SELECT to_jsonb(b) FROM v2_branches b WHERE id='{bid}';"))
            assert row['active_workspace'] == 'progression'
            assert row['progression_workspace'] == progression
            assert row['live_presentation_turn_id'] == 'turn-1'

            # Invariant: active_workspace must name a present workspace.
            sql(f"UPDATE v2_branches SET active_workspace='progression', harmony_exploration=NULL, progression_workspace=NULL WHERE id='{bid}';", success=False)
            sql(f"INSERT INTO v2_branches(session_id,tutor_thread_id,active_workspace) VALUES ('{sid}',gen_random_uuid(),'harmony');", success=False)
            sql(f"INSERT INTO v2_branches(session_id,tutor_thread_id,progression_workspace,active_workspace) VALUES ('{sid}',gen_random_uuid(),{literal(progression)},'harmony');", success=False)

            # concept_study is gone from the artifact-kind CHECK; the surviving kinds still insert.
            sql("INSERT INTO v2_artifacts(clerk_user_id,kind,title,payload) VALUES ('owner','concept_study','x','{}'::jsonb);", success=False)
            for kind in ('song_study', 'progression', 'exercise'):
                sql(f"INSERT INTO v2_artifacts(clerk_user_id,kind,title,payload) VALUES ('owner','{kind}','x','{{}}'::jsonb);")

            sql((repo / 'docs/agents/v2-workspace-turns.sql').read_text())
            surface = {'pattern': 'explanation-led', 'focal': 'explanation', 'slots': {
                'explanation': [{'kind': 'explanation'}], 'illustration': [{'kind': 'fretboard'}]}}
            before = row
            music = {'harmony_exploration': harmony, 'progression_workspace': progression, 'active_workspace': 'harmony'}
            content = {'text': 'Answer', 'presentation': surface, 'attention': {'role': 'active'}}
            def commit(expected, value=content):
                return f"SELECT v2_workspace_turn('{bid}', 'owner', '{expected}', 'commit', {literal(music)}, 'Question', {literal(value)});"
            committed = json.loads(sql(commit(before['updated_at'])))
            turn = committed['live_presentation_turn_id']
            messages = json.loads(sql("SELECT jsonb_agg(to_jsonb(m) ORDER BY created_at) FROM v2_tutor_messages m;"))
            assert len(messages) == 2 and messages[1]['content']['presentation'] == surface
            assert 'attention' not in messages[1]['content']
            assert messages[1]['content']['musical_snapshot']['active_workspace'] == 'progression'
            sql(commit(before['updated_at']), success=False)
            # Fail the second insert after the branch update and user insert.
            sql("CREATE FUNCTION reject_assistant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role='assistant' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$;")
            sql("CREATE TRIGGER reject_assistant BEFORE INSERT ON v2_tutor_messages FOR EACH ROW EXECUTE FUNCTION reject_assistant();")
            sql(commit(committed['updated_at']), success=False)
            assert sql('SELECT count(*) FROM v2_tutor_messages;') == '2'
            assert json.loads(sql(f"SELECT to_jsonb(b) FROM v2_branches b WHERE id='{bid}';")) == committed
            sql('DROP TRIGGER reject_assistant ON v2_tutor_messages;')
            undone = json.loads(sql(f"SELECT v2_workspace_turn('{bid}', 'owner', '{committed['updated_at']}', 'undo', p_turn_id => '{turn}');"))
            assert undone['active_workspace'] == 'progression'
            assert undone['harmony_exploration'] == harmony and undone['progression_workspace'] == progression
            restored = json.loads(sql(f"SELECT v2_workspace_turn('{bid}', 'owner', '{undone['updated_at']}', 'restore', p_turn_id => '{turn}');"))
            assert restored['live_presentation_turn_id'] == turn
            assert restored['harmony_exploration'] == undone['harmony_exploration']
            sql(f"SELECT v2_workspace_turn('{bid}', 'other', '{restored['updated_at']}', 'restore', p_turn_id => '{turn}');", success=False)
            sql((repo / 'docs/agents/v2-progression-saves.sql').read_text())
            payload = {'title': 'Idea', 'tonal_center': None, 'tuning': [64,59,55,50,45,40], 'chords': [], 'provenance': None}
            draft = {'id': 'idea', 'label': 'Idea', 'chords': [], 'dirty': True}
            working = {'ideas': [draft], 'active_idea_id': 'idea', 'focus': None}
            sql(f"UPDATE v2_branches SET progression_workspace={literal(working)} WHERE id='{bid}';")
            stamp = sql(f"SELECT updated_at FROM v2_branches WHERE id='{bid}';")
            def save(expected, value=payload, owner='owner'):
                return f"SELECT v2_save_progression_idea('{bid}','{owner}','{expected}',{literal(value)});"
            saved = json.loads(sql(save(stamp)))
            aid = saved['artifact']['id']
            assert saved['branch']['progression_workspace']['ideas'][0]['artifact_id'] == aid
            assert saved['branch']['progression_workspace']['ideas'][0]['dirty'] is False
            sql(save(stamp), success=False)
            sql(save(saved['branch']['updated_at'], owner='other'), success=False)
            revised = json.loads(sql(save(saved['branch']['updated_at'], payload | {'title': 'Revised'})))
            assert len(revised['artifact']['payload']['_library']['revisions']) == 1
            sql("CREATE FUNCTION reject_save() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced save failure'; END $$;")
            sql("CREATE TRIGGER reject_save BEFORE UPDATE ON v2_branches FOR EACH ROW EXECUTE FUNCTION reject_save();")
            sql(save(revised['branch']['updated_at'], payload | {'title': 'Rollback'}), success=False)
            assert json.loads(sql(f"SELECT to_jsonb(a) FROM v2_artifacts a WHERE id='{aid}';")) == revised['artifact']
            sql('DROP TRIGGER reject_save ON v2_branches;')
            print('Progression Save RPC: atomic idea/artifact/revision, forced rollback, stale rejection and ownership passed.')
            print('Turn RPC: atomic snapshot/music/Composition/messages, forced rollback, stale rejection, Undo, Restore, ownership passed.')
            print('PostgreSQL Branch DDL: new-shape round-trip, active-workspace switch, live-turn pointer, '
                  'workspace invariant, and artifact-kind CHECK passed.')
        finally:
            subprocess.run([str(bindir / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, capture_output=True)


if __name__ == '__main__':
    check()
