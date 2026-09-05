import type { PracticeState } from './usePractice';

export function PracticeControls({ practice: p, available, label }: { practice: PracticeState; available: boolean; label: string }) {
  const button = 'min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50';
  if (!p.active) return <button type="button" className={button} disabled={!available} onClick={p.enter}>Practice {label}</button>;
  return <section aria-label="Practice controls" className="space-y-3 rounded-lg border p-3" style={{ background: 'var(--card-bg)', borderColor: 'var(--accent-500)' }}>
    <div className="flex flex-wrap items-center gap-3">
      <strong>Practice · {label}</strong>
      <span data-testid="practice-status" role="status">{p.running ? p.position.count ? `Count in ${p.position.count}` : 'Playing' : p.position.finished ? 'Finished' : 'Paused'}</span>
      <span className="text-xs">Metronome only · no guide audio</span>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={button} onClick={p.running ? p.pause : p.start}>{p.running ? 'Pause' : 'Start'}</button>
      <button type="button" className={button} onClick={p.reset}>Restart</button>
      <label className="text-sm">Tempo <input aria-label="Practice tempo" className="min-h-11 w-20 rounded border px-2" type="number" min="30" max="240" value={p.tempo} onChange={e => p.setTempo(Number(e.target.value))} /> BPM</label>
      <label className="text-sm">Count in <select aria-label="Count in" className="min-h-11 rounded border px-2" disabled={p.running} value={p.countIn} onChange={e => p.setCountIn(Number(e.target.value))}><option value="0">None</option><option value="4">4 beats</option></select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={p.loop} onChange={e => p.setLoop(e.target.checked)} />Loop</label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={p.metronome} onChange={e => p.setMetronome(e.target.checked)} />Metronome</label>
      <button type="button" className={button} aria-pressed={p.focused} onClick={() => p.setFocused(!p.focused)}>{p.focused ? 'Exit Focus' : 'Focus practice'}</button>
      <button type="button" className={button} onClick={p.exit}>Exit Practice</button>
    </div>
    {p.audioError && <p role="alert">Metronome audio is unavailable. Visual timing continues.</p>}
  </section>;
}
