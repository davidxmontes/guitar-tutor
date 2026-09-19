import './PhysicalChordDiagram.css';
import type { ReactNode } from 'react';
import { midiToNoteName } from '../utils/tuning';

export interface PhysicalChordPosition {
  string: number;
  fret: number;
}

interface PhysicalChordDiagramProps {
  positions: readonly PhysicalChordPosition[];
  // Arrays are string 1 through 6 (high to low), matching V2 physical data.
  tuning: string | readonly (string | number)[];
  label?: string;
  onSelect?: () => void;
  selected?: boolean;
  disabled?: boolean;
  onPreview?: (active: boolean) => void;
}

const STRINGS = [6, 5, 4, 3, 2, 1] as const;
const STRING_SPACING = 16;
const FRET_SPACING = 18;
const MIN_VISIBLE_FRETS = 4;
const DOT_RADIUS = 6;
const DIAGRAM_WIDTH = STRING_SPACING * (STRINGS.length - 1) + 2;

function tuningLabel(tuning: PhysicalChordDiagramProps['tuning']): string {
  return typeof tuning === 'string' ? tuning : [...tuning].reverse().map(note => typeof note === 'number' ? midiToNoteName(note) : note).join(' ');
}

export function PhysicalChordDiagram({ positions, tuning, label, onSelect, selected, disabled, onPreview }: PhysicalChordDiagramProps) {
  const fretted = positions.filter(({ fret }) => fret > 0).map(({ fret }) => fret);
  const hasOpenStrings = positions.some(({ fret }) => fret === 0);
  const startFret = hasOpenStrings || fretted.length === 0 ? 1 : Math.min(...fretted);
  const endFret = fretted.length === 0 ? startFret : Math.max(...fretted);
  const visibleFrets = Math.max(MIN_VISIBLE_FRETS, endFret - startFret + 1);
  const diagramHeight = FRET_SPACING * visibleFrets + 2;
  const positionsByString = new Map(positions.map((position) => [position.string, position]));
  const getStringX = (string: number) => 1 + (6 - string) * STRING_SPACING;
  const getFretY = (fret: number) => 1 + (fret - startFret) * FRET_SPACING + FRET_SPACING / 2;
  const description = [
    `${label ? `${label} chord` : 'Chord'} diagram.`,
    `Tuning ${tuningLabel(tuning)}.`,
    positions.map(({ string, fret }) => `String ${string} fret ${fret}`).join('; ') + '.',
  ].filter(Boolean).join(' ');

  const markers: ReactNode[] = STRINGS.map((string) => {
    const position = positionsByString.get(string);
    const marker = !position ? '×' : position.fret === 0 ? '○' : '';
    return marker ? (
      <g key={string}><text x={getStringX(string)} y="9" textAnchor="middle" fontSize="10" fontWeight="700">
        {marker}
      </text></g>
    ) : null;
  });

  const diagram = (
    <svg
      role="img"
      aria-label={description}
      viewBox={`-14 -2 ${DIAGRAM_WIDTH + 30} ${diagramHeight + 28}`}
      className="block h-auto w-28 max-w-full overflow-visible"
    >
      <g fill="var(--text-secondary)">{markers}</g>
      <text x="-4" y={getFretY(startFret) + 12} textAnchor="end" dominantBaseline="middle" fontSize="8" fill="var(--text-muted)">
        {startFret}
      </text>
      <rect x="0" y="12" width={DIAGRAM_WIDTH} height={diagramHeight} fill="var(--bg-tertiary)" stroke="var(--border-secondary)" />
      {startFret === 1 && <rect x="0" y="12" width={DIAGRAM_WIDTH} height="3" fill="var(--text-primary)" />}
      {Array.from({ length: visibleFrets - 1 }, (_, index) => (
        <line key={`fret-${index}`} x1="0" x2={DIAGRAM_WIDTH} y1={(index + 1) * FRET_SPACING + 13} y2={(index + 1) * FRET_SPACING + 13} stroke="var(--border-secondary)" />
      ))}
      {STRINGS.map((string) => (
        <line key={string} x1={getStringX(string)} x2={getStringX(string)} y1="13" y2={diagramHeight + 11} stroke="var(--border-secondary)" />
      ))}
      {positions.filter(({ fret }) => fret > 0).map((position) => {
        const x = getStringX(position.string);
        const y = getFretY(position.fret) + 12;
        return (
          <g key={`${position.string}-${position.fret}`}>
            <circle cx={x} cy={y} r={DOT_RADIUS} fill="var(--accent-500)" />
          </g>
        );
      })}
      {Array.isArray(tuning) && STRINGS.map((string) => (
        <text key={`tuning-${string}`} x={getStringX(string)} y={diagramHeight + 23} textAnchor="middle" fontSize="8" fill="var(--text-muted)">
          {typeof tuning[string - 1] === 'number' ? midiToNoteName(tuning[string - 1] as number) : tuning[string - 1]}
        </text>
      ))}
    </svg>
  );
  return onSelect ? <button type="button" className="diagram-select" aria-label={`Select ${label ?? 'chord shape'}`} aria-pressed={!!selected} disabled={disabled}
    onClick={onSelect} onMouseEnter={() => onPreview?.(true)} onMouseLeave={() => onPreview?.(false)} onFocus={() => onPreview?.(true)} onBlur={() => onPreview?.(false)}>{diagram}{selected && <span className="diagram-selected-mark" aria-hidden="true">✓</span>}</button> : diagram;
}
