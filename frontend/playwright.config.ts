import { defineConfig } from '@playwright/test'

const backendPort = Number(process.env.PLAYWRIGHT_BACKEND_PORT ?? 8000)
const frontendPort = Number(process.env.PLAYWRIGHT_FRONTEND_PORT ?? 5173)

// Single browser acceptance harness for the V2 foundation vertical slice
// (see docs/superpowers/specs/... V2 spec, Testing Decisions: "adding one
// browser acceptance harness for the defining V2 vertical slice is
// justified, while broad component coverage is not"). Boots the real
// backend + frontend dev servers with the local-only auth bypass so the
// suite needs no live Clerk/Supabase credentials.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: `http://localhost:${frontendPort}`,
  },
  webServer: [
    {
      command: `../backend/.venv/bin/uvicorn app.main:app --port ${backendPort}`,
      cwd: '../backend',
      port: backendPort,
      env: { AUTH_DEV_BYPASS: 'true', V2_STORAGE_BACKEND: 'memory' },
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -- --port ${frontendPort}`,
      port: frontendPort,
      env: { VITE_AUTH_DEV_BYPASS: 'true', VITE_DEV_PROXY_TARGET: `http://localhost:${backendPort}` },
      reuseExistingServer: false,
    },
  ],
})
