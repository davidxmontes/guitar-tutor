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

## Maintainability review (2026-09-18)

Started from `main-v2` at `899b488` in an isolated worktree. The original working
copies and their uncommitted changes were preserved. The baseline was measured
before fixes:

| Check | Baseline | After review |
| --- | --- | --- |
| Frontend lint | 16 errors, 4 warnings | Clean |
| Production build / TypeScript | Pass | Pass |
| Frontend unit tests | 1 passed | 3 passed |
| Backend tests | 276 passed, 1 failed | 337 passed |
| Browser journeys | 42 passed, 5 failed | 57 passed |
| Local PostgreSQL 16 transaction check | Not part of the initial gate | Pass |

The backend failure patched a removed chord-catalog symbol. Browser failures
were two ambiguous duplicate headings, two obsolete SVG stroke assertions,
and a Progression neck pushed below the desktop viewport. These were corrected
without accepting the old failures as a permanent gate exception.

Reviewed end to end: Session create/list/continue/delete and Branch navigation;
Harmony Focus, scratch, triads, voicings and CAGED; Develop, Progression editing,
Save/reopen and practice; shared rendering, playback and transient previews;
Tutor job submission/polling, failure recovery, candidate actions, Undo/Restore;
owned memory/Supabase writes, Classic checkpoint/thread boundaries; auth,
configuration, CORS and image build inputs. SongStudy remains an independent
artifact viewer with shared tab, shape and practice controls.

Completed corrections include stale list/account-state isolation, optimistic
revision checks for workspace gestures, durable Branch validation, preview
preflights, nonblocking signing-key lookup, Classic thread ownership, centralized
environment loading, storage-setting validation, one store across concurrent
startup requests, and retaining Tutor guides in Docker build inputs. Removed
Classic mirrored chord state and dead props, repaired playback/callback behavior,
and restored the frontend lint gate.

Shared musical values now live in `frontend/src/types/music.ts`, and persisted
Harmony/Progression state and Tutor Composition contracts live in `types/v2.ts`.
The former dependency from wire models back into UI modules is gone;
Harmony's implemented Focus states replace
the old placeholder dictionaries. Theme state has one shared owner, Classic and
V2 load separate app entries, and tab rendering/practice share one playable-voice
selector. Backend CAGED resolution directly produces the current Harmony shape;
unused cutover vocabulary and intermediate Concept models were removed. An
exact before/after comparison covered 292 CAGED root/quality/tuning cases,
including enharmonic spelling and stable ordering when projected frets tie.
Saved-work search and My Stuff now read current progression tonal-center and
provenance fields. Three real idea-to-Save regressions cover key lookup and song,
concept and Harmony source labels; stored snapshots remain unchanged.

Synchronous storage/provider handlers now use FastAPI's native worker threads.
Songsterr and Tutor job orchestration remain async, with their synchronous phases
offloaded. The existing memory transaction lock now also protects creation and
iteration, so a failed Save cannot erase another request's newly created
Artifact. Concurrent Classic startup shares one agent/checkpoint store.
Regression checks hold slow operations while an unrelated health request
completes; the 42 affected API path schemas are unchanged.

Musical reuse uses the existing `PhysicalChordDiagram` plus a bare
`FretboardDiagram` extracted from the workspace wrapper. Existing callers use
one neck renderer, component-owned styles and order-independent physical shape
identity. Read-only necks expose descriptions rather than inert note buttons;
controls remain with callers. See [frontend reuse guide](../../frontend/README.md)
for compact and expanded compositions and the intentional Classic boundary.

Verification uses local auth, memory storage, scripted external-provider
boundaries, and a disposable local database. No live Clerk, Supabase, model,
Songsterr or deployed-service verification is claimed. The Docker daemon was
unavailable; image contents/configuration were checked statically, not by running
images. Browser inspection includes compact/bare/expanded music at desktop and
320px, light/dark themes, keyboard interaction and page containment. Browser
checks also verify theme persistence and that each app loads independently.
The local-auth-bypass build's V2 entry plus shared JavaScript is about 567 kB
minified, down from the former 697 kB combined app. Total JavaScript remains
nearly unchanged; this is deferred loading, not a measured startup-speed claim.
No chunk now triggers the 500 kB build advisory. Upstream Python deprecation
and browser-mapping-age warnings remain.

### Deliberate limits and decisions

- Tutor jobs are process-local, bounded and expiring. One backend worker is the
  supported deployment assumption; unfinished jobs do not survive restart. Use
  durable jobs before requiring multiple workers or restart recovery.
- Supabase Session creation inserts Session and initial Branch separately. Making
  that operation atomic requires a new deployed RPC/migration; the reviewed
  workspace turn and Save RPCs are already transactional.
- Storage and model clients remain synchronous and use the native worker pool.
  No production throughput or latency claim is made; pool saturation and hosted
  performance were not measured.
- Kept NoteGroups and pinned physical shapes retain absolute notes/frets when key
  or tuning changes. Transposing them needs a product rule for binding, movement
  and out-of-range notes, rather than an inferred renderer transformation.
- SongStudy/Exercise Tutor context remains disconnected. Adding it requires an
  explicit artifact-context contract; workspace Tutor is available on return.
- Classic chat now uses explicit anonymous/per-user browser-storage keys. Old
  unscoped chat records remain untouched but are no longer loaded automatically:
  their owner cannot be inferred safely. Assigning/recovering that legacy local
  history needs an explicit owner decision. Switching accounts reloads Classic
  to discard pending callbacks and unsaved UI state; saved scoped chat returns
  when that account returns.
- Classic and V2 diagram wrappers keep their distinct selection, barre, interval
  and color semantics. No universal rendering framework or new dependency was
  introduced. File size alone was not used to split working modules.
- Frontend persisted workspace and presentation types now have explicit owners;
  edit-command payloads still use open dictionaries. This is not a full generated
  or runtime-validated client API contract.

### Final review

Correctness review covered authentication boundaries, concurrent writes, local
state ownership and the changed display callers. An independent musical-UI pass
found obsolete workspace CSS overriding the shared renderer's dark root colors;
removing it restored readable root-label contrast, verified in the expanded
workspace. A separate Ponytail pass retained purposeful Classic/V2 semantics,
the two storage implementations and Composer validation, and removed redundant
state/styles rather than adding adapters or generic presentation controls.
The structural review removed duplicate tab logic, component-owned wire types,
and CAGED conversion models instead of adding a new service or rendering layer.
Retained contracts with different accepted fret ranges rather than merging them
based on similar names. This record describes the covered flows and observed
limits; it is not a claim that the repository has no further improvement
opportunities.

### Local development and additional checks

The root [README](../../README.md) has the working local setup. There is no
checked-in Docker Compose file. The backend loads root `.env` as a compatibility
fallback, then `backend/.env`; process environment values take precedence.

Alongside the required gate, run `npm test` and `npm run test:e2e` in `frontend`.
Browser verification boots both servers and needs installed Chromium. From
`backend`, `.venv/bin/python tests/v2/check_workspace_transaction.py` uses
PostgreSQL tools on PATH to create a disposable local cluster; it does not target
a hosted database. It checks Branch constraints, turn/save commit and rollback,
ownership, stale rejection, Undo and Restore.

## Base branch: `main-v2`

The Guitar Tutor V2 effort (Spec issue #10 and its sub-issue tickets) branches
off and lands on **`main-v2`**, not `main`, for the current V2 development line.
V2 is already the default entry; `/classic` is the fallback.
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
  the README's ownership section), not something to reorganize as part of
  workflow setup.
- **YAGNI / dependency policy:** ponytail (full) governs this — lowest rung
  of the ladder that meets acceptance criteria, no speculative abstractions,
  no new dependency when a few lines or an already-installed one will do.
- **Tech-debt ledger:** none kept. Known gaps get a section in this file (see
  above) rather than a separate tracking issue.
- **Primary context docs:** `CONTEXT.md` defines product language;
  `docs/adr/` records durable decisions; current GitHub specs define feature
  behavior; and `docs/guitar_tutor_v2_ux_reference.html` is the general V2
  UX/layout reference. `README.md` covers the current product, setup and source
  map; verify detailed behavior against current specs and code.
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

## Workspace storage and Tutor transactions

The checked-in SQL describes the #100 Harmony/Progression hard cutover. These
are installation/reset documents, **not incremental migrations**. Do not rerun
them on a populated database without a separately planned and authorized reset.
No production reset or SQL installation is part of the maintainability review.

Install in order for an explicitly prepared store:

1. `v2-schema.sql`: Sessions, Branches, Artifacts, messages and ownership.
2. `v2-workspace-turns.sql`: the service-role-only atomic turn/Undo/Restore RPC.
3. `v2-progression-saves.sql`: the service-role-only atomic idea Save RPC.

A Branch owns Harmony Exploration and/or Progression Workspace. Its
`active_workspace` must name a present workspace. A Branch never links an
Artifact directly; a Progression idea draft holds that link. The former
ConceptWorkspace columns and RPCs are gone.

Each assistant turn owns an immutable `presentation` and `musical_snapshot`.
The Branch holds the live-turn pointer; transient attention is not stored. The
turn RPC checks ownership and revision before changing messages or music. Undo
restores the snapshot, while Restore selects the historical teaching surface.
Save checks both Branch and Artifact revisions; reopen creates a fresh draft
and clears the live surface pointer. Candidate IDs make Keep then Develop
idempotent; Develop copies Harmony scratch and provenance while keeping the
original exploration.

SongStudy opens independently from Explore or My Stuff. Current measure/beat
selection is local; saved ranges are artifact data. Returning to the workspace
preserves its music. Exercise composition accepts song passages or Progression
ideas, and saved exercises reopen in the shared practice player. Existing tests
cover rests, alternate tuning, enrichment failure/recovery and 320px layouts.
