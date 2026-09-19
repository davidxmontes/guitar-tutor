# Guitar Tutor

Guitar Tutor is a React + FastAPI guitar learning workspace. V2 is the default
product on `main-v2`; `/classic` preserves the original app.

## Product and ownership

A **Session** contains **Branches**. Each Branch owns its available Harmony and
Progression workspaces, and one Tutor conversation.

- **Harmony** explores scales, chords, triads, CAGED shapes, and a lightweight
  Scratch Sequence. It autosaves within the Branch; it is not a saved Artifact.
- **Progression** develops ordered chords, durations, and assigned voicings.
  Develop copies Harmony scratch into an idea. Save promotes an idea into a
  versioned Artifact in My Stuff.
- **Tutor** runs against the current Branch, using deterministic music tools
  and a validated Composition. Its musical change, messages, snapshot, and live
  presentation pointer commit together. Restore changes the teaching surface;
  Undo restores music only while the revision still matches.
- **SongStudy and Exercise** are separate saved-artifact viewers. SongStudy
  reuses tab, shape, enrichment, and practice facilities. Song-aware Tutor
  conversation is not connected to these independent viewers.

The backend owns musical derivation and persistence. React renders resolved
notes and voicings; view controls, audio playback, and hover previews are local.
The glossary is [CONTEXT.md](CONTEXT.md); durable boundaries are in
[docs/adr](docs/adr). See [frontend/README.md](frontend/README.md) for musical
component reuse and [project guidance](docs/agents/project.md) for the gate and
remaining operational limits.

## Local development

Python 3.12 and Node.js 22 are the versions used by the Dockerfiles.

```sh
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt 'uvicorn[standard]'
AUTH_DEV_BYPASS=true V2_STORAGE_BACKEND=memory .venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```sh
cd frontend
npm ci
VITE_AUTH_DEV_BYPASS=true npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to the backend. The local auth
bypass signs in as a fixed development user. In-memory work is lost when the
backend stops. Neither provider credentials nor hosted services are needed for
musical exploration or the scripted test suite.

For authenticated/provider-backed use, the variable names are documented in
[backend/.env.example](backend/.env.example) and
[frontend/.env.example](frontend/.env.example). Both auth bypasses must be off
outside local testing. Clerk uses `CLERK_ISSUER_URL` on the backend and
`VITE_CLERK_PUBLISHABLE_KEY` in the frontend. V2 chooses its provider/model with
`V2_TUTOR_PROVIDER` and `V2_TUTOR_MODEL`, independently of Classic.

Classic chat history is isolated by account. Earlier unscoped browser records
are preserved but no longer restored automatically because their owner is
unknown; see [the compatibility note](docs/agents/project.md#deliberate-limits-and-decisions).

## Verification

```sh
cd frontend
npm run lint
npm run build
npm test
npm run test:e2e

cd ../backend
.venv/bin/python -m pytest -q
```

Playwright starts both local servers, uses memory persistence and a scripted
Tutor/Songsterr boundary, and needs installed Chromium (`npx playwright install
chromium`). Set `PLAYWRIGHT_BACKEND_PORT` and `PLAYWRIGHT_FRONTEND_PORT` if the
default ports are occupied. Unit/API tests use fixtures rather than paid model
calls. The build includes TypeScript checking.

The disposable PostgreSQL transaction check is
`backend/tests/v2/check_workspace_transaction.py`; it requires PostgreSQL tools
on PATH and operates on a temporary local cluster. It verifies the checked-in
schema/RPCs, not a hosted database.

## Source map

| Path | Responsibility |
| --- | --- |
| `frontend/src/v2/` | V2 shell, workspaces, shared music displays, Tutor, practice |
| `frontend/src/components/`, `src/App.tsx`, `src/stores/` | Classic UI/state; selected tab/song components are reused by V2 |
| `frontend/src/api/client.ts` | HTTP and Classic streaming transport |
| `backend/app/v2/` | V2 models, theory resolution, mutations, Tutor contracts and stores |
| `backend/app/music/`, `app/services/` | Shared deterministic music and Songsterr services |
| `backend/app/agent/`, `app/routers/agent.py` | Classic LangGraph agent and checkpoint routes |
| `backend/app/dependencies/auth.py` | Clerk token verification and local bypass |
| `docs/agents/` | Workflow, schema/RPC documents and verified limitations |

## Deployment boundaries

Service Dockerfiles exist; there is no checked-in Docker Compose configuration.
The frontend image serves the SPA through Nginx and expects a reachable
`backend:8000` upstream unless its configuration is changed. Vite variables
are build-time values. Backend Tutor guide Markdown files are runtime assets
and must be included in its image.

`V2_STORAGE_BACKEND=supabase` selects durable workspace storage; installation of
the schema and transaction RPCs is an explicit deployment operation described
in [project guidance](docs/agents/project.md). Background Tutor jobs are still
process-local: use one backend worker, and expect unfinished jobs to be lost on
server restart. A durable job system is needed before changing that deployment
assumption. No service is deployed by the local verification commands above.
