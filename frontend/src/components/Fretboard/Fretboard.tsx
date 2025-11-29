import type { NotePosition, ScaleNotePosition, CagedShape, CagedShapeName } from '../../types';
import { FretboardHeader, FretMarkersRow } from './FretboardHeader';
import { StringRow } from './StringRow';
import { CAGED_COLORS } from '../../constants/colors';

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
  darkMode?: boolean;
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
  darkMode = false,
}: FretboardProps) {
  const hasScale = scalePositions.length > 0;
  const hasChords = chordShapes.length > 0;

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
              <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full ${CAGED_COLORS.C.bg}`} />
                <span className="text-[10px] md:text-xs" style={{ color: 'var(--text-muted)' }}>C</span>
              </div>
              <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full ${CAGED_COLORS.A.bg}`} />
                <span className="text-[10px] md:text-xs" style={{ color: 'var(--text-muted)' }}>A</span>
              </div>
              <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full ${CAGED_COLORS.G.bg}`} />
                <span className="text-[10px] md:text-xs" style={{ color: 'var(--text-muted)' }}>G</span>
              </div>
              <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full ${CAGED_COLORS.E.bg}`} />
                <span className="text-[10px] md:text-xs" style={{ color: 'var(--text-muted)' }}>E</span>
              </div>
              <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full ${CAGED_COLORS.D.bg}`} />
                <span className="text-[10px] md:text-xs" style={{ color: 'var(--text-muted)' }}>D</span>
              </div>
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
                stringName={STRING_NAMES[idx]}
                notes={stringNotes}
                scalePositions={scalePositions}
                chordShapes={chordShapes}
                activeChordShapes={activeChordShapes}
                displayMode={displayMode}
                onNoteClick={onScaleNoteClick}
                clickableNotes={clickableScaleNotes}
                darkMode={darkMode}
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
