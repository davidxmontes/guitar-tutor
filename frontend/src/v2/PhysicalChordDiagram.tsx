import type { ReactNode } from 'react';

export interface PhysicalChordPosition {
  string: number;
  fret: number;
}

export interface ChordBarre {
  fret: number;
  fromString: number;
  toString: number;
}

export interface ChordFingering extends PhysicalChordPosition {
  finger: string | number;
  provenance: 'source' | 'suggested';
}

interface PhysicalChordDiagramProps {
  positions: readonly PhysicalChordPosition[];
  tuning: string | readonly (string | number)[];
  label?: string;
  barre?: ChordBarre | null;
  fingering?: readonly ChordFingering[];
}

const STRINGS = [6, 5, 4, 3, 2, 1] as const;
const STRING_SPACING = 16;
const FRET_SPACING = 18;
const MIN_VISIBLE_FRETS = 4;
const DOT_RADIUS = 6;
const DIAGRAM_WIDTH = STRING_SPACING * (STRINGS.length - 1) + 2;

function detectBarre(positions: readonly PhysicalChordPosition[]): ChordBarre | null {
  const fretted = positions.filter(({ fret }) => fret > 0);
  const groups = new Map<number, number[]>();
  for (const { fret, string } of fretted) groups.set(fret, [...(groups.get(fret) ?? []), string]);

  for (const fret of [...groups.keys()].sort((a, b) => a - b)) {
    const strings = groups.get(fret)!;
    if (strings.length >= 3 && Math.max(...strings) - Math.min(...strings) >= 2) {
      return { fret, fromString: Math.min(...strings), toString: Math.max(...strings) };
    }
  }
  return null;
}

function tuningLabel(tuning: PhysicalChordDiagramProps['tuning']): string {
  return typeof tuning === 'string' ? tuning : tuning.join(' ');
}

export function PhysicalChordDiagram({ positions, tuning, label, barre, fingering = [] }: PhysicalChordDiagramProps) {
  const fretted = positions.filter(({ fret }) => fret > 0).map(({ fret }) => fret);
  const hasOpenStrings = positions.some(({ fret }) => fret === 0);
  const startFret = hasOpenStrings || fretted.length === 0 ? 0 : Math.min(...fretted);
  const endFret = fretted.length === 0 ? startFret : Math.max(...fretted);
  const visibleFrets = Math.max(MIN_VISIBLE_FRETS, endFret - startFret + 1);
  const diagramHeight = FRET_SPACING * visibleFrets + 2;
  const positionsByString = new Map(positions.map((position) => [position.string, position]));
  const detectedBarre = barre === undefined ? detectBarre(positions) : barre;
  const getStringX = (string: number) => 1 + (6 - string) * STRING_SPACING;
  const getFretY = (fret: number) => 1 + (fret - startFret) * FRET_SPACING + FRET_SPACING / 2;
  const description = [
    `${label ? `${label} chord` : 'Chord'} diagram.`,
    `Tuning ${tuningLabel(tuning)}.`,
    positions.map(({ string, fret }) => `String ${string} fret ${fret}`).join('; ') + '.',
    detectedBarre
      ? `Barre at fret ${detectedBarre.fret} from string ${detectedBarre.fromString} to string ${detectedBarre.toString}.`
      : '',
  ].filter(Boolean).join(' ');

  const markers: ReactNode[] = STRINGS.map((string) => {
    const position = positionsByString.get(string);
    const marker = !position ? '×' : position.fret === 0 ? '○' : '';
    return marker ? (
      <text key={string} x={getStringX(string)} y="9" textAnchor="middle" fontSize="10" fontWeight="700">
        {marker}
      </text>
    ) : null;
  });

  return (
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
      {startFret === 0 && <rect x="0" y="12" width={DIAGRAM_WIDTH} height="3" fill="var(--text-primary)" />}
      {Array.from({ length: visibleFrets - 1 }, (_, index) => (
        <line key={`fret-${index}`} x1="0" x2={DIAGRAM_WIDTH} y1={(index + 1) * FRET_SPACING + 13} y2={(index + 1) * FRET_SPACING + 13} stroke="var(--border-secondary)" />
      ))}
      {STRINGS.map((string) => (
        <line key={string} x1={getStringX(string)} x2={getStringX(string)} y1="13" y2={diagramHeight + 11} stroke="var(--border-secondary)" />
      ))}
      {detectedBarre && (
        <rect
          data-testid="chord-diagram-barre"
          x={getStringX(detectedBarre.toString) - DOT_RADIUS}
          y={getFretY(detectedBarre.fret) + 6}
          width={getStringX(detectedBarre.fromString) - getStringX(detectedBarre.toString) + DOT_RADIUS * 2}
          height={DOT_RADIUS * 2}
          rx={DOT_RADIUS}
          fill="var(--accent-500)"
          opacity="0.45"
        />
      )}
      {positions.filter(({ fret }) => fret > 0).map((position) => {
        const finger = fingering.find((item) =>
          (item.provenance === 'source' || item.provenance === 'suggested')
          && item.string === position.string
          && item.fret === position.fret
        );
        const x = getStringX(position.string);
        const y = getFretY(position.fret) + 12;
        return (
          <g key={`${position.string}-${position.fret}`}>
            <circle cx={x} cy={y} r={DOT_RADIUS} fill="var(--accent-500)" />
            {finger && (
              <text
                data-testid="chord-diagram-finger"
                aria-label={`Finger ${finger.finger}, ${finger.provenance}`}
                x={x}
                y={y + 3}
                textAnchor="middle"
                fontSize="8"
                fontWeight="800"
                fill="white"
              >
                {finger.finger}
              </text>
            )}
          </g>
        );
      })}
      {Array.isArray(tuning) && STRINGS.map((string, index) => (
        <text key={`tuning-${string}`} x={getStringX(string)} y={diagramHeight + 23} textAnchor="middle" fontSize="8" fill="var(--text-muted)">
          {tuning[index]}
        </text>
      ))}
    </svg>
  );
}
