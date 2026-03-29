import type { NotePosition, ScaleNotePosition, ChordVoicing } from '../../types';
import { NoteCell } from './NoteCell';

interface ChordPositionInfo {
  label: string;
  interval: string;
  isRoot: boolean;
}

// String thickness classes (from high E to low E)
const STRING_THICKNESS: Record<number, string> = {
  1: 'h-px',
  2: 'h-px',
  3: 'h-0.5',
  4: 'h-0.5',
  5: 'h-0.5',
  6: 'h-[3px]',
};

interface StringRowProps {
  stringNumber: number;
  stringName: string;
  notes: NotePosition[];
  scalePositions?: ScaleNotePosition[];
  chordVoicings?: ChordVoicing[];
  activeVoicings?: string[];
  displayMode?: 'notes' | 'intervals';
  onNoteClick?: (e: React.MouseEvent, note: string, string: number, fret: number) => void;
  clickableNotes?: Set<string>;
  darkMode?: boolean;
  hasChordOverlay?: boolean;
}

export function StringRow({
  stringNumber,
  stringName,
  notes,
  scalePositions = [],
  chordVoicings = [],
  activeVoicings = [],
  displayMode = 'notes',
  onNoteClick,
  clickableNotes,
  darkMode = false,
  hasChordOverlay = false,
}: StringRowProps) {
  const scaleMap = new Map<number, ScaleNotePosition>();
  scalePositions
    .filter(pos => pos.string === stringNumber)
    .forEach(pos => scaleMap.set(pos.fret, pos));

  const chordMap = new Map<number, ChordPositionInfo>();
  chordVoicings
    .filter(voicing => activeVoicings.length === 0 || activeVoicings.includes(voicing.label))
    .forEach(voicing => {
      voicing.positions
        .filter(pos => pos.string === stringNumber)
        .forEach(pos => {
          if (!chordMap.has(pos.fret)) {
            chordMap.set(pos.fret, {
              label: voicing.label,
              interval: pos.interval,
              isRoot: pos.is_root,
            });
          }
        });
    });

  return (
    <div className="flex items-stretch">
      <div className="w-10 flex-shrink-0 flex items-center justify-center text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
        {stringName}
      </div>

      <div className="flex items-stretch relative">
        <div
          className={`absolute inset-x-0 ${STRING_THICKNESS[stringNumber]} z-0`}
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            backgroundColor: darkMode ? '#64748b' : '#9ca3af',
            boxShadow: '0 1px 1px rgba(0,0,0,0.1)'
          }}
        />

        {notes.map((notePos) => {
          const scalePos = scaleMap.get(notePos.fret);
          const chordPos = chordMap.get(notePos.fret);
          const isClickable = clickableNotes?.has(notePos.note) && !!scalePos;

          return (
            <NoteCell
              key={`${stringNumber}-${notePos.fret}`}
              note={notePos.note}
              string={stringNumber}
              fret={notePos.fret}
              isOpenString={notePos.fret === 0}
              isInScale={!!scalePos}
              isRoot={scalePos?.is_root ?? false}
              degreeLabel={chordPos?.interval ?? scalePos?.degree_label}
              displayMode={displayMode}
              voicingLabel={chordPos?.label}
              isChordRoot={chordPos?.isRoot ?? false}
              hasChordOverlay={hasChordOverlay}
              onClick={onNoteClick}
              isClickable={isClickable}
              darkMode={darkMode}
            />
          );
        })}
      </div>
    </div>
  );
}
