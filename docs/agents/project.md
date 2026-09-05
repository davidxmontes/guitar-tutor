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
  decisions) and `docs/superpowers/specs/` + `docs/superpowers/plans/` for
  past feature specs/plans. No `CONTEXT.md` / ADRs yet — created lazily by
  `/domain-modeling` when terms or decisions actually need recording.
