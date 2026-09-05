import { useAuth as useClerkAuth } from '@clerk/clerk-react';

// Opt-in local/test bypass — skips Clerk entirely so the app renders and
// authenticated API calls work without real Clerk credentials configured.
// Decided once at module load, not per-render, so the hook reference below
// never changes across renders.
export const AUTH_DEV_BYPASS = import.meta.env.VITE_AUTH_DEV_BYPASS === 'true';

const bypassAuth = { isLoaded: true, isSignedIn: true, getToken: async () => null };
function useBypassAuth() {
  return bypassAuth;
}

export const useAppAuth = AUTH_DEV_BYPASS ? useBypassAuth : useClerkAuth;
