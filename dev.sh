#!/usr/bin/env bash
# Starts (or stops) backend (:8000) + frontend (:5173) for local dev —
# works from main-v2 or any ticket worktree branched from it. Creates
# backend/.env and frontend/.env with dev-auth-bypass defaults if missing
# (both gitignored). Idempotent: skips a server that's already running.
#
# Usage: ./dev.sh          start both (if not already running)
#        ./dev.sh down     stop both
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ "${1:-}" = "down" ]; then
  pids=$(lsof -ti:8000,5173 2>/dev/null || true)
  if [ -z "$pids" ]; then
    echo "Nothing running on :8000 or :5173."
  else
    kill $pids
    echo "Stopped: $pids"
  fi
  exit 0
fi

[ -f backend/.env ] || cat > backend/.env <<'EOF'
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AUTH_DEV_BYPASS=true
V2_STORAGE_BACKEND=memory
EOF

[ -f frontend/.env ] || cat > frontend/.env <<'EOF'
VITE_API_BASE_URL=/api
VITE_AUTH_DEV_BYPASS=true
EOF

[ -d backend/.venv ] || (echo "No backend/.venv — set it up first (see docs/agents/project.md)." && exit 1)
[ -d frontend/node_modules ] || (cd frontend && npm install)

if lsof -ti:8000 >/dev/null 2>&1; then
  echo "Backend already running on :8000 — skipping."
else
  ( cd backend && source .venv/bin/activate && nohup uvicorn app.main:app --reload --port 8000 > /tmp/guitar-tutor-backend.log 2>&1 & )
  echo "Backend starting on :8000 (log: /tmp/guitar-tutor-backend.log)"
fi

if lsof -ti:5173 >/dev/null 2>&1; then
  echo "Frontend already running on :5173 — skipping."
else
  ( cd frontend && nohup npm run dev -- --port 5173 > /tmp/guitar-tutor-frontend.log 2>&1 & )
  echo "Frontend starting on :5173 (log: /tmp/guitar-tutor-frontend.log)"
fi

sleep 3
echo ""
echo "V2 app:      http://localhost:5173/v2"
echo "Classic app: http://localhost:5173/"
echo "Backend API: http://localhost:8000/docs"
echo ""
echo "Stop both:   ./dev.sh down"
