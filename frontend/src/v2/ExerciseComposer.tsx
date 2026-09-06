import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import type { ExerciseArtifact, V2Branch } from '../types/v2';
import type { ProgressionIdea } from './progression';
import { playTimedChords } from '../utils/audio';

export function ExerciseComposer({ branch, idea }: { branch: V2Branch; idea: ProgressionIdea }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [intent, setIntent] = useState('');
  const [tempo, setTempo] = useState(80);
  const [order, setOrder] = useState('');
  const [saved, setSaved] = useState<ExerciseArtifact | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => { stop.current?.(); }, []);
  if (!open) return <button className="music-button" disabled={!idea.chords.length} onClick={() => { setOpen(true); setOrder(idea.chords.map((_, i) => i + 1).join(',')); }}>Create exercise</button>;
  return <form aria-label="Create exercise" className="mt-4" onSubmit={async event => {
    event.preventDefault(); setError('');
    const indices = order.split(',').map(value => Number(value.trim()) - 1);
    if (indices.some(index => !Number.isInteger(index) || !idea.chords[index])) { setError('Use existing step numbers, separated by commas.'); return; }
    setBusy(true);
    try { setSaved(await apiClient.composeIdeaExercise(branch, { title, intent, tempo, order: indices.map(index => idea.chords[index].id) })); }
    catch (err) { setError(String(err)); } finally { setBusy(false); }
  }}><h3>Make a deliberate drill</h3><p>Saving copies the idea’s notes, tuning and rhythm.</p>
    <div className="music-controls"><label style={{ display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>Exercise title <input style={{ width: '14rem', maxWidth: '100%' }} required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label><label style={{ display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>Practice goal <input style={{ width: '14rem', maxWidth: '100%' }} required maxLength={500} value={intent} onChange={event => setIntent(event.target.value)} /></label><label style={{ display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>Step order <input style={{ width: '14rem', maxWidth: '100%' }} value={order} onChange={event => setOrder(event.target.value)} /></label><label style={{ display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>Exercise tempo <input type="number" min="30" max="240" value={tempo} onChange={event => setTempo(Number(event.target.value))} /></label></div>
    <button className="music-button" disabled={busy || !!saved}>Save exercise</button><button type="button" className="music-button" onClick={() => { stop.current?.(); setOpen(false); setSaved(null); }}>Close</button>
    {saved && <div><p role="status">Exercise saved.</p><button type="button" className="music-button" onClick={() => { stop.current?.(); stop.current = playTimedChords(saved.payload.steps, saved.payload.tempo); }}>Play exercise</button><button type="button" className="music-button" onClick={() => stop.current?.()}>Stop exercise</button></div>}
    {error && <p role="alert">{error}</p>}
  </form>;
}
