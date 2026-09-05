import { defineConfig } from '@playwright/test'

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
    baseURL: 'http://localhost:15034',
  },
  webServer: [
    {
      command: '../backend/.venv/bin/uvicorn app.main:app --port 18034',
      cwd: '../backend',
      port: 18034,
      env: { AUTH_DEV_BYPASS: 'true', V2_STORAGE_BACKEND: 'memory' },
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --port 15034',
      port: 15034,
      env: { VITE_AUTH_DEV_BYPASS: 'true', VITE_DEV_PROXY_TARGET: 'http://localhost:18034' },
      reuseExistingServer: false,
    },
  ],
})
