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
lockfile dependencies. These existing failures remain outside #95; no passing
test may regress.

- `npm run lint`: 16 errors / 4 warnings on both baseline and integration.
  Existing Classic components and `src/stores/useAppStore.ts` own these;
  the changed V2 files introduce no new lint diagnostics.
- `python -m pytest -q`: the same single failure on every branch,
  `tests/test_chords_router.py::test_get_chord_returns_404_when_voicing_not_available`.
  It patches the removed `chords_router.get_voicing_positions` symbol.
  Counts: 248 passed at `c2492c7`; 268 after #95–96; **210 after #101** (the
  ConceptWorkspace / workspace-turn suites were deleted with the code they
  asserted). No pre-existing passing test regressed.
- Playwright (`npm run test:e2e`): after #101 the harness boots the real
  `app.main:app` (the ConceptWorkspace-model browser harness is deleted) and
  runs the shell/entry specs (`v2-foundation`, `default-entry`,
  `workspace-shell`). The concept/workspace/song/tutor/progression specs were
  removed with their surfaces.
- #96 clears the four formerly failing Tutor/history browser tests. The full
  browser suite now passes 43/43, including multi-source Tutor composition,
  re-binding without duplicate Blocks, persistent NoteGroup emphasis, transient
  attention expiry, and preview/restore with unsent-question preservation.

#96 verification: production build (including `VITE_AUTH_DEV_BYPASS=true`) and
17 adapter tests pass; full gate output is in its PR. The bypass build emits
only the existing large-chunk advisory. TutorFocus contains only one-turn
attention; cross-workspace comparison shapes use separate `comparison_groups`
response data. Existing historical comparison shapes remain readable.

#95 verification: 46/46 browser tests, 17 adapter tests, and both production
build modes pass. The Music bar now owns selected-Block settings and source
chips; inspected notes/chords/steps take precedence, with a bottom sheet at
320px. `update-view` delegates to the existing validated `update_view` operation.
One initial full-suite run hit the existing SongStudy test's immediate server
read before its asynchronous selection save completed; its isolated rerun and
the final full suite passed. If this recurs, wait for that save in the test.

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

## Branch storage — Harmony + Progression re-carve (#100, ticket #101)

**Hard cutover with a wiped store.** On deploy, the V2 data store (sessions,
branches, artifacts, tutor threads) is **cleared**. There is no converter, no
compatibility layer, and no legacy-shape routing — after the wipe there is no
old data to read. Running that wipe / production DDL is a deploy step; this
repo only prepares the SQL.

`docs/agents/v2-schema.sql` holds the **replaced** `v2_branches` table
(Spec #100 §5.1): `harmony_exploration jsonb`, `progression_workspace jsonb`,
`active_workspace text` (`'harmony'|'progression'`), `live_presentation_turn_id
text`, plus a table CHECK enforcing "at least one workspace present, and
`active_workspace` names a present one". The old columns
(`current_artifact_kind`/`current_artifact_id`, `working_draft`,
`saved_artifact_revision`, `selection`, `focus`, `recent_ideas`,
`fork_context`) are gone. `concept_study` is removed from every artifact-kind
CHECK. A Branch never links an Artifact — the link moves onto the Progression
idea draft (ticket P1).

The ConceptWorkspace-era RPCs (`v2-workspace-turns.sql`,
`v2-workspace-saves.sql`, `v2_commit_workspace_turn`, `v2_save_workspace_study`)
are **deleted outright**. The new turn transaction (Spec §5.7) lands with
ticket T3.

**Seam 3 check** — run against a disposable local PostgreSQL 16 cluster
(tools on PATH) from `backend`:
`.venv/bin/python tests/v2/check_workspace_transaction.py`. It loads the
replaced schema and round-trips the new Branch shape (active-workspace switch,
live-turn pointer, the workspace invariant, and the artifact-kind CHECK).

**Frontend shell (#101).** `Session → Branch → Workspace` routing on
`branch.active_workspace` with thin placeholder panels; `BranchNavigation`
kept for rare conversational forks (UX-05). A new Session / conversational
fork opens a Branch with an empty Harmony Exploration. The real Harmony
surface is ticket H1, Progression P1, the presentation runtime T2, the Tutor
per-turn contract T3 — between shell and those, the Progression workflow may
be non-functional (Spec §8), the only hard rule per merge being the gate.

**Deleted with this cutover.** Backend: `ConceptWorkspace` and everything in
`app.v2.workspace` except the retained helpers (`NoteGroup`, `NoteRef`,
`workspace_caged` CAGED region generation, note-spelling / diatonic-triad
helpers); `resolve_workspace`; `app.v2.workspace_changes` (`WorkspacePatch`
ops, the Inspection union, `materialize_inspection`); `app.v2.workspace_catalog`
and `app.v2.workspace_progressions`; the ConceptWorkspace catalog / create /
update / resolve / save / turn endpoints; `TutorTerminal.workspace_patch` and
`concept_suggestion`; the `concept_study` ArtifactKind and `ConceptStudyArtifact`.
Frontend: the whole `src/v2` UI except `BranchNavigation` (rebuilt as the
shell), `src/types/conceptWorkspace.ts`, `adaptBlock` / `workspaceAdapter` /
`ConceptWorkspacePanel` / `ConceptWorkspaceBlocks` / the old `ProgressionWorkspace`
+ `ProgressionPayload` editor path. Suites asserting those contracts were
removed or rewritten in the same change. `song_study` / `exercise` /
`progression` artifact kinds and their backend routes stay.
