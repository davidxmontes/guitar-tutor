import { useState } from 'react';
import { apiClient } from '../api/client';
import { hearVoicing } from './voicingAudio';
import type { ProgressionChord, ProgressionPayload } from '../types/v2';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';

function chordSymbol(chord: ProgressionChord): string {
  return `${chord.root}${chord.quality === 'major' ? '' : chord.quality}`;
}

// Deterministic audition -- Web Audio only (utils/audio.ts), no tutor/network
// call at all. Chords without a resolved voicing simply can't be heard, same
// as they can't be diagrammed.
function hearProgression(chords: ProgressionChord[]) {
  const playable = chords.filter((c) => c.voicing && c.voicing.length > 0);
  playable.forEach((chord, index) => {
    setTimeout(() => hearVoicing(chord), index * 1200);
  });
}

// --- Progression candidate card (ticket #14): the whole chord sequence
// visible at once (acceptance criterion — not one chord at a time), a
// deterministic Hear button, a Save button that persists a Progression
// artifact without navigating away, and an Explore button that is present
// but inert -- opening a real Branch to develop it further is ticket #15's
// scope, not this one's.
export function ProgressionCandidate({ candidate, onExplore }: {
  candidate: ProgressionPayload;
  onExplore?: (candidate: ProgressionPayload) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [exploring, setExploring] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.createProgression(candidate);
      setSaved(true);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleExplore = async () => {
    if (!onExplore) return;
    setExploring(true);
    setExploreError(null);
    try {
      await onExplore(candidate);
    } catch (err) {
      setExploreError(String(err));
      setExploring(false);
    }
  };

  return (
    <div
      data-testid="progression-candidate"
      className="flex flex-col gap-2 rounded-lg border p-2.5"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
    >
      <h4 data-testid="progression-candidate-title" className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
        {candidate.title}
      </h4>

      <div className="flex gap-2 overflow-x-auto">
        {candidate.chords.map((chord, i) => (
          <div key={i} data-testid="progression-candidate-chord" className="flex flex-col items-center gap-1 flex-shrink-0">
            <span className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>
              {chordSymbol(chord)}
            </span>
            {chord.voicing ? (
              <div
                data-testid="progression-chord-diagram"
                className="rounded border p-1"
                style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
              >
                <PhysicalChordDiagram
                  positions={chord.voicing}
                  tuning={chord.tuning ?? 'unknown'}
                  label={chordSymbol(chord)}
                  barre={chord.barre}
                  fingering={chord.fingering}
                />
              </div>
            ) : (
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                No diagram
              </span>
            )}
          </div>
        ))}
      </div>

      {saveError && (
        <p role="alert" data-testid="progression-candidate-save-error" className="text-[10px]" style={{ color: '#ef4444' }}>
          {saveError}
        </p>
      )}
      {saved && (
        <p data-testid="progression-candidate-save-success" className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
          Saved.
        </p>
      )}
      {exploreError && <p role="alert" className="text-[10px]" style={{ color: '#ef4444' }}>{exploreError}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="progression-candidate-hear"
          onClick={() => hearProgression(candidate.chords)}
          className="px-2.5 py-1 rounded-md border text-[10px] font-medium hover:bg-[var(--bg-hover)]"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        >
          Hear
        </button>
        <button
          type="button"
          data-testid="progression-candidate-save"
          disabled={saving}
          onClick={handleSave}
          className="px-2.5 py-1 rounded-md text-[10px] font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent-500)', color: 'white' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          data-testid="progression-candidate-explore"
          disabled={!onExplore || exploring}
          onClick={handleExplore}
          className="px-2.5 py-1 rounded-md border text-[10px] font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        >
          {exploring ? 'Opening...' : 'Explore'}
        </button>
      </div>
    </div>
  );
}
