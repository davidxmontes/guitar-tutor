# Project config for agent workflows

## The gate

Run both before every PR; paste the output into the PR body.

```bash
# frontend (from frontend/)
npm run lint
npm run build

# backend (from backend/, inside its venv)
python -m pytest -q
```

Setup, if not already done:

```bash
cd frontend && npm install
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

## Known gate gaps (verified 2026-09-06)

Verified against a clean archive of `main-v2` at `c2492c7` with the installed
lockfile dependencies. These existing failures remain outside #96; no passing
test may regress.

- `npm run lint`: 16 errors / 4 warnings on both baseline and integration.
  Existing Classic components and `src/stores/useAppStore.ts` own these;
  the changed V2 files introduce no new lint diagnostics.
- `python -m pytest -q`: the same single failure on both branches,
  `tests/test_chords_router.py::test_get_chord_returns_404_when_voicing_not_available`.
  It patches the removed `chords_router.get_voicing_positions` symbol.
  Baseline: 248 passed; after #96: 267 passed. All V2 backend tests pass.
- #96 clears the four formerly failing Tutor/history browser tests. The full
  browser suite now passes 43/43, including multi-source Tutor composition,
  re-binding without duplicate Blocks, persistent NoteGroup emphasis, transient
  attention expiry, and preview/restore with unsent-question preservation.

#96 verification: production build (including `VITE_AUTH_DEV_BYPASS=true`) and
17 adapter tests pass; full gate output is in its PR. The bypass build emits
only the existing large-chunk advisory. TutorFocus contains only one-turn
attention; cross-workspace comparison shapes use separate `comparison_groups`
response data. Existing historical comparison shapes remain readable.

## Local dev

```bash
# backend
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# frontend
cd frontend && npm run dev
```

Or `docker-compose up --build` per the README — note there's currently no
`docker-compose.yml` or `.env.example` at the repo root despite the README
referencing them; local dev (above) is the path that actually works today.

## Base branch: `main-v2`

The Guitar Tutor V2 effort (Spec issue #10 and its sub-issue tickets) branches
off and lands on **`main-v2`**, not `main`, until V2 is proven and made the
default (see ticket #26, "Make V2 the default, keep Classic as fallback").
Treat `main-v2` as this repo's main for every V2 ticket:

- Ticket branches: `feature/issue-<n>-<slug>`, based on `main-v2`.
- PRs target `main-v2` (`gh pr create --base main-v2`).
- `main-v2` is kept in sync with `main` by fast-forward merge whenever `main`
  gets updates V2 should pick up (e.g. the Clerk auth / Supabase work merged
  via PR #27) — don't let it drift into its own diverging history.
- Non-V2 work (Classic bug fixes, doc/chore changes) still targets `main`
  as usual.

## Project posture

- **Personal/solo project.** No external contributors expected right now.
  `/triage` is normally unnecessary, and pull requests remain disabled as an
  incoming request surface in `docs/agents/issue-tracker.md`.
- **Structure:** keep the existing `frontend/` + `backend/` split — it's
  intentional (backend-driven theory engine, thin frontend display layer per
  the README's Design decisions), not something to reorganize as part of
  workflow setup.
- **YAGNI / dependency policy:** ponytail (full) governs this — lowest rung
  of the ladder that meets acceptance criteria, no speculative abstractions,
  no new dependency when a few lines or an already-installed one will do.
- **Tech-debt ledger:** none kept. Known gaps get a section in this file (see
  above) rather than a separate tracking issue.
- **Primary context docs:** `CONTEXT.md` defines product language;
  `docs/adr/` records durable decisions; current GitHub specs define feature
  behavior; and `docs/guitar_tutor_v2_ux_reference.html` is the general V2
  UX/layout reference. `README.md` remains a broad product and legacy-system
  overview, so verify V2 behavior against current specs and code.
  `docs/superpowers/specs/` and `docs/superpowers/plans/` are historical
  inputs, not active workflow instructions; use a Superpowers skill only when
  the user names it.
  The UX reference doc is a reference, not a spec to follow strictly — if
  implementation surfaces a better layout/interaction than what's mocked,
  explore that instead and note the deviation rather than forcing the mock's
  shape.
  Per-artifact mocks supersede the general reference where they exist and
  overlap — `docs/guitar_tutor_songstudy_target_mocks.html` is the concrete
  target for SongStudy specifically (Overview+Focus, Full Tab, and mobile
  layouts, plus frontend-team notes); prefer it over the general reference
  doc for that screen. Same posture: reference, not strict spec.
- **V1 UI inspiration:** V1's styling/presentation is fair game to draw from
  where it already looks right, even though the V2 components won't be a
  one-to-one port — new data shapes and, per the spec, a semantic
  role/group vocabulary (primary/comparison/shared/focus/etc.) mean the V2
  component is a new implementation either way. Chord diagrams
  (`frontend/src/components/ChordDiagram/`) are the known example: its
  dot-grid presentation reads better than what's mocked in the UX reference
  doc above, so build the V2 version to look like that, but write it fresh
  against the new V2 data shapes (e.g. a `Progression`/SongStudy artifact's
  voicing payload) rather than trying to adapt V1's component or its
  chord-service response shape in place. Fretboard
  (`frontend/src/components/Fretboard/`) is a second example — take
  presentation cues from it, but expect its interaction/visuals to be
  refined in this pass rather than carried over unchanged.

## ConceptWorkspace storage

For Supabase deployments, apply the additive `working_draft` column in
`docs/agents/v2-schema.sql` before deploying the #60 backend. No existing
ConceptStudy payloads are converted. Memory storage needs no setup.

Before deploying #62, also apply `docs/agents/v2-workspace-turns.sql` with
an administrative database connection. Its service-role-only RPC commits the
Working Draft, exact before/after snapshots, and Tutor messages in one
transaction; Undo uses the same transaction. Deployments missing the RPC
cannot apply workspace Tutor turns. No saved artifact revisions are changed.
The SQL is prepared in-repo; applying production DDL remains a manual step.

Run the database rollback/ownership check against a disposable local PostgreSQL
cluster (PostgreSQL 16 tools on PATH) from `backend`:
`.venv/bin/python tests/v2/check_workspace_transaction.py`.
`npm run test:e2e` includes scripted workspace Tutor acceptance without live
model calls; the model override exists only in the test server module.

Known #62 simplification: destructive Tutor operations require a narrow
English action prefix in the learner's request. This is a conservative guard,
not a natural-language intent classifier; ambiguous or localized requests may
be rejected. Broaden to explicit product intent support when those journeys
are needed (small/medium follow-up). Snapshot undo remains the recovery path.

Before deploying #61, apply `docs/agents/v2-workspace-saves.sql`. It adds the
branch's saved-artifact revision token and a service-role-only save transaction.
The token survives reload, so a stale branch cannot overwrite a newer saved
study. Save as a new study is the recovery path that preserves both versions.
The existing disposable PostgreSQL check also verifies this transaction,
including rollback after a branch-write failure. Production DDL is manual.

Before deploying #63, reapply `docs/agents/v2-workspace-turns.sql`. It extends
the transaction with historical snapshot restore and replaces the old RPC
overload. Restore uses the same owned-thread lookup, branch version guard,
and atomic draft/message commit; it never updates a saved Artifact. This SQL
is prepared and verified in the disposable PostgreSQL check, not run in production.

## ConceptStudy cutover (#68)

Explore and explicit Tutor concept tangents now open ConceptWorkspace drafts.
The fixed Study UI, payload variants, visualization/catalog/create/update
endpoints, and transient Circle state have been removed. Saved workspace read
and independent reopen endpoints remain. Unsupported old ConceptStudy payloads
are left intact and offer recovery through Explore; no migration is performed.
Trusted CAGED positions, region generation, scale metadata and Circle key order
remain shared deterministic music helpers.

Workspace Tutor uses a dismissible, non-modal native dialog panel on desktop
and mobile; Close/Escape returns focus to its launcher. Saved workspace material
can still be copied into Exercises through the existing composer. Fixed-page
browser/domain tests were removed; workspace tests cover their current contracts,
while SongStudy, Progression, Exercise and other V2 regression coverage remains.
