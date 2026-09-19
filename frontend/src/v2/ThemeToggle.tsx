import { useThemeStore } from '../stores/useThemeStore';

export function ThemeToggle() {
  const dark = useThemeStore(state => state.darkMode);
  const toggle = useThemeStore(state => state.toggleDarkMode);
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" />}
    </svg><span className="sidebar-label">{dark ? 'Light mode' : 'Dark mode'}</span>
  </button>;
}
