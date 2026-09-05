import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import type { CagedShapeId, CagedStudyPayload, ConceptPosition, TutorFocus } from '../types/v2';

const ROLE_COLORS: Record<string, string> = {
  '1': '#dc2626',
  '3': '#2563eb',
  b3: '#2563eb',
  '5': '#15803d',
};

function positionKey(position: { string: number; fret: number }) {
  return `${position.string}-${position.fret}`;
}

function CagedNeck({ payload, tutorFocus, showIntervals }: {
  payload: CagedStudyPayload;
  tutorFocus: TutorFocus | null;
  showIntervals: boolean;
}) {
  const selected = payload.regions.find((region) => region.shape === payload.selected_region)!;
  const comparison = payload.regions.find((region) => region.shape === payload.comparison_region);
  const comparisonPositions = new Map(comparison?.positions.map((position) => [positionKey(position), position]));
  const selectedPositions = new Map(selected.positions.map((position) => [positionKey(position), position]));
  const start = Math.min(selected.fret_start, comparison?.fret_start ?? selected.fret_start);
  const end = Math.max(selected.fret_end, comparison?.fret_end ?? selected.fret_end);
  const frets = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <div data-testid="caged-neck" className="overflow-x-auto rounded-xl border p-3" style={{ background: '#171b20', borderColor: '#343b44', color: '#f8fafc' }}>
      <div className="flex flex-wrap justify-between gap-2 mb-3">
        <p className="text-xs font-semibold">{selected.label} · frets {selected.fret_start}–{selected.fret_end}</p>
        {comparison && <p className="text-xs" style={{ color: '#c4b5fd' }}>{comparison.label} remains visible for overlap</p>}
      </div>
      <div className="min-w-[330px]">
        {payload.tuning.map((openNote, index) => {
          const string = index + 1;
          return (
            <div key={string} className="grid h-11 items-center" style={{ gridTemplateColumns: `34px repeat(${frets.length}, minmax(50px, 1fr))` }}>
              <strong className="text-xs text-center">{openNote}</strong>
              {frets.map((fret) => {
                const key = `${string}-${fret}`;
                const primary = selectedPositions.get(key);
                const secondary = comparisonPositions.get(key);
                const position = primary ?? secondary;
                const shared = Boolean(primary && secondary);
                const tutor = tutorFocus?.notes.some((note) => note.string === string && note.fret === fret);
                return (
                  <div key={fret} className="relative flex h-full items-center justify-center border-l" style={{ borderColor: '#59626d' }}>
                    {position && (
                      <span
                        data-testid={shared ? 'caged-shared-position' : primary ? 'caged-selected-position' : 'caged-comparison-position'}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-black text-white"
                        style={{ background: primary ? ROLE_COLORS[position.interval] : 'transparent', border: secondary ? '2px solid #c4b5fd' : '1px solid #f8fafc' }}
                        title={`${position.note} · ${position.interval} · string ${string}, fret ${fret}`}
                      >
                        {showIntervals ? position.interval : position.note}
                      </span>
                    )}
                    {tutor && <span className="pointer-events-none absolute h-10 w-10 rounded-full border-2 border-amber-400" />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs" aria-label="Chord-tone legend">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: ROLE_COLORS['1'] }} />Root · 1</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: ROLE_COLORS[payload.quality === 'minor' ? 'b3' : '3'] }} />{payload.quality === 'minor' ? 'Minor third · b3' : 'Major third · 3'}</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: ROLE_COLORS['5'] }} />Fifth · 5</span>
        {comparison && <span style={{ color: '#c4b5fd' }}>Purple ring · {comparison.label}</span>}
      </div>
    </div>
  );
}

export function CagedStudy({ payload, tutorFocus, showIntervals, onRegion }: {
  payload: CagedStudyPayload;
  tutorFocus: TutorFocus | null;
  showIntervals: boolean;
  onRegion?: (shape: CagedShapeId) => void;
}) {
  const selected = payload.regions.find((region) => region.shape === payload.selected_region)!;
  const comparison = payload.regions.find((region) => region.shape === payload.comparison_region);

  return (
    <section data-testid="study-caged-visualization" className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="CAGED regions">
        {payload.regions.map((region) => (
          <div key={region.shape} data-testid="study-caged-region" className="shrink-0">
            <button
              type="button"
              data-testid={`study-caged-region-${region.shape}`}
              aria-pressed={region.shape === payload.selected_region}
              onClick={() => onRegion?.(region.shape)}
              className="min-h-11 min-w-24 rounded-full border px-3 py-2 text-left text-sm"
              style={{
                background: region.shape === payload.selected_region ? 'var(--accent-600)' : 'var(--card-bg)',
                borderColor: region.shape === payload.selected_region ? 'var(--accent-600)' : 'var(--border-primary)',
                color: region.shape === payload.selected_region ? 'white' : 'var(--text-primary)',
              }}
            >
              <strong className="block">{region.label}</strong>
              <small className="block opacity-80">Frets {region.fret_start}–{region.fret_end}</small>
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {payload.notes.map((note) => (
          <div key={note.interval} className="min-w-20 rounded-lg border px-3 py-2 text-center" style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}>
            <strong>{note.note}</strong>
            <small className="block" style={{ color: 'var(--text-secondary)' }}>{note.interval === '1' ? 'root' : note.interval === '5' ? 'fifth' : payload.quality === 'minor' ? 'minor third' : 'major third'} · {note.interval}</small>
          </div>
        ))}
      </div>

      <CagedNeck payload={payload} tutorFocus={tutorFocus} showIntervals={showIntervals} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div data-testid="caged-selected-diagram" className="rounded-xl border p-4" style={{ borderColor: 'var(--accent-600)', background: 'var(--accent-50)' }}>
          <h3 className="font-bold">Focused · {selected.label}</h3>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Exact movable chord positions</p>
          <PhysicalChordDiagram positions={selected.positions} tuning={payload.tuning} label={`${payload.root} ${payload.quality} ${selected.label}`} />
        </div>
        {comparison && (
          <div className="rounded-xl border p-4" style={{ borderColor: '#a78bfa', background: 'var(--card-bg)' }}>
            <h3 className="font-bold">Previous · {comparison.label}</h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Kept visible only to inspect the handoff</p>
            <PhysicalChordDiagram positions={comparison.positions} tuning={payload.tuning} label={`${payload.root} ${payload.quality} ${comparison.label}`} />
          </div>
        )}
      </div>

      {comparison && (
        <div data-testid="caged-overlap-summary" className="rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}>
          <h3 className="font-bold">Overlap with {comparison.label}</h3>
          {payload.overlap_positions.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {payload.overlap_positions.map((position: ConceptPosition) => (
                <li key={positionKey(position)} data-testid="caged-overlap-note" className="rounded-full border px-3 py-1 text-sm">
                  {position.note} · {position.interval} · string {position.string}, fret {position.fret}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>These regions connect without sharing a fretted string position in this compact chord view.</p>}
        </div>
      )}
    </section>
  );
}
