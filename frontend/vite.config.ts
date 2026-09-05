import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(__dirname),
  server: {
    proxy: {
      '/api': {
        // "backend" is a docker-compose service name; there's no
        // docker-compose.yml in this repo yet, so default to the host the
        // README's local-dev instructions actually use. Override with
        // VITE_DEV_PROXY_TARGET if you do run this behind a compose service.
        //
        // No rewrite: backend routers are registered with prefix="/api"
        // (see backend/app/main.py), same as nginx.conf's proxy_pass, which
        // forwards /api/* unchanged. The old rewrite stripped /api here,
        // which the backend never expected — the dev proxy never worked.
        target: process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
