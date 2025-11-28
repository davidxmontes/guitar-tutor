import type { NotePosition, ScaleNotePosition, CagedShape, CagedShapeName } from '../../types';
import { NoteCell } from './NoteCell';

// Type for chord position lookup
interface ChordPositionInfo {
  shape: CagedShapeName;
  interval: string;
  isRoot: boolean;
}

// String thickness classes (from high E to low E)
const STRING_THICKNESS: Record<number, string> = {
  1: 'h-px',      // High E - thinnest
  2: 'h-px',      // B
  3: 'h-0.5',     // G
  4: 'h-0.5',     // D
  5: 'h-0.5',     // A
  6: 'h-[3px]',   // Low E - thickest
};

interface StringRowProps {
  stringNumber: number;
  stringName: string;
  notes: NotePosition[];
  scalePositions?: ScaleNotePosition[];
  chordShapes?: CagedShape[];
  activeChordShapes?: CagedShapeName[];
  displayMode?: 'notes' | 'intervals';
  onNoteClick?: (e: React.MouseEvent, note: string, string: number, fret: number) => void;
  clickableNotes?: Set<string>;  // Set of note names that are clickable
}

export function StringRow({ 
  stringNumber, 
  stringName, 
  notes, 
  scalePositions = [],
  chordShapes = [],
  activeChordShapes = [],
  displayMode = 'notes',
  onNoteClick,
  clickableNotes,
}: StringRowProps) {
  // Create a lookup map for scale positions on this string
  const scaleMap = new Map<number, ScaleNotePosition>();
  scalePositions
    .filter(pos => pos.string === stringNumber)
    .forEach(pos => scaleMap.set(pos.fret, pos));

  // Create a lookup map for chord positions on this string
  // Only include positions from active shapes
  const chordMap = new Map<number, ChordPositionInfo>();
  chordShapes
    .filter(shape => activeChordShapes.length === 0 || activeChordShapes.includes(shape.shape))
    .forEach(shape => {
      shape.positions
        .filter(pos => pos.string === stringNumber)
        .forEach(pos => {
          // If multiple shapes share a position, first one wins
          if (!chordMap.has(pos.fret)) {
            chordMap.set(pos.fret, {
              shape: shape.shape,
              interval: pos.interval,
              isRoot: pos.is_root,
            });
          }
        });
    });

  return (
    <div className="flex items-center relative">
      {/* String label */}
      <div className="w-10 text-center text-xs font-bold text-gray-500">
        {stringName}
      </div>
      
      {/* String container with line */}
      <div className="flex relative">
        {/* String line running through all frets */}
        <div 
          className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 bg-gray-400 ${STRING_THICKNESS[stringNumber]} z-0`}
          style={{ boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}
        />
        
        {/* Notes */}
        {notes.map((notePos) => {
          const scalePos = scaleMap.get(notePos.fret);
          const chordPos = chordMap.get(notePos.fret);
          // Make any scale note clickable (not just roots)
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
              cagedShape={chordPos?.shape}
              isChordRoot={chordPos?.isRoot ?? false}
              onClick={onNoteClick}
              isClickable={isClickable}
            />
          );
        })}
      </div>
    </div>
  );
}
