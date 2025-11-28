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
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Diatonic</span>
      <div className="flex gap-1">
        {chords.map((chord, index) => {
          const isSelected = selectedChord?.numeral === chord.numeral;
          return (
            <button
              key={index}
              onClick={() => onChordClick?.(chord)}
              className={`
                flex flex-col items-center px-2 py-1 rounded-md transition-all
                hover:scale-105
                ${isSelected 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }
              `}
            >
              <span className={`text-[10px] leading-tight ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
                {chord.numeral}
              </span>
              <span className="font-bold text-xs">{chord.display}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
