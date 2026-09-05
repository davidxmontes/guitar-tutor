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

## Known gate gaps (as of 2026-09-04)

These are pre-existing, not introduced by any agent session — logged here per
the workflow doc instead of a ledger issue (none is kept, see posture below).
Fix opportunistically or as their own ticket; don't let them block unrelated
PRs, but don't let new PRs add to them either.

- `npm run lint` (frontend): 14 errors / 3 warnings, concentrated in
  `src/stores/useAppStore.ts` (`no-explicit-any` x2) and
  `src/components/TabViewer/TabViewer.tsx` (`react-hooks/set-state-in-effect`
  x2, plus an `exhaustive-deps` warning).
- `python -m pytest -q` (backend): 1 failure —
  `tests/test_chords_router.py::test_get_chord_returns_404_when_voicing_not_available`
  references `chords_router.get_voicing_positions`, which no longer exists on
  the router (stale after a rename). 28 other tests pass.

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
  `/triage` and the "PRs as a request surface" flag in
  `docs/issue-tracker.md` don't apply until that changes.
- **Structure:** keep the existing `frontend/` + `backend/` split — it's
  intentional (backend-driven theory engine, thin frontend display layer per
  the README's Design decisions), not something to reorganize as part of
  workflow setup.
- **YAGNI / dependency policy:** ponytail (full) governs this — lowest rung
  of the ladder that meets acceptance criteria, no speculative abstractions,
  no new dependency when a few lines or an already-installed one will do.
- **Tech-debt ledger:** none kept. Known gaps get a section in this file (see
  above) rather than a separate tracking issue.
- **Primary context docs:** `README.md` (architecture, API surface, design
  decisions), `docs/guitar_tutor_v2_ux_reference.html` (V2 UX/layout
  reference mocks — read before building any V2 screen), and
  `docs/superpowers/specs/` + `docs/superpowers/plans/` for past feature
  specs/plans. No `CONTEXT.md` / ADRs yet — created lazily by
  `/domain-modeling` when terms or decisions actually need recording.
  The UX reference doc is a reference, not a spec to follow strictly — if
  implementation surfaces a better layout/interaction than what's mocked,
  explore that instead and note the deviation rather than forcing the mock's
  shape.
- **V1 UI inspiration:** V1's styling/presentation is fair game to draw from
  where it already looks right, even though the V2 components won't be a
  one-to-one port — new data shapes and, per the spec, a semantic
  role/group vocabulary (active/candidate/comparison/etc.) mean the V2
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
