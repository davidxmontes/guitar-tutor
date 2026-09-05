import { useState } from 'react';
import { apiClient } from '../api/client';
import type { LibraryItem, SongSavedRange, SongSelection, SongStudyArtifact } from '../types/v2';

export function SongLearningMap({ song, selection, measureIndex, disabled, onSelect, onChange }: {
  song: SongStudyArtifact; selection: SongSelection | null; measureIndex: number; disabled: boolean;
  onSelect: (start: number, end: number) => void; onChange: (song: SongStudyArtifact) => void;
}) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exercises, setExercises] = useState<LibraryItem[]>([]);
  const saved = song.payload.saved_ranges ?? [];
  const derived = song.payload.enrichment?.ranges ?? [];
  const start = (selection?.type === 'range' ? selection.startMeasureIndex : selection?.type === 'beat' ? selection.measureIndex : measureIndex) + 1;
  const end = selection?.type === 'range' ? selection.endMeasureIndex + 1 : start;
  const button = 'min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 text-left text-xs hover:bg-[var(--bg-hover)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--accent-600)]';
  const rangeButton = (range: SongSavedRange, prefix: string) => <button type="button" className={button} disabled={disabled}
    onClick={() => onSelect(range.start_measure - 1, range.end_measure - 1)}>
    {prefix}: {range.label} · M{range.start_measure}–{range.end_measure}
  </button>;
  const refresh = async () => {
    setError(null);
    try { setExercises((await apiClient.listLibrary()).filter(item => item.kind === 'exercise' && item.provenance?.artifact_id === song.id)); }
    catch { setError('Could not load exercise markers. Try refreshing.'); }
  };
  const save = async (ranges: SongSavedRange[]) => {
    setBusy(true); setError(null);
    try { onChange(await apiClient.saveSongRanges(song.id, song.updated_at, ranges)); setLabel(''); }
    catch { setError('Could not save ranges. Reload if this song changed elsewhere; your input is still here.'); }
    finally { setBusy(false); }
  };
  return <details aria-label="Learning map" className="rounded-xl border border-[var(--border-primary)] bg-[var(--card-bg)] p-3 text-[var(--text-primary)]"
    onToggle={e => { if (e.currentTarget.open) void refresh(); }}>
    <summary className="min-h-11 cursor-pointer text-sm font-semibold">Learning map · selection M{start}–{end}</summary>
    <p className="mb-3 text-xs text-[var(--text-secondary)]">Raw measure order stays unchanged. AI suggestions are optional; tab section labels come from the source.</p>
    <div className="flex flex-wrap gap-2">
      {(song.payload.enrichment?.source_sections ?? []).map((range, i) => <div key={`source-${i}`}>{rangeButton(range, `${range.source} source`)}</div>)}
      {derived.map((range, i) => <article key={`derived-${i}`} data-testid="song-map-derived" className={`rounded-lg border p-2 text-xs ${range.confidence === 'low' ? 'border-dashed' : ''} border-[var(--border-primary)]`}>
        {rangeButton({ ...range, label: range.section ?? range.kind ?? 'Phrase' }, `AI ${range.kind ?? 'phrase'}`)}
        <p className="mt-1 text-[var(--text-secondary)]">AI · {range.confidence} confidence</p>
        {range.annotation && <p className="mt-1 max-w-sm">{range.annotation}</p>}
        {range.repeat_group && derived.some(other => other !== range && other.repeat_group === range.repeat_group) && <div className="mt-2 flex flex-wrap items-center gap-1">Related passage:
          {derived.filter(other => other !== range && other.repeat_group === range.repeat_group).map((other, n) => <button key={n} type="button" className={button} disabled={disabled} onClick={() => onSelect(other.start_measure - 1, other.end_measure - 1)}>M{other.start_measure}–{other.end_measure}</button>)}
        </div>}
      </article>)}
      {!derived.length && <p className="text-xs text-[var(--text-secondary)]">No AI regions yet. Raw navigation and saved ranges work without enhancement.</p>}
    </div>
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Saved ranges">
      {saved.map((range, i) => <div key={i} className="flex items-center gap-1">{rangeButton(range, 'Saved range')}
        <button type="button" className={button} disabled={busy || disabled} aria-label={`Remove saved range ${range.label}`} onClick={() => void save(saved.filter((_, index) => index !== i))}>Remove</button></div>)}
    </div>
    <form className="mt-3 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (label.trim() && !busy) void save([...saved, { label: label.trim(), start_measure: start, end_measure: end }]); }}>
      <input aria-label="Range name" placeholder="Name this passage" maxLength={120} required value={label} onChange={e => setLabel(e.target.value)} className="min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-input)] px-3 text-sm" />
      <button className={button} disabled={busy || disabled || saved.length >= 100 || !label.trim()}>Save selected range</button>
    </form>
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Exercise markers">
      {exercises.map(exercise => {
        const selection = exercise.provenance?.selection as SongSelection | null;
        if (selection?.type !== 'range' && selection?.type !== 'beat') return null;
        const first = selection.type === 'range' ? selection.startMeasureIndex : selection.measureIndex;
        const last = selection.type === 'range' ? selection.endMeasureIndex : first;
        if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first || last >= song.payload.tab_data.measures.length) return null;
        return <div key={exercise.id}>{rangeButton({ label: exercise.title, start_measure: first + 1, end_measure: last + 1 }, 'Exercise')}</div>;
      })}
      <button type="button" className={button} onClick={() => void refresh()}>Refresh exercise markers</button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
  </details>;
}
