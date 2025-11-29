import type { DiatonicChord } from '../../types';

interface DiatonicChordsRowProps {
  chords: DiatonicChord[];
  onChordClick?: (chord: DiatonicChord) => void;
  selectedChord?: DiatonicChord | null;
  darkMode?: boolean;
}

export function DiatonicChordsRow({ chords, onChordClick, selectedChord, darkMode: _darkMode = false }: DiatonicChordsRowProps) {
  if (chords.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 md:gap-3">
      <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wide whitespace-nowrap hidden sm:inline" style={{ color: 'var(--text-muted)' }}>Diatonic</span>
      <div className="flex gap-1">
        {chords.map((chord, index) => {
          const isSelected = selectedChord?.numeral === chord.numeral;
          return (
            <button
              key={index}
              onClick={() => onChordClick?.(chord)}
              className={`
                flex flex-col items-center px-2 py-1.5 md:py-1 rounded-md transition-all
                hover:scale-105 touch-target
                ${isSelected 
                  ? 'text-white shadow-sm' 
                  : ''
                }
              `}
              style={isSelected ? {
                backgroundColor: 'var(--accent-600)'
              } : {
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)'
              }}

            >
              <span 
                className="text-[9px] md:text-[10px] leading-tight"
                style={{ color: isSelected ? 'var(--accent-200)' : 'var(--text-muted)' }}
              >
                {chord.numeral}
              </span>
              <span className="font-bold text-[11px] md:text-xs">{chord.display}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
