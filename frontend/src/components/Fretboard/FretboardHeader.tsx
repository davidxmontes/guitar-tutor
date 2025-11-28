// Fret markers at standard positions
const FRET_MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21];
const DOUBLE_MARKERS = [12]; // Double dot at 12th fret

interface FretboardHeaderProps {
  fretCount: number;
  darkMode?: boolean;
}

export function FretboardHeader({ fretCount, darkMode: _darkMode = false }: FretboardHeaderProps) {
  const frets = Array.from({ length: fretCount + 1 }, (_, i) => i);
  
  return (
    <div className="flex items-center mb-0">
      {/* Spacer for string labels */}
      <div className="w-10" />
      
      {/* Fret numbers */}
      <div className="flex">
        {frets.map((fret) => (
          <div
            key={fret}
            className="w-11 text-center text-xs font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            {fret === 0 ? '' : fret}
          </div>
        ))}
      </div>
    </div>
  );
}

interface FretMarkersRowProps {
  fretCount: number;
}

export function FretMarkersRow({ fretCount }: FretMarkersRowProps) {
  const frets = Array.from({ length: fretCount + 1 }, (_, i) => i);
  
  return (
    <div className="flex items-center mt-0">
      {/* Spacer for string labels */}
      <div className="w-10" />
      
      {/* Fret markers */}
      <div className="flex">
        {frets.map((fret) => {
          const hasMarker = FRET_MARKERS.includes(fret);
          const isDouble = DOUBLE_MARKERS.includes(fret);
          
          return (
            <div
              key={fret}
              className="w-11 h-4 flex items-center justify-center"
            >
              {hasMarker && (
                <div className={`flex ${isDouble ? 'gap-1' : ''}`}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }} />
                  {isDouble && (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
