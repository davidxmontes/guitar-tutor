# Guitar Tutor

An interactive web app for learning guitar music theory. Pick a scale or chord, see it on the fretboard, and chat with an AI tutor that can answer questions and update the board in real time.

![React](https://img.shields.io/badge/React-19-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.114-green) ![Python](https://img.shields.io/badge/Python-3.12-yellow) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)

## What it does

- **Interactive fretboard** — 22 frets, all 6 strings, clickable notes. Toggle between note names and intervals.
- **Scale explorer** — 14+ scales with diatonic chord generation. Select a scale and see every note highlighted across the neck.
- **Chord visualizer** — 18+ chord qualities powered by a curated voicing database. Explore real guitar voicings across positions on the neck.
- **Voicing filtering** — Toggle individual voicings on/off, isolate one position, or view all voicings together.
- **AI tutor chat** — Ask questions about music theory and get answers that automatically update the fretboard. Suggestions come as clickable pills you can tap to load instantly.
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
- `POST /api/agent/chat` — Send a message to the AI tutor

## Project structure

```
├── frontend/
│   ├── src/
│   │   ├── components/       # Fretboard, Chat, Selectors, Layout
│   │   ├── stores/           # Zustand state (slices per domain)
│   │   ├── api/              # API client
│   │   ├── types/            # TypeScript interfaces
│   │   └── App.tsx
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   ├── routers/          # FastAPI route handlers
│   │   ├── music/            # Theory engine (scales, chords, tunings)
│   │   ├── agent/            # LangGraph AI tutor
│   │   └── models/           # Pydantic schemas
│   └── requirements.txt
│
└── docker-compose.yml
```

## Design decisions

- **Backend-driven theory** — All music theory calculations (scale formulas, chord notes, voicing adaptation) live on the backend. The frontend is a display layer.
- **CSS Grid fretboard** — The fretboard is built with Tailwind's CSS Grid, not SVG or canvas. Simpler to style and naturally responsive.
- **LangGraph agent** — The AI tutor uses a two-node state graph so it can pause to ask clarifying questions before answering.
- **Zustand over Redux** — Lightweight state management split into domain slices (scale, chord, chat, UI) without the boilerplate.
