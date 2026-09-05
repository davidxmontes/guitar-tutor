import { useState } from 'react';
import { apiClient } from '../api/client';
import { playChord } from '../utils/audio';
import type { ProgressionChord, ProgressionPayload } from '../types/v2';

// --- Compact chord diagram: fresh V2 component, per docs/agents/project.md's
// "V1 UI inspiration" note -- draws the dot-grid/fret-window look of
// frontend/src/components/ChordDiagram/ChordDiagram.tsx (that reads better
// than the general UX reference mock), written against this ticket's own
// data shape (ProgressionChord.voicing: {string, fret}[], no note/interval
// labels -- those aren't part of the backend's resolved payload) rather than
// importing/adapting V1's component or its ChordVoicing type.
//
// ponytail: hardcodes 6 strings (matches V1 and every curated chord_service
// voicing today, which are all standard 6-string guitar shapes) and skips
// barre detection -- add generalized string-count/barre rendering only if a
// non-6-string candidate voicing actually shows up (tuning-aware voicings
// are ticket #16, not this one).
const NUM_STRINGS = 6;
const STRING_SPACING = 16;
const FRET_SPACING = 18;
const VISIBLE_FRETS = 4;
const DOT_RADIUS = 6;
const DIAGRAM_WIDTH = STRING_SPACING * (NUM_STRINGS - 1) + 2;

function CompactChordDiagram({ voicing }: { voicing: { string: number; fret: number }[] }) {
  const frets = voicing.map((p) => p.fret);
  const minFret = Math.min(...frets);
  const hasOpenStrings = minFret === 0;
  const startFret = hasOpenStrings ? 0 : Math.max(1, minFret);
  const diagramHeight = FRET_SPACING * VISIBLE_FRETS + 2;

  const positionsByString = new Map(voicing.map((p) => [p.string, p]));
  const getStringX = (stringNum: number) => 1 + (6 - stringNum) * STRING_SPACING;
  const getFretY = (fret: number) => 1 + (fret - startFret) * FRET_SPACING + FRET_SPACING / 2;

  return (
    <div
      data-testid="progression-chord-diagram"
      className="rounded p-1 border"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
    >
      <div className="relative pt-3" style={{ width: DIAGRAM_WIDTH + 12 }}>
        {[6, 5, 4, 3, 2, 1].map((stringNum) => {
          const pos = positionsByString.get(stringNum);
          const label = !pos ? 'X' : pos.fret === 0 ? 'O' : '';
          return (
            label && (
              <span
                key={stringNum}
                className="absolute top-0 -translate-x-1/2 text-[9px] font-bold leading-none"
                style={{ left: getStringX(stringNum), color: 'var(--text-secondary)' }}
              >
                {label}
              </span>
            )
          );
        })}
        <svg width={DIAGRAM_WIDTH + 12} height={diagramHeight} className="overflow-visible">
          <text x="-10" y={FRET_SPACING / 2 + 1} fontSize="8" fill="var(--text-muted)" textAnchor="end" dominantBaseline="middle">
            {startFret}
          </text>
          <rect
            x={0}
            y={0}
            width={DIAGRAM_WIDTH}
            height={diagramHeight}
            className="fill-[var(--bg-tertiary)] stroke-[var(--border-secondary)]"
            strokeWidth={1}
          />
          {hasOpenStrings && <rect x={0} y={0} width={DIAGRAM_WIDTH} height={2} className="fill-[var(--text-primary)]" />}
          {Array.from({ length: VISIBLE_FRETS - 1 }).map((_, i) => (
            <line
              key={`fret-${i}`}
              x1={0}
              y1={(i + 1) * FRET_SPACING + 1}
              x2={DIAGRAM_WIDTH}
              y2={(i + 1) * FRET_SPACING + 1}
              className="stroke-[var(--border-secondary)]"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <line
              key={`string-${i}`}
              x1={getStringX(6 - i)}
              y1={1}
              x2={getStringX(6 - i)}
              y2={diagramHeight - 1}
              className="stroke-[var(--border-secondary)]"
              strokeWidth={1}
            />
          ))}
          {voicing
            .filter((pos) => pos.fret > 0 && pos.fret - startFret < VISIBLE_FRETS)
            .map((pos) => (
              <circle
                key={`pos-${pos.string}-${pos.fret}`}
                cx={getStringX(pos.string)}
                cy={getFretY(pos.fret)}
                r={DOT_RADIUS}
                fill="var(--accent-500)"
              />
            ))}
        </svg>
      </div>
    </div>
  );
}

function chordSymbol(chord: ProgressionChord): string {
  return `${chord.root}${chord.quality === 'major' ? '' : chord.quality}`;
}

// Deterministic audition -- Web Audio only (utils/audio.ts), no tutor/network
// call at all. Chords without a resolved voicing simply can't be heard, same
// as they can't be diagrammed.
function hearProgression(chords: ProgressionChord[]) {
  const playable = chords.filter((c) => c.voicing && c.voicing.length > 0);
  playable.forEach((chord, index) => {
    setTimeout(() => playChord(chord.voicing!.map((p) => ({ string: p.string, fret: p.fret }))), index * 1200);
  });
}

// --- Progression candidate card (ticket #14): the whole chord sequence
// visible at once (acceptance criterion — not one chord at a time), a
// deterministic Hear button, a Save button that persists a Progression
// artifact without navigating away, and an Explore button that is present
// but inert -- opening a real Branch to develop it further is ticket #15's
// scope, not this one's.
export function ProgressionCandidate({ candidate }: { candidate: ProgressionPayload }) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
              <CompactChordDiagram voicing={chord.voicing} />
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
          disabled
          title="Explore opens this in its own branch — coming soon"
          className="px-2.5 py-1 rounded-md border text-[10px] font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        >
          Explore
        </button>
      </div>
    </div>
  );
}
