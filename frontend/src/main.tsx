import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'
import { V2App } from './v2/V2App.tsx'
import { AUTH_DEV_BYPASS } from './lib/authBypass'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!AUTH_DEV_BYPASS && !publishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY (or set VITE_AUTH_DEV_BYPASS=true for local dev)')
}

// V2 is opened independently of Classic via /v2 — no router dependency
// needed for a single top-level split like this.
const RootApp = window.location.pathname.startsWith('/v2') ? V2App : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {AUTH_DEV_BYPASS ? (
      <RootApp />
    ) : (
      <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
        <RootApp />
      </ClerkProvider>
    )}
  </StrictMode>,
)
