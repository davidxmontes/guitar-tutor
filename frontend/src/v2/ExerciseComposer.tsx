import { useState } from 'react';
import { apiClient } from '../api/client';
import type { ExerciseDraft, ExerciseStep } from '../types/v2';

export function ExerciseComposer({ sourceId, revision, selection = null, steps, suggestion }: {
  sourceId: string; revision: string; selection?: Record<string, unknown> | null; steps: ExerciseStep[]; suggestion?: ExerciseDraft;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(suggestion?.title ?? '');
  const [intent, setIntent] = useState(suggestion?.intent ?? '');
  const [tempo, setTempo] = useState(suggestion?.tempo ?? 80);
  const [order, setOrder] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const button = 'min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 text-sm font-medium hover:bg-[var(--bg-hover)] disabled:opacity-50';
  const field = 'min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-input)] p-2 text-sm text-[var(--text-primary)]';
  if (!open) return <div><button className={button} type="button" disabled={!steps.length || steps.length > 256} onClick={() => { setOpen(true); setOrder(steps.map((_, i) => i + 1).join(',')); }}>{suggestion ? `Review exercise: ${suggestion.title}` : 'Create exercise'}</button>{!steps.length && <p className="text-xs text-[var(--text-secondary)]">Choose material with physical notes, tuning and rhythm to make a drill.</p>}{steps.length > 256 && <p className="text-xs text-[var(--text-secondary)]">Choose a shorter passage (up to 256 steps).</p>}</div>;
  return <form aria-label="Create exercise" className="space-y-3 rounded-xl border border-[var(--border-primary)] bg-[var(--card-bg)] p-4 text-[var(--text-primary)]" onSubmit={async e => {
    e.preventDefault();
    if (saving || saved) return;
    setError(null);
    const indices = order.split(',').map(n => Number(n.trim()) - 1);
    if (!indices.length || indices.length > 256 || indices.some(i => !Number.isInteger(i) || i < 0 || i >= steps.length)) { setError('Use the step numbers below, separated by commas (up to 256 steps).'); return; }
    setSaving(true);
    try {
      await apiClient.saveExercise({ title: title.trim(), intent: intent.trim(), tempo, steps: indices.map(i => steps[i]), source_artifact_id: sourceId, expected_updated_at: revision, source_selection: selection });
      setSaved(true);
    } catch { setError('Could not save. If the source changed, close this form and review the current material.'); }
    finally { setSaving(false); }
  }}>
    <h3 className="font-bold">Make a deliberate drill</h3>
    <p className="text-xs text-[var(--text-secondary)]">Name the goal, then repeat or reorder steps. Saving copies this music; the source stays unchanged.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">Exercise title<input aria-label="Exercise title" className={field} required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm">Practice goal<input aria-label="Practice goal" className={field} required maxLength={500} value={intent} onChange={e => setIntent(e.target.value)} /></label>
    </div>
    <ol className="max-h-40 overflow-auto text-xs space-y-1">{steps.map((step, i) => <li key={i}>{i + 1}. {step.label} · {step.beats} beats{step.positions.length ? ` · ${step.positions.map(p => `string ${p.string} fret ${p.fret}`).join(', ')}` : ' · rest'}</li>)}</ol>
    <label className="flex flex-col gap-1 text-sm">Step order<input aria-label="Step order" className={field} value={order} onChange={e => setOrder(e.target.value)} required /></label>
    <label className="flex items-center gap-2 text-sm">Starting tempo<input aria-label="Exercise tempo" className={`${field} w-20`} type="number" min={30} max={240} value={tempo} onChange={e => setTempo(Number(e.target.value))} /> BPM</label>
    {error && <p role="alert" className="text-sm">{error}</p>}
    {saved ? <p role="status" className="text-sm">Exercise saved. Open it from Saved exercises on Home.</p> : <button className={button} disabled={saving || !title.trim() || !intent.trim()}>{saving ? 'Saving…' : 'Save exercise'}</button>}
    <button className={`${button} ml-2`} type="button" onClick={() => { setOpen(false); setSaved(false); }}>Close</button>
  </form>;
}
