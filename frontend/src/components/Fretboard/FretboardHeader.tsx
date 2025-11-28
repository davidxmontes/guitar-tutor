// Fret markers at standard positions
const FRET_MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21];
const DOUBLE_MARKERS = [12]; // Double dot at 12th fret

interface FretboardHeaderProps {
  fretCount: number;
}

export function FretboardHeader({ fretCount }: FretboardHeaderProps) {
  const frets = Array.from({ length: fretCount + 1 }, (_, i) => i);
  
  return (
    <div className="flex items-center mb-1">
      {/* Spacer for string labels */}
      <div className="w-8" />
      
      {/* Fret numbers */}
      <div className="flex">
        {frets.map((fret) => (
          <div
            key={fret}
            className="w-10 text-center text-xs text-gray-400"
          >
            {fret === 0 ? 'O' : fret}
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
    <div className="flex items-center mt-1">
      {/* Spacer for string labels */}
      <div className="w-8" />
      
      {/* Fret markers */}
      <div className="flex">
        {frets.map((fret) => {
          const hasMarker = FRET_MARKERS.includes(fret);
          const isDouble = DOUBLE_MARKERS.includes(fret);
          
          return (
            <div
              key={fret}
              className="w-10 flex items-center justify-center"
            >
              {hasMarker && (
                <div className="flex gap-0.5">
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                  {isDouble && (
                    <div className="w-2 h-2 rounded-full bg-gray-300" />
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
