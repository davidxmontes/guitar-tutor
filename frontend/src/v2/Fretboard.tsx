// The one SVG fretboard (spec #88 BLK-01/02/03, COMP-05, INSP-01, A11Y-01).
// Consumes the adapter output; `layers` is fretboard-internal (no shared layer array).
import { useMemo } from 'react';
import { adaptBlock, chordPitchClasses } from './workspaceAdapter';
import type {
  Resolved, ResolvedCagedRegion, ResolvedChord, SourceRole, TypedInspection,
  WorkspaceBlock, WorkspacePosition,
} from '../types/conceptWorkspace';
import type { TutorFocus } from '../types/v2';

const FW = 42; // px per fret column
const SH = 34; // px per string row
const OVERVIEW = { start: 0, end: 12 }; // ponytail: fixed tiled-overview window; scroll reaches 13-19
const MIN_WINDOW = 4; // ponytail: 5-fret minimum fit window (end - start)

type Layer = {
  id: string; label: string; sourceRole: SourceRole; shape?: string; chordId?: string | null;
  positions: WorkspacePosition[]; tuning: number[]; bounded: boolean;
};

// A noteGroup with literal (string,fret) refs is bounded; a pitch-class one tiles
// the whole neck like a scale. ponytail: fret span is the only signal we get back.
const isBoundedGroup = (positions: WorkspacePosition[]) =>
  positions.length > 0 && Math.max(...positions.map((p) => p.fret)) - Math.min(...positions.map((p) => p.fret)) <= 5;

function autoRange(layers: Layer[], settings: WorkspaceBlock['settings']): { start: number; end: number } {
  if (settings.fret_start != null && settings.fret_end != null) return { start: settings.fret_start, end: settings.fret_end };
  const bounded = layers.filter((layer) => layer.bounded).flatMap((layer) => layer.positions.map((p) => p.fret));
  if (!bounded.length) return OVERVIEW;
  let start = Math.max(0, Math.min(...bounded) - 1);
  let end = Math.min(19, Math.max(...bounded) + 1);
  if (end - start < MIN_WINDOW) end = Math.min(19, start + MIN_WINDOW);
  if (end - start < MIN_WINDOW) start = Math.max(0, end - MIN_WINDOW);
  return { start, end };
}

// Which pitch classes / positions does the current global Inspection light on this layer?
function lit(layer: Layer, inspection: TypedInspection | null): (p: WorkspacePosition) => boolean {
  if (!inspection) return () => false;
  if (inspection.kind === 'pitch') return (p) => p.pitch_class === inspection.pitch_class;
  if (inspection.kind === 'voicing' || ('entity_id' in inspection && inspection.kind === 'chord')) {
    const { entity_id } = inspection as { entity_id: string };
    return () => layer.id === entity_id || layer.chordId === entity_id;
  }
  if (inspection.kind === 'chord') {
    // Light every tone of the derived chord, not just its root (spec #88 INSP-01).
    const wanted = new Set(chordPitchClasses(inspection.root, inspection.quality));
    return (p) => wanted.has(p.pitch_class);
  }
  if (inspection.kind === 'region' || inspection.kind === 'region_note' || inspection.kind === 'region_pair') {
    const [a, b] = String(inspection.key).split(':');
    // A plain (shapeless) layer still coordinates with a region_note pointer by pitch class.
    if (!layer.shape) return inspection.kind === 'region_note' ? (p) => p.pitch_class === Number(b) : () => false;
    if (inspection.kind === 'region_pair') return () => layer.shape === a || layer.shape === b;
    if (inspection.kind === 'region_note') return (p) => layer.shape === a && p.pitch_class === Number(b);
    return () => layer.shape === a;
  }
  return () => false;
}

// CAGED pairs from region order, like the backend's zip(regions, regions[1:]).
const regionPairs = (regions: ResolvedCagedRegion[]) => regions.slice(1).map((r, i) => [regions[i], r] as const);

export function Fretboard({ block, resolved, inspection, onInspect, tutorFocus, readOnly = false, disabled = false, onMaterializeRegion }: {
  block: WorkspaceBlock; resolved: Resolved; inspection: TypedInspection | null;
  onInspect: (inspection: TypedInspection) => void; tutorFocus?: TutorFocus | null;
  readOnly?: boolean; disabled?: boolean; onMaterializeRegion?: (shape: string) => void;
}) {
  const adapted = useMemo(() => adaptBlock(block, resolved), [block, resolved]);
  const caged = block.settings.mode === 'caged';
  const primaryChord = adapted.sources.find((s): s is ResolvedChord => s.kind === 'chord' && Boolean(s.cagedRegions));
  const regions = (caged && primaryChord?.cagedRegions) || [];

  const mismatch = new Set(adapted.conflicts.tuningMismatch);
  const layers: Layer[] = caged
    ? regions.map((region) => ({ id: `${primaryChord!.id}:${region.shape}`, label: `${region.shape} shape`, sourceRole: 'primary', shape: region.shape, positions: region.positions, tuning: primaryChord!.tuning, bounded: true }))
    : adapted.sources.filter((entity) => !mismatch.has(entity.id)).map((entity) => ({
        id: entity.id, label: entity.label, sourceRole: adapted.sourceRoles[entity.id] ?? 'context',
        chordId: entity.kind === 'voicing' ? entity.chord_id : null,
        positions: entity.positions, tuning: entity.tuning,
        bounded: entity.kind === 'voicing' || (entity.kind === 'noteGroup' && isBoundedGroup(entity.positions)),
      }));

  const range = autoRange(layers, block.settings);
  const overview = !caged && layers.every((layer) => !layer.bounded) && block.settings.fret_start == null;
  const lastFret = overview ? 19 : range.end;
  const frets = Array.from({ length: lastFret - range.start + 1 }, (_, i) => range.start + i);
  const tuning = layers[0]?.tuning ?? resolved.entities[block.sources[0]]?.tuning ?? [64, 59, 55, 50, 45, 40];
  const width = 44 + frets.length * FW;
  const height = 24 + 6 * SH;
  const sharedOnly = block.settings.comparison === 'shared-only';
  const shared = new Set(adapted.comparison?.shared ?? []);
  const multi = layers.length > 1;
  const useNotes = multi || block.settings.labels !== 'intervals';

  const selectedPair = (() => {
    const key = inspection && String((inspection as { key?: string }).key ?? '');
    const pairs = regionPairs(regions);
    return pairs.find(([a, b]) => key === `${a.shape}:${b.shape}`)
      ?? pairs.find(([a]) => key?.startsWith(`${a.shape}:`))
      ?? pairs[pairs.length - 1];
  })();
  const pairShared = selectedPair
    ? selectedPair[0].positions.filter((p) => selectedPair[1].positions.some((q) => q.string === p.string && q.fret === p.fret))
    : [];

  const x = (fret: number) => 40 + (fret - range.start) * FW + FW / 2;
  const y = (string: number) => 20 + (string - 1) * SH + SH / 2;

  const role = (p: WorkspacePosition): string => {
    if (!adapted.comparison) return '';
    if (shared.has(p.pitch_class)) return 'shared';
    if (adapted.comparison.added?.includes(p.pitch_class)) return 'added';
    if (adapted.comparison.removed?.includes(p.pitch_class)) return 'removed';
    return 'changed';
  };
  const focus = (p: WorkspacePosition) => Boolean(tutorFocus?.notes.some((n) => n.string === p.string && n.fret === p.fret));

  // One focusable dot per (string, fret) — overlapping layers merge into one cell
  // so no group ever sits on top of another and steals its clicks.
  const litFns = new Map(layers.map((layer) => [layer.id, lit(layer, inspection)]));
  const cells = new Map<string, { string: number; fret: number; entries: { layer: Layer; p: WorkspacePosition }[] }>();
  for (const layer of layers) {
    for (const p of layer.positions) {
      if (p.fret < range.start || p.fret > lastFret) continue;
      const key = `${p.string}:${p.fret}`;
      const cell = cells.get(key) ?? { string: p.string, fret: p.fret, entries: [] };
      cell.entries.push({ layer, p });
      cells.set(key, cell);
    }
  }
  const cellList = [...cells.values()].filter((cell) => !sharedOnly || cell.entries.some((e) => shared.has(e.p.pitch_class)));

  return (
    <div className="space-y-3">
      {caged && regions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {regions.map((region) => {
            const key = inspection && String((inspection as { key?: string }).key ?? '');
            const active = key?.split(':')[0] === region.shape;
            return (
              <button key={region.shape} type="button" disabled={readOnly}
                className="min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] px-3 py-2 text-sm aria-pressed:ring-2 aria-pressed:ring-[var(--accent-700)]"
                aria-pressed={active} aria-label={`Inspect ${region.shape} shape`}
                onClick={() => onInspect({ kind: 'region', source_id: primaryChord!.id, key: region.shape })}>
                {region.shape} shape · frets {region.fret_start}–{region.fret_end}
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] p-2" tabIndex={0} aria-label="Guitar fretboard">
        <svg role="group" aria-label={`Fretboard, frets ${range.start} to ${lastFret}`} width={width} height={height} style={{ minWidth: overview ? 44 + 13 * FW : width }}>
          {frets.map((fret) => (
            <text key={fret} x={x(fret)} y={14} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">{fret === 0 ? 'Open' : fret}</text>
          ))}
          {tuning.map((_, index) => (
            <line key={index} x1={40} x2={width} y1={y(index + 1)} y2={y(index + 1)} stroke="var(--border-primary)" />
          ))}
          {frets.filter((fret) => fret > 0).map((fret) => (
            <line key={`f${fret}`} x1={x(fret) - FW / 2} x2={x(fret) - FW / 2} y1={20} y2={height - 4} stroke="var(--border-primary)" />
          ))}
          {cellList.map((cell) => {
            const primaryEntry = cell.entries[0];
            const isLit = cell.entries.some(({ layer, p }) => litFns.get(layer.id)!(p));
            const focused = cell.entries.some(({ p }) => focus(p));
            const anyShared = cell.entries.some(({ p }) => shared.has(p.pitch_class));
            const label = cell.entries.map(({ layer, p }) => {
              const relation = role(p);
              return `${layer.shape ? `${layer.shape} shape` : layer.label}: ${p.note}, degree ${p.degree}${relation ? `, ${relation}` : ''}`;
            }).join('; ') + `, string ${cell.string}, fret ${cell.fret}`;
            const bg = anyShared || primaryEntry.layer.sourceRole === 'highlight' ? 'var(--accent-100)'
              : primaryEntry.layer.sourceRole === 'context' ? 'var(--bg-secondary)' : 'var(--card-bg)';
            return (
              <g key={`${cell.string}:${cell.fret}`} role="button" tabIndex={readOnly ? -1 : 0}
                data-role={primaryEntry.layer.sourceRole} aria-label={label} aria-pressed={isLit}
                onClick={() => !readOnly && onInspect(primaryEntry.layer.shape
                  ? { kind: 'region_note', source_id: primaryChord!.id, key: `${primaryEntry.layer.shape}:${primaryEntry.p.pitch_class}` }
                  : { kind: 'pitch', pitch_class: primaryEntry.p.pitch_class })}
                onKeyDown={(event) => { if (!readOnly && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); (event.currentTarget as SVGGElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); } }}
                style={{ cursor: readOnly ? 'default' : 'pointer', outline: 'none' }}>
                <circle cx={x(cell.fret)} cy={y(cell.string)} r={13} fill={bg}
                  stroke={focused ? '#d97706' : isLit ? 'var(--accent-700)' : 'var(--text-secondary)'}
                  strokeWidth={focused ? 4 : isLit ? 3 : 1} />
                <text x={x(cell.fret)} y={y(cell.string) + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text-primary)" style={{ pointerEvents: 'none' }}>
                  {useNotes ? primaryEntry.p.note : primaryEntry.p.degree}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {caged && selectedPair && (
        <div className="space-y-1 text-sm">
          <button type="button" disabled={readOnly}
            className="min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] px-3 py-2"
            onClick={() => onInspect({ kind: 'region_pair', source_id: primaryChord!.id, key: `${selectedPair[0].shape}:${selectedPair[1].shape}` })}>
            Inspect adjacent regions · {selectedPair[0].shape} → {selectedPair[1].shape}
          </button>
          <p>Shared positions: {pairShared.length}. These stay on the same string and fret across both shapes.</p>
          {!readOnly && onMaterializeRegion && (
            <button type="button" disabled={disabled}
              className="min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] px-3 py-2"
              onClick={() => onMaterializeRegion(String((inspection as { key?: string })?.key ?? '').split(':')[0] || regions[0].shape)}>
              Keep selected voicing
            </button>
          )}
        </div>
      )}

      {adapted.conflicts.tuningMismatch.length > 0 && (
        <div className="rounded-lg border border-dashed border-[var(--border-primary)] p-2 text-sm" aria-label="Different tuning">
          <p className="font-semibold">Different tuning — shown separately</p>
          {adapted.conflicts.tuningMismatch.map((id) => {
            const entity = resolved.entities[id];
            if (!entity) return null;
            return (
              <p key={id}>{entity.label}: {entity.positions.map((p) => `${p.note} (string ${p.string}, fret ${p.fret})`).join(' · ')}</p>
            );
          })}
        </div>
      )}
    </div>
  );
}
