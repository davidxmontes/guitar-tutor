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
              `}
              style={{
                backgroundColor: isSelected ? 'var(--accent-600)' : 'var(--bg-tertiary)',
                color: isSelected ? 'white' : 'var(--text-secondary)',
                boxShadow: isSelected ? '0 2px 8px var(--accent-glow)' : 'none',
                border: isSelected ? '2px solid var(--accent-400)' : '2px solid transparent',
              }}
            >
              <span 
                className="text-[9px] md:text-[10px] leading-tight"
                style={{ color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' }}
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
