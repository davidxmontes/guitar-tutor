import type { NotePosition, ScaleNotePosition, ChordVoicing, HighlightedNote } from '../../types';
import { FretboardHeader, FretMarkersRow } from './FretboardHeader';
import { StringRow } from './StringRow';
import { getVoicingColor } from '../../constants/colors';

// Derive string labels from tuning notes: string 1 (high) is lowercase, rest uppercase
function tuningToStringNames(tuningNotes: string[]): string[] {
  return tuningNotes.map((note, i) => (i === 0 ? note.toLowerCase() : note));
}

interface FretboardProps {
  strings: NotePosition[][];
  fretCount: number;
  tuningNotes: string[];
  scalePositions?: ScaleNotePosition[];
  chordVoicings?: ChordVoicing[];
  activeVoicings?: string[];
  displayMode?: 'notes' | 'intervals';
  onScaleNoteClick?: (e: React.MouseEvent, note: string, string: number, fret: number) => void;
  clickableScaleNotes?: Set<string>;
  highlightedNotes?: HighlightedNote[];
  darkMode?: boolean;
}

export function Fretboard({
  strings,
  fretCount,
  tuningNotes,
  scalePositions = [],
  chordVoicings = [],
  activeVoicings = [],
  displayMode = 'notes',
  onScaleNoteClick,
  clickableScaleNotes,
  highlightedNotes = [],
  darkMode = false,
}: FretboardProps) {
  const hasScale = scalePositions.length > 0;
  const hasChords = chordVoicings.length > 0;
  const visibleVoicings = (activeVoicings.length > 0
    ? chordVoicings.filter((v) => activeVoicings.includes(v.label))
    : chordVoicings
  ).slice(0, 6);

  return (
    <div
      className="rounded-xl p-3 md:p-6 border"
      style={{
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--border-primary)',
        boxShadow: 'var(--shadow-md)'
      }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm md:text-base" style={{ color: 'var(--text-primary)' }}>Interactive Fretboard</h2>
        </div>

        {/* Legend - scrollable on mobile */}
        <div className="flex items-center gap-2 md:gap-4 text-sm overflow-x-auto pb-1 -mb-1 pl-1 pt-1">
          {hasChords ? (
            <>
              <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                <div
                  className="w-3 h-3 md:w-4 md:h-4 rounded-full ring-2"
                  style={{ backgroundColor: darkMode ? '#f1f5f9' : '#111827', '--tw-ring-color': 'var(--accent-400)' } as React.CSSProperties}
                />
                <span className="text-[10px] md:text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Root</span>
              </div>
              {visibleVoicings.map((voicing) => {
                const color = getVoicingColor(voicing.label);
                return (
                  <div key={voicing.label} className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                    <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full ${color.bg}`} />
                    <span className="text-[10px] md:text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {voicing.label}
                    </span>
                  </div>
                );
              })}
              {hasScale && (
                <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                  <div
                    className="w-3 h-3 md:w-4 md:h-4 rounded-full"
                    style={{ backgroundColor: 'var(--accent-500)', opacity: 0.3 }}
                  />
                  <span className="text-[10px] md:text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Scale (Muted)</span>
                </div>
              )}
            </>
          ) : hasScale ? (
            <>
              <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                <div
                  className="w-3 h-3 md:w-4 md:h-4 rounded-full"
                  style={{ backgroundColor: darkMode ? '#f1f5f9' : '#111827' }}
                />
                <span className="text-[10px] md:text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Root</span>
              </div>
              <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-full" style={{ backgroundColor: 'var(--accent-500)' }} />
                <span className="text-[10px] md:text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Scale Note</span>
              </div>
              <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                <div
                  className="w-3 h-3 md:w-4 md:h-4 rounded-full border"
                  style={{
                    backgroundColor: darkMode ? '#475569' : '#e5e7eb',
                    borderColor: darkMode ? '#64748b' : '#d1d5db',
                    opacity: 0.6
                  }}
                />
                <span className="text-[10px] md:text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Other</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
              <div className="w-3 h-3 md:w-4 md:h-4 rounded-full border" style={{ backgroundColor: 'var(--bg-hover)', borderColor: 'var(--border-secondary)' }} />
              <span className="text-[10px] md:text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>All Notes</span>
            </div>
          )}
        </div>
      </div>

      {/* Fretboard Grid - horizontally scrollable */}
      <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
        <div className="min-w-[700px] md:min-w-[900px] lg:min-w-[1000px]">
          {/* Fret numbers */}
          <FretboardHeader fretCount={fretCount} darkMode={darkMode} />

          {/* Strings */}
          <div className="border-t border-b" style={{ borderColor: 'var(--border-primary)' }}>
            {strings.map((stringNotes, idx) => (
              <StringRow
                key={idx}
                stringNumber={idx + 1}
                stringName={tuningToStringNames(tuningNotes)[idx]}
                notes={stringNotes}
                scalePositions={scalePositions}
                chordVoicings={chordVoicings}
                activeVoicings={activeVoicings}
                displayMode={displayMode}
                onNoteClick={onScaleNoteClick}
                clickableNotes={clickableScaleNotes}
                highlightedNotes={highlightedNotes}
                darkMode={darkMode}
                hasChordOverlay={hasChords}
              />
            ))}
          </div>

          {/* Fret markers */}
          <FretMarkersRow fretCount={fretCount} />
        </div>
      </div>

      {/* Tuning info */}
      <div className="mt-3 md:mt-4 text-[10px] md:text-xs" style={{ color: 'var(--text-muted)' }}>
        Tuning: {tuningNotes.join(' • ')}
      </div>
    </div>
  );
}
