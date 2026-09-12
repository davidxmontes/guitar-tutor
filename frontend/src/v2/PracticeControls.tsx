import type { PracticeState } from './usePractice';

export function PracticeControls({ practice: p, available, label, allowFocus = true, guideLabel = 'Synthesized guide · simplified articulation, not the original recording' }: { practice: PracticeState; available: boolean; label: string; allowFocus?: boolean; guideLabel?: string }) {
  const button = 'min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-600)]';
  const secondary = `${button} border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] enabled:hover:bg-[var(--bg-hover)]`;
  const primary = `${button} border-[var(--accent-700)] bg-[var(--accent-700)] text-white enabled:hover:bg-[var(--accent-800)]`;
  const field = 'min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-input)] px-2 text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent-600)]';
  if (!p.active) return <button type="button" className={primary} disabled={!available} onClick={p.enter}>Practice {label}</button>;
  return <section aria-label="Practice controls" className="space-y-3 rounded-xl border p-3 text-sm" style={{ background: 'var(--card-bg)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
    <div className="flex flex-wrap items-center gap-3">
      <strong>Practice · {label}</strong>
      <span data-testid="practice-status" role="status" className="rounded-full bg-[var(--bg-tertiary)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)]">{p.running ? p.position.count ? `Count in ${p.position.count}` : 'Playing' : p.position.finished ? 'Finished' : 'Paused'}</span>
      <span className="text-xs text-[var(--text-secondary)]">{p.guideAvailable ? guideLabel : 'Metronome only · no guide audio'}</span>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={primary} onClick={p.running ? p.pause : p.start}>{p.running ? 'Pause' : 'Start'}</button>
      <button type="button" className={secondary} onClick={p.reset}>Restart</button>
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)]">Tempo <input aria-label="Practice tempo" className={`${field} w-20`} type="number" min="30" max="240" value={p.tempo} onChange={e => p.setTempo(Number(e.target.value))} /> BPM</label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)]">Count in <select aria-label="Count in" className={field} disabled={p.running} value={p.countIn} onChange={e => p.setCountIn(Number(e.target.value))}><option value="0">None</option><option value="4">4 beats</option></select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input className="accent-[var(--accent-700)]" type="checkbox" checked={p.loop} onChange={e => p.setLoop(e.target.checked)} />Loop</label>
      {p.guideAvailable ? <label className="flex min-h-11 items-center gap-2 text-sm">Audio <select aria-label="Practice audio" className={field} value={p.audioMode} onChange={e => p.setAudioMode(e.target.value)}><option value="metronome">Metronome only</option><option value="guide">Guide playback</option><option value="both">Both</option></select></label> : <label className="flex min-h-11 items-center gap-2 text-sm"><input className="accent-[var(--accent-700)]" type="checkbox" checked={p.metronome} onChange={e => p.setMetronome(e.target.checked)} />Metronome</label>}
      {allowFocus && <button type="button" className={p.focused ? `${button} border-[var(--accent-700)] bg-[var(--accent-50)] text-[var(--accent-900)] hover:bg-[var(--accent-100)]` : secondary} aria-pressed={p.focused} onClick={() => p.setFocused(!p.focused)}>{p.focused ? 'Exit Focus' : 'Focus practice'}</button>}
      <button type="button" className={secondary} onClick={p.exit}>Exit Practice</button>
    </div>
    {p.audioError && <p role="alert">Practice audio is unavailable. Visual timing continues.</p>}
  </section>;
}
