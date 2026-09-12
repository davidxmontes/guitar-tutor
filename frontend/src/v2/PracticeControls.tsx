import type { PracticeState } from './usePractice';

export function PracticeControls({ practice: p, available, label, allowFocus = true, guideLabel = 'Synthesized guide · simplified articulation, not the original recording' }: { practice: PracticeState; available: boolean; label: string; allowFocus?: boolean; guideLabel?: string }) {
  const playIcon = <svg className="practice-play-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5 13 8 4 13.5Z" /></svg>;
  if (!p.active) return <button type="button" className="music-button learning-primary" disabled={!available} onClick={p.enter}>{playIcon}Practice {label}</button>;
  return <section aria-label="Practice controls" className="practice-controls">
    <div className="practice-heading">
      <strong>Practice · {label}</strong>
      <span data-testid="practice-status" role="status" className="practice-status">{p.running ? p.position.count ? `Count in ${p.position.count}` : 'Playing' : p.position.finished ? 'Finished' : 'Paused'}</span>
      <span>{p.guideAvailable ? guideLabel : 'Metronome only · no guide audio'}</span>
    </div>
    <div className="practice-transport">
      <button type="button" className="music-button learning-primary" onClick={p.running ? p.pause : p.start}>{p.running ? <svg className="practice-play-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h4v12H3zm6 0h4v12H9z" /></svg> : playIcon}{p.running ? 'Pause' : 'Start'}</button>
      <button type="button" className="music-button" onClick={p.reset}>Restart</button>
      <label className="practice-field">Tempo <span><input aria-label="Practice tempo" className="w-20" type="number" min="30" max="240" value={p.tempo} onChange={e => p.setTempo(Number(e.target.value))} /> BPM</span></label>
      <label className="practice-field">Count in <select aria-label="Count in" disabled={p.running} value={p.countIn} onChange={e => p.setCountIn(Number(e.target.value))}><option value="0">None</option><option value="4">4 beats</option></select></label>
      <label className="practice-toggle"><input type="checkbox" checked={p.loop} onChange={e => p.setLoop(e.target.checked)} />Loop</label>
      {p.guideAvailable ? <label className="practice-field">Audio <select aria-label="Practice audio" value={p.audioMode} onChange={e => p.setAudioMode(e.target.value)}><option value="metronome">Metronome only</option><option value="guide">Guide playback</option><option value="both">Both</option></select></label> : <label className="practice-toggle"><input type="checkbox" checked={p.metronome} onChange={e => p.setMetronome(e.target.checked)} />Metronome</label>}
      {allowFocus && <button type="button" className="music-button" aria-pressed={p.focused} onClick={() => p.setFocused(!p.focused)}>{p.focused ? 'Exit Focus' : 'Focus practice'}</button>}
      <button type="button" className="music-button" onClick={p.exit}>Exit Practice</button>
    </div>
    {p.audioError && <p role="alert">Practice audio is unavailable. Visual timing continues.</p>}
  </section>;
}
