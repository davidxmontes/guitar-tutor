"""Check the Riff migration on a disposable local database, never hosted storage.

Run from backend/: python tests/v2/check_riff_migration.py (PostgreSQL on PATH).
"""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile


def check():
    postgres = shutil.which('postgres')
    if not postgres:
        raise SystemExit('Install PostgreSQL to run the local Riff migration check')
    bindir = Path(postgres).parent
    repo = Path(__file__).resolve().parents[3]
    schema = (repo / 'docs/agents/v2-schema.sql').read_text()
    migration = (repo / 'docs/agents/v2-riffs.sql').read_text()
    with tempfile.TemporaryDirectory(prefix='riff-migration-') as directory:
        root = Path(directory)
        data = root / 'data'
        subprocess.run([str(bindir / 'initdb'), '-D', str(data), '--auth=trust', '--no-locale'], check=True, capture_output=True)
        subprocess.run([str(bindir / 'pg_ctl'), '-D', str(data), '-l', str(root / 'postgres.log'),
                        '-o', f"-k {root} -c listen_addresses=''", '-w', 'start'], check=True, capture_output=True)
        try:
            def sql(statement, success=True):
                result = subprocess.run([str(bindir / 'psql'), '-h', str(root), '-d', 'postgres',
                                         '-XAt', '-v', 'ON_ERROR_STOP=1'], input=statement,
                                        text=True, capture_output=True)
                assert (result.returncode == 0) == success, result.stderr
                return result.stdout.strip()

            def insert(kind, owner="'owner'"):
                return f"INSERT INTO public.v2_artifacts(clerk_user_id,kind,title,payload) VALUES ({owner},'{kind}','Kept music','{{\"notes\":[1]}}'::jsonb);"

            # Simulate an existing pre-Riff install using its original kind CHECK.
            old_schema = schema.replace("'exercise', 'riff'", "'exercise'")
            assert old_schema != schema
            sql('CREATE ROLE service_role;')
            sql(old_schema)
            for name in ('v2-workspace-turns.sql', 'v2-progression-saves.sql'):
                sql((repo / 'docs/agents' / name).read_text())
            for kind in ('song_study', 'progression', 'exercise'):
                sql(insert(kind))
            sql(insert('riff'), success=False)
            rows_query = 'SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.v2_artifacts a;'
            rows_before = json.loads(sql(rows_query))
            rules_query = """
                SELECT jsonb_build_object(
                  'constraints', (SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname)
                    FROM pg_constraint WHERE conrelid='public.v2_artifacts'::regclass AND conname <> 'v2_artifacts_kind_check'),
                  'columns', (SELECT jsonb_agg(jsonb_build_array(attname, attnotnull) ORDER BY attnum)
                    FROM pg_attribute WHERE attrelid='public.v2_artifacts'::regclass AND attnum > 0),
                  'rls', (SELECT jsonb_build_array(relrowsecurity, relforcerowsecurity)
                    FROM pg_class WHERE oid='public.v2_artifacts'::regclass),
                  'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE tablename='v2_artifacts'),
                  'rpcs', (SELECT jsonb_agg(pg_get_functiondef(oid) ORDER BY proname)
                    FROM pg_proc WHERE proname IN ('v2_workspace_turn', 'v2_save_progression_idea'))
                );
            """
            rules_before = json.loads(sql(rules_query))

            # A failure inside the transaction rolls back the CHECK replacement.
            sql(migration.replace('COMMIT;', 'SELECT 1 / 0;\nCOMMIT;'), success=False)
            sql(insert('riff'), success=False)
            assert json.loads(sql(rows_query)) == rows_before

            # A renamed constraint fails safely, leaving the existing CHECK intact.
            sql('ALTER TABLE public.v2_artifacts RENAME CONSTRAINT v2_artifacts_kind_check TO custom_kind_check;')
            sql(migration, success=False)
            sql(insert('riff'), success=False)
            sql('ALTER TABLE public.v2_artifacts RENAME CONSTRAINT custom_kind_check TO v2_artifacts_kind_check;')

            sql(migration)
            assert json.loads(sql(rows_query)) == rows_before
            assert json.loads(sql(rules_query)) == rules_before
            sql(insert('riff'))
            sql(insert('unsupported'), success=False)
            sql(insert('riff', owner='NULL'), success=False)
            assert sql('SELECT count(*) FROM public.v2_artifacts;') == '4'

            # Fresh installations also admit riff using the updated schema.
            sql('CREATE DATABASE fresh_riff;')
            result = subprocess.run([str(bindir / 'psql'), '-h', str(root), '-d', 'fresh_riff',
                                     '-XAt', '-v', 'ON_ERROR_STOP=1'], input=schema + '\n' + insert('riff'),
                                    text=True, capture_output=True)
            assert result.returncode == 0, result.stderr
            print('Riff migration: existing rows, ownership constraints, RLS and RPCs preserved; riff admitted.')
            print('Transaction failure and renamed-constraint prerequisite fail safely; unsupported kinds/null ownership rejected.')
            print('Fresh installation admits riff. Only disposable local PostgreSQL was used.')
        finally:
            subprocess.run([str(bindir / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, capture_output=True)


if __name__ == '__main__':
    check()
