export function MusicIcon({ name }: { name: 'play' | 'pin' | 'back' }) {
  return <svg data-icon={name} aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === 'play' ? <path d="m6 3 15 9-15 9Z" fill="currentColor" stroke="none" /> : name === 'pin' ? <><path d="m9 3 6 0-1 6 4 4H6l4-4Z" /><path d="M12 13v8" /></> : <path d="m10 5-7 7 7 7M3 12h18" />}
  </svg>;
}
