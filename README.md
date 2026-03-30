# Guitar Tutor

An interactive web app for learning guitar music theory. Pick a scale or chord, see it on the fretboard, search for songs with real tabs, and chat with an AI tutor that can answer questions and update the board in real time.

![React](https://img.shields.io/badge/React-19-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.114-green) ![Python](https://img.shields.io/badge/Python-3.12-yellow) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)

## What it does

- **Interactive fretboard** — 22 frets, all 6 strings, clickable notes. Toggle between note names and intervals.
- **Scale explorer** — 14+ scales with diatonic chord generation. Select a scale and see every note highlighted across the neck.
- **Chord visualizer** — 18+ chord qualities powered by a curated voicing database. Explore real guitar voicings across positions on the neck.
- **Voicing filtering** — Toggle individual voicings on/off, isolate one position, or view all voicings together.
- **Song view** — Search for songs via Songsterr, browse tracks, and view tablature with a scrollable measure-by-measure tab viewer. Selecting a beat highlights the corresponding notes on the fretboard. Tuning auto-detects from the track. Switch between tab and chord/lyric views (ChordPro).
- **AI tutor chat** — Ask questions about music theory and get answers that automatically update the fretboard. The agent can search for songs, navigate to specific measures, and highlight fret positions directly on the board. Suggestions come as clickable pills you can tap to load instantly.
- **Agent fretboard highlights** — The tutor can overlay named highlight groups (chord shapes, scale boxes, voicings) on the fretboard with a carousel to cycle through alternatives.
- **Mobile friendly** — Responsive layout with a slide-up chat panel on small screens.

## Tech stack

**Frontend:** React, TypeScript, Vite, Tailwind CSS, Zustand

**Backend:** FastAPI, LangGraph, LangChain, Pydantic

**Infra:** Docker, Docker Compose, Nginx

## Getting started

### Docker (recommended)

```bash
cp .env.example .env
# fill in your API keys

docker-compose up --build
```

App runs at `http://localhost`, API at `http://localhost:8000`.

### Local dev

**Backend:**

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api` to the backend.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | Powers the AI tutor |
| `LANGSMITH_API_KEY` | No | LLM tracing/observability |
| `LANGSMITH_TRACING` | No | Enable tracing (`true`/`false`) |
| `ALLOWED_ORIGINS` | No | CORS origins, comma-separated |

## API

The backend exposes a few endpoints — full docs available at `/docs` when the server is running.

- `GET /api/fretboard` — Full chromatic fretboard grid
- `GET /api/scales/{root}/{mode}` — Scale positions + diatonic chords
- `GET /api/chords/{root}/{quality}` — Chord positions with database-backed voicings
- `GET /api/tunings` — Available guitar tunings
- `GET /api/songs/search?q=...` — Search songs via Songsterr
- `GET /api/songs/{id}/tracks` — Track list for a song
- `GET /api/songs/{id}/tab?track=0` — Tab data for a specific track
- `GET /api/songs/{id}/chords` — ChordPro lyrics + chords
- `POST /api/agent/chat` — Send a message to the AI tutor
- `POST /api/agent/chat/stream` — SSE streaming chat
- `POST /api/agent/resume` — Resume after a clarifying question

## Agent architecture

The AI tutor is a LangGraph state graph with three nodes:

```
START -> prepare_question -> clarify_input -> generate_answer -> END
```

1. **prepare_question** — Gate node. Classifies the user's message as proceed, needs-clarification, or out-of-scope. Uses a running conversation summary and UI context (selected scale/chord/song, playhead position) to make the decision.
2. **clarify_input** — If the gate requested clarification, this node interrupts the graph (LangGraph `interrupt`) and returns the question to the user. When the user responds, the graph resumes and routes to `generate_answer`.
3. **generate_answer** — Multi-step answer generation:
   - **Song tool planning** — An LLM call decides whether to search for a song or navigate to a measure, producing action payloads the frontend executes.
   - **Answer text** — The main LLM call generates the teaching response, grounded in conversation summary, UI context, and any tool results.
   - **Post-processing** — A structured output call extracts metadata (scale name, chord choices, visualization flag) and fretboard highlight groups (named sets of string/fret positions) in one pass.

The agent supports both synchronous and SSE streaming endpoints. Conversation state is checkpointed per thread (in-memory or SQLite) so multi-turn context survives across requests.

## Project structure

```
├── frontend/
│   ├── src/
│   │   ├── components/       # Fretboard, Chat, Selectors, Song, TabViewer, Layout
│   │   ├── stores/           # Zustand state (slices per domain)
│   │   ├── api/              # API client
│   │   ├── types/            # TypeScript interfaces
│   │   └── App.tsx
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   ├── routers/          # Thin FastAPI route handlers
│   │   ├── services/         # Business logic (scale, chord, fretboard, songsterr)
│   │   ├── music/            # Pure music theory engine (scales, chords, tunings, notes)
│   │   ├── agent/            # LangGraph AI tutor (graph, parser)
│   │   └── models/           # Pydantic schemas
│   └── requirements.txt
│
└── docker-compose.yml
```

## Design decisions

- **Backend-driven theory** — All music theory calculations (scale formulas, chord notes, voicing adaptation) live on the backend. The frontend is a display layer.
- **Service layer** — Routers are thin (validate input, call service, return result). Business logic lives in `services/` so it can be shared between HTTP endpoints and the agent.
- **CSS Grid fretboard** — The fretboard is built with Tailwind's CSS Grid, not SVG or canvas. Simpler to style and naturally responsive.
- **LangGraph agent** — The AI tutor uses a three-node state graph (gate, interrupt, answer) with conversation summarization and checkpointed threads for multi-turn memory.
- **Song-fretboard bridge** — Selecting a beat in the tab viewer highlights notes on the fretboard. The agent can also emit highlight groups and song navigation actions that the frontend applies automatically.
- **Zustand over Redux** — Lightweight state management split into domain slices (scale, chord, song, chat, UI, agent highlights) without the boilerplate.
