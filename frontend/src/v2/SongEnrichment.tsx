import { useState } from 'react';
import { apiClient } from '../api/client';
import type { SongStudyArtifact } from '../types/v2';

export function SongEnrichmentPanel({
  songStudy,
  onChange,
  visibleStartMeasure,
  visibleEndMeasure,
}: {
  songStudy: SongStudyArtifact;
  onChange: (artifact: SongStudyArtifact) => void;
  visibleStartMeasure: number;
  visibleEndMeasure: number;
}) {
  const { chordpro, enrichment } = songStudy.payload;
  const [showChordPro, setShowChordPro] = useState(false);
  const [busy, setBusy] = useState<'enhance' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visibleRanges = enrichment?.ranges.filter(
    (range) => range.end_measure >= visibleStartMeasure && range.start_measure <= visibleEndMeasure,
  );

  const enhance = async () => {
    setBusy('enhance');
    setError(null);
    try {
      onChange(await apiClient.enhanceSongStudy(songStudy.id));
    } catch (err) {
      setError(String(err));
      apiClient.getSongStudy(songStudy.id).then(onChange).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    setError(null);
    try {
      onChange(await apiClient.removeSongStudyEnrichment(songStudy.id));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-2" aria-label="Song learning enhancement">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="song-study-enhance"
          disabled={busy !== null}
          onClick={enhance}
          className="px-3 py-2 rounded-lg border text-xs font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent-500)', borderColor: 'var(--accent-600)', color: 'white' }}
        >
          {busy === 'enhance' ? 'Enhancing…' : enrichment ? 'Regenerate enhancement' : 'Enhance for learning'}
        </button>
        {enrichment && (
          <button
            type="button"
            data-testid="song-study-remove-enrichment"
            disabled={busy !== null}
            onClick={remove}
            className="px-3 py-2 rounded-lg border text-xs font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          >
            {busy === 'remove' ? 'Removing…' : 'Remove enhancement'}
          </button>
        )}
        {chordpro && (
          <button
            type="button"
            data-testid="song-study-chordpro-toggle"
            aria-expanded={showChordPro}
            onClick={() => setShowChordPro((visible) => !visible)}
            className="px-3 py-2 rounded-lg border text-xs font-medium"
            style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          >
            {showChordPro ? 'Hide ChordPro source' : 'View ChordPro source'}
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}

      {showChordPro && chordpro && (
        <pre
          data-testid="song-study-chordpro-source"
          aria-label="Raw ChordPro source"
          className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border p-3 text-xs"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        >
          {chordpro}
        </pre>
      )}

      {visibleRanges?.map((range, index) => (
        <article
          key={`${range.start_measure}:${range.end_measure}:${index}`}
          data-testid="song-study-enrichment-range"
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        >
          <strong>{range.section ?? 'Learning range'} · measures {range.start_measure}–{range.end_measure}</strong>
          <span className="ml-2" style={{ color: 'var(--text-muted)' }}>AI alignment · {range.confidence} confidence</span>
          {range.lyrics.length > 0 && <p className="mt-1">Lyrics: {range.lyrics.join(' / ')}</p>}
          {range.broad_harmony.length > 0 && <p>Broad harmony: {range.broad_harmony.join(' → ')}</p>}
          {range.detailed_harmony.length > 0 && <p>Guitar detail: {range.detailed_harmony.join(' → ')}</p>}
        </article>
      ))}
    </section>
  );
}
