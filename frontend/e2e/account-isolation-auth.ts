import { useSyncExternalStore } from 'react';

// Loaded only by this test's intercepted auth module, never by the app build.
export const AUTH_DEV_BYPASS = true;
let auth = makeAuth('account-a');
const listeners = new Set<() => void>();
function makeAuth(userId: string | null, isLoaded = true) {
  return { userId, isLoaded, isSignedIn: Boolean(userId), getToken: async () => userId };
}
window.addEventListener('test-account', event => {
  const { userId, isLoaded } = (event as CustomEvent).detail;
  auth = makeAuth(userId, isLoaded);
  listeners.forEach(listener => listener());
});
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useAppAuth() {
  return useSyncExternalStore(subscribe, () => auth);
}
