import type { DiatonicChord } from '../../types';

interface DiatonicChordsRowProps {
  chords: DiatonicChord[];
  onChordClick?: (chord: DiatonicChord) => void;
  selectedChord?: DiatonicChord | null;
}

export function DiatonicChordsRow({ chords, onChordClick, selectedChord }: DiatonicChordsRowProps) {
  if (chords.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-5">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Diatonic Chords</span>
        <div className="flex gap-2">
          {chords.map((chord, index) => {
            const isSelected = selectedChord?.numeral === chord.numeral;
            return (
              <button
                key={index}
                onClick={() => onChordClick?.(chord)}
                className={`
                  flex flex-col items-center px-4 py-2 rounded-lg transition-all shadow-sm
                  hover:shadow-md hover:scale-105
                  ${isSelected 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200'
                  }
                `}
              >
                <span className={`text-xs ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
                  {chord.numeral}
                </span>
                <span className="font-bold text-sm">{chord.display}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
