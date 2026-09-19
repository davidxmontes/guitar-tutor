import { StrictMode, Suspense, lazy, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import { AUTH_DEV_BYPASS } from './lib/authBypass'
import { useThemeStore } from './stores/useThemeStore'
import './v2/Theme.css'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!AUTH_DEV_BYPASS && !publishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY (or set VITE_AUTH_DEV_BYPASS=true for local dev)')
}

// Keep /v2 bookmarks working; Classic is an explicit fallback only.
const isClassic = /^\/classic(?:\/|$)/.test(window.location.pathname)
const RootApp = isClassic
  ? lazy(() => import('./App.tsx'))
  : lazy(() => import('./v2/V2App.tsx').then(({ V2App }) => ({ default: V2App })))
document.documentElement.dataset.app = isClassic ? 'classic' : 'v2'
document.documentElement.classList.toggle('dark', useThemeStore.getState().darkMode)

export function ThemedApp() {
  const dark = useThemeStore(state => state.darkMode);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  return <>
    <Suspense fallback={<p role="status">Opening Guitar Tutor…</p>}>
    {AUTH_DEV_BYPASS ? <RootApp /> : <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/" appearance={{ variables: {
      colorPrimary: dark ? '#82ba9d' : '#27644e',
      colorTextOnPrimaryBackground: dark ? '#10211b' : '#ffffff',
      colorBackground: dark ? '#1b2421' : '#ffffff',
      colorText: dark ? '#e5ece7' : '#22352c',
      colorTextSecondary: dark ? '#a9b9b0' : '#617368',
      colorInputBackground: dark ? '#222e28' : '#f6f8f5',
      colorInputText: dark ? '#e5ece7' : '#22352c',
      borderRadius: '0.625rem',
    } }}><RootApp /></ClerkProvider>}
    </Suspense>
    {isClassic && <footer className="px-4 py-4 text-sm text-[var(--text-secondary)] sm:px-6">
      <a className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-600)]" href={isClassic ? '/' : '/classic'}>
        {isClassic ? 'Return to Guitar Tutor' : 'Classic fallback'}
      </a>
    </footer>}
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><ThemedApp /></StrictMode>)
