import type { NotePosition, ScaleNotePosition, CagedShape, CagedShapeName } from '../../types';
import { FretboardHeader, FretMarkersRow } from './FretboardHeader';
import { StringRow } from './StringRow';

// String names from high to low (string 1 to string 6)
const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];

interface FretboardProps {
  strings: NotePosition[][];
  fretCount: number;
  tuningNotes: string[];
  scalePositions?: ScaleNotePosition[];
  chordShapes?: CagedShape[];
  activeChordShapes?: CagedShapeName[];
  displayMode?: 'notes' | 'intervals';
  onScaleNoteClick?: (e: React.MouseEvent, note: string, string: number, fret: number) => void;
  clickableScaleNotes?: Set<string>;
}

export function Fretboard({ 
  strings, 
  fretCount, 
  tuningNotes,
  scalePositions = [],
  chordShapes = [],
  activeChordShapes = [],
  displayMode = 'notes',
  onScaleNoteClick,
  clickableScaleNotes,
}: FretboardProps) {
  const hasScale = scalePositions.length > 0;
  const hasChords = chordShapes.length > 0;

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-800">Interactive Fretboard</h2>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-4 text-sm">
          {hasChords ? (
            <>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-gray-900" />
                <span className="text-gray-500">Root</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-orange-500" />
                <span className="text-gray-500">C</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-yellow-500" />
                <span className="text-gray-500">A</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-green-500" />
                <span className="text-gray-500">G</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-blue-500" />
                <span className="text-gray-500">E</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-purple-500" />
                <span className="text-gray-500">D</span>
              </div>
            </>
          ) : hasScale ? (
            <>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-gray-900" />
                <span className="text-gray-500">Root</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-blue-500" />
                <span className="text-gray-500">Scale Note</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-gray-200 opacity-40" />
                <span className="text-gray-500">Other</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-full bg-gray-200 border border-gray-300" />
              <span className="text-gray-500">All Notes</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Fretboard Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Fret numbers */}
          <FretboardHeader fretCount={fretCount} />
          
          {/* Strings */}
          <div>
            {strings.map((stringNotes, idx) => (
              <StringRow
                key={idx}
                stringNumber={idx + 1}
                stringName={STRING_NAMES[idx]}
                notes={stringNotes}
                scalePositions={scalePositions}
                chordShapes={chordShapes}
                activeChordShapes={activeChordShapes}
                displayMode={displayMode}
                onNoteClick={onScaleNoteClick}
                clickableNotes={clickableScaleNotes}
              />
            ))}
          </div>
          
          {/* Fret markers */}
          <FretMarkersRow fretCount={fretCount} />
        </div>
      </div>
      
      {/* Tuning info */}
      <div className="mt-4 text-sm text-gray-500">
        Tuning: {tuningNotes.join(' - ')}
      </div>
    </div>
  );
}
