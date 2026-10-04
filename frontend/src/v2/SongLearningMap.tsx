import { useState } from 'react';
import { apiClient } from '../api/client';
import type { LibraryItem, SongSavedRange, SongSelection, SongStudyArtifact } from '../types/v2';
import { defaultPassageLabel } from './songStudyNavigation';

export function SongLearningMap({ song, selection, measureIndex, sectionLabel, disabled, rangeMode, rangeAnchor, onToggleRange, onSelect, onChange }: {
  song: SongStudyArtifact;
  selection: SongSelection | null;
  measureIndex: number;
  sectionLabel: string;
  disabled: boolean;
  rangeMode: boolean;
  rangeAnchor: number | null;
  onToggleRange: () => void;
  onSelect: (start: number, end: number) => void;
  onChange: (song: SongStudyArtifact) => void;
}) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exercises, setExercises] = useState<LibraryItem[]>([]);
  const saved = song.payload.saved_ranges ?? [];
  const derived = song.payload.enrichment?.ranges ?? [];
  const start = (selection?.type === 'range' ? selection.startMeasureIndex : selection?.type === 'beat' ? selection.measureIndex : measureIndex) + 1;
  const end = selection?.type === 'range' ? selection.endMeasureIndex + 1 : start;
  const suggestedLabel = defaultPassageLabel(sectionLabel, start, end);
  const kept = saved.some(range => range.start_measure === start && range.end_measure === end);

  const refreshExercises = async () => {
    setError(null);
    try { setExercises((await apiClient.listLibrary()).filter(item => item.kind === 'exercise' && item.provenance?.artifact_id === song.id)); }
    catch { setError('Could not load practice drills. Try again.'); }
  };
  const save = async (ranges: SongSavedRange[], clearLabel = false) => {
    setBusy(true); setError(null);
    try {
      onChange(await apiClient.saveSongRanges(song.id, song.updated_at, ranges));
      if (clearLabel) setLabel('');
    } catch {
      setError('Could not update kept passages. Reload if this song changed elsewhere; your selection is still here.');
    } finally { setBusy(false); }
  };
  const rangeLabel = (range: SongSavedRange) => {
    const measures = `M${range.start_measure}${range.end_measure > range.start_measure ? `–${range.end_measure}` : ''}`;
    return range.label.endsWith(measures) ? range.label : `${range.label} · ${measures}`;
  };
  const rangeButton = (range: SongSavedRange, prefix?: string) => <button type="button" className="music-button" disabled={disabled}
    onClick={() => onSelect(range.start_measure - 1, range.end_measure - 1)}>
    {prefix ? `${prefix}: ` : ''}{rangeLabel(range)}
  </button>;

  return <section className="song-kept-passages" aria-label="Kept passages">
    <div className="song-study-selection-actions">
      <span>{rangeMode ? rangeAnchor === null ? 'Choose the first measure' : 'Choose the last measure' : <>Selected: <strong data-testid="practice-selected-span">M{start}{end > start ? `–${end}` : ''}</strong></>}</span>
      <button type="button" className="music-button" data-testid="song-keep-passage"
        disabled={busy || disabled || kept || saved.length >= 100}
        onClick={() => void save([...saved, { label: suggestedLabel, start_measure: start, end_measure: end }])}>
        {kept ? 'Passage kept' : 'Keep passage'}
      </button>
      <button type="button" className="music-button" data-testid="song-select-range" aria-pressed={rangeMode}
        disabled={disabled} onClick={onToggleRange}>{rangeMode ? 'Cancel range' : 'Select range'}</button>
    </div>

    {saved.length > 0 && <details data-testid="song-kept-passages">
      <summary>Kept passages · {saved.length}</summary>
      <ul className="song-kept-list">
        {saved.map((range, index) => <li key={`${range.label}-${range.start_measure}-${range.end_measure}-${index}`}>
          <button type="button" className="music-button" data-testid="song-kept-passage" disabled={disabled}
            onClick={() => onSelect(range.start_measure - 1, range.end_measure - 1)}>
            Revisit {rangeLabel(range)}
          </button>
          <button type="button" className="music-button" data-testid="song-remove-kept-passage"
            disabled={busy || disabled} aria-label={`Remove kept passage ${rangeLabel(range)}`}
            onClick={() => void save(saved.filter((_, savedIndex) => savedIndex !== index))}>Remove</button>
        </li>)}
      </ul>
    </details>}

    <details className="song-study-secondary" onToggle={event => { if (event.currentTarget.open) void refreshExercises(); }}>
      <summary>Song map and practice tools</summary>
      <p>Section labels come from the source. Suggested regions do not change the tab.</p>
      <div className="song-study-map-ranges">
        {(song.payload.enrichment?.source_sections ?? []).map((range, index) => <div key={`source-${index}`}>{rangeButton(range, `${range.source} source`)}</div>)}
        {derived.map((range, index) => <article key={`derived-${index}`} data-testid="song-map-derived">
          {rangeButton({ ...range, label: range.section ?? range.kind ?? 'Phrase' }, `AI ${range.kind ?? 'phrase'}`)}
          <p>AI · {range.confidence} confidence{range.annotation ? ` · ${range.annotation}` : ''}</p>
        </article>)}
        {!derived.length && <p>No suggested regions yet. Measure navigation and kept passages work without them.</p>}
      </div>
      <form className="song-custom-passage" onSubmit={event => {
        event.preventDefault();
        if (label.trim() && !busy) void save([...saved, { label: label.trim(), start_measure: start, end_measure: end }], true);
      }}>
        <label>Custom passage name <input aria-label="Custom passage name" maxLength={120} value={label} onChange={event => setLabel(event.target.value)} /></label>
        <button className="music-button" disabled={busy || disabled || saved.length >= 100 || !label.trim()}>Keep with name</button>
      </form>
      {exercises.length > 0 && <div aria-label="Separate practice drills"><strong>Separate practice drills</strong>
        {exercises.map(exercise => {
          const exerciseSelection = exercise.provenance?.selection as SongSelection | null;
          if (exerciseSelection?.type !== 'range' && exerciseSelection?.type !== 'beat') return null;
          const first = exerciseSelection.type === 'range' ? exerciseSelection.startMeasureIndex : exerciseSelection.measureIndex;
          const last = exerciseSelection.type === 'range' ? exerciseSelection.endMeasureIndex : first;
          if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first || last >= song.payload.tab_data.measures.length) return null;
          return <div key={exercise.id}>{rangeButton({ label: exercise.title, start_measure: first + 1, end_measure: last + 1 })}</div>;
        })}
      </div>}
    </details>
    {error && <p role="alert">{error}</p>}
  </section>;
}
