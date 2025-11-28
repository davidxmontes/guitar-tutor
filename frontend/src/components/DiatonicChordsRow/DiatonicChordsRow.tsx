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
    <div className="flex items-center gap-2 p-4 bg-gray-800 rounded-lg">
      <span className="text-gray-400 text-sm mr-2">Diatonic Chords:</span>
      <div className="flex gap-2">
        {chords.map((chord, index) => {
          const isSelected = selectedChord?.numeral === chord.numeral;
          return (
            <button
              key={index}
              onClick={() => onChordClick?.(chord)}
              className={`
                flex flex-col items-center px-3 py-2 rounded transition-all
                ${isSelected 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                }
              `}
            >
              <span className="text-xs text-gray-400">{chord.numeral}</span>
              <span className="font-semibold">{chord.display}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
