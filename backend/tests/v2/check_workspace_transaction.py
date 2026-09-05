"""Run from backend/: python tests/v2/check_workspace_transaction.py.
Uses an isolated temporary PostgreSQL cluster, never a configured database.
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
            sql((repo / 'docs/agents/v2-workspace-turns.sql').read_text())
            sid = sql("INSERT INTO v2_sessions(clerk_user_id) VALUES ('owner') RETURNING id;").splitlines()[0]
            original = {'schema_version': 1, 'version': 1, 'title': 'Original', 'entities': []}
            bid = sql(f"INSERT INTO v2_branches(session_id,tutor_thread_id,working_draft) VALUES ('{sid}',gen_random_uuid(),{literal(original)}) RETURNING id;").splitlines()[0]
            def call(version, draft, text, undo=None, owner='owner', success=True):
                assistant = {'text': text, 'workspace_change': {'status': 'applied', 'reason': None}}
                result = sql(f"SELECT v2_commit_workspace_turn('{sid}','{bid}','{owner}',{version},{literal(draft) if draft else 'NULL'},'User request',{literal(assistant)},{repr(undo) if undo else 'NULL'});", success)
                return json.loads(result) if success else None
            applied = call(1, original | {'title': 'Dorian'}, 'Changed')
            assert applied['branch']['working_draft']['version'] == 2
            assert applied['message']['content']['workspace_before'] == original
            assert applied['message']['content']['workspace_after'] == applied['branch']['working_draft']
            stale = call(1, original, 'Stale explanation')
            assert stale['message']['content']['workspace_change']['status'] == 'rejected'
            assert stale['branch']['working_draft'] == applied['branch']['working_draft']
            assert call(2, original, 'Other owner', owner='other') == {'error': 'not_found'}
            sql("""CREATE FUNCTION fail_assistant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
                IF NEW.content->>'text' = 'force rollback' THEN RAISE EXCEPTION 'injected failure'; END IF;
                RETURN NEW; END; $$;
                CREATE TRIGGER fail_assistant BEFORE INSERT ON v2_tutor_messages FOR EACH ROW EXECUTE FUNCTION fail_assistant();""")
            count = sql('SELECT count(*) FROM v2_tutor_messages;')
            call(2, original, 'force rollback', success=False)
            assert sql('SELECT count(*) FROM v2_tutor_messages;') == count
            assert json.loads(sql(f"SELECT working_draft FROM v2_branches WHERE id='{bid}';")) == applied['branch']['working_draft']
            restored = call(2, None, 'Undo', undo=applied['message']['id'])
            assert restored['branch']['working_draft'] == original | {'version': 3}
            assert call(3, None, 'Undo twice', undo=applied['message']['id']) == {'error': 'conflict'}
            assert call(3, None, 'Undo marker', undo=restored['message']['id']) == {'error': 'conflict'}
            sql('CREATE ROLE browser_user;')
            assert sql("SELECT has_function_privilege('browser_user', 'v2_commit_workspace_turn(uuid,uuid,text,integer,jsonb,text,jsonb,uuid)', 'EXECUTE');") == 'f'
            print('PostgreSQL workspace transaction: apply, snapshots, stale, undo, ownership, rollback, permissions passed.')
        finally:
            subprocess.run([str(bindir / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, capture_output=True)


if __name__ == '__main__':
    check()
