import { adaptBlock } from './workspaceAdapter';
import type { Resolved, TypedInspection, WorkspaceBlock, WorkspaceNote } from '../types/conceptWorkspace';

const cell = 'flex min-h-11 min-w-11 flex-col items-center justify-center rounded-md border px-2 py-1 leading-tight aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-[var(--accent-700)]';

// degree-strip (accepts: scale, chord, compare). One source -> its degrees; two
// same-kind sources (or a compare relation) -> the two stacked per degree with the
// differing pitch classes marked per `settings.comparison` (spec #88 BLK-05).
export function DegreeStripBlock({ block, resolved, inspection, onInspect, readOnly }: {
  block: WorkspaceBlock; resolved: Resolved; inspection: TypedInspection | null;
  onInspect: (i: TypedInspection) => void; readOnly?: boolean;
}) {
  const adapted = adaptBlock(block, resolved);
  const [a, b] = adapted.sources;
  if (!a) return null;
  const intervals = block.settings.labels === 'intervals';
  const pressed = (n: WorkspaceNote) => inspection?.kind === 'pitch' && inspection.pitch_class === n.pitch_class;
  const inspect = (n: WorkspaceNote) => onInspect({ kind: 'pitch', pitch_class: n.pitch_class });

  if (!b) return <div>
    <h4 className="mb-1.5 text-sm font-semibold">{a.label}</h4>
    <div className="flex flex-wrap gap-1.5">{a.notes.map(n => <button key={n.degree} type="button" disabled={readOnly}
      aria-label={`${a.label}: ${n.note}, degree ${n.degree}`} aria-pressed={pressed(n)} onClick={() => inspect(n)} className={cell}>
      <strong className="block text-sm">{intervals ? n.degree : n.note}</strong><small className="text-[10px]">{n.degree}</small>
    </button>)}</div>
  </div>;

  const shared = new Set(adapted.comparison?.shared ?? []);
  const sharedOnly = block.settings.comparison === 'shared-only';
  const mark = (n: WorkspaceNote) => !adapted.comparison ? '' : shared.has(n.pitch_class) ? 'shared' : 'changed';
  const rows = Array.from({ length: Math.max(a.notes.length, b.notes.length) }, (_, i) => [a.notes[i], b.notes[i]] as const);
  return <div className="space-y-1">
    <p className="text-sm font-semibold">{a.label} vs {b.label}</p>
    <div className="flex flex-wrap gap-1.5">{rows.filter(([x, y]) => !sharedOnly || (x && y && x.pitch_class === y.pitch_class)).map(([x, y], i) => <div key={i} className="flex flex-col gap-1">
      {([[x, a.label], [y, b.label]] as const).map(([n, label], side) => n
        ? <button key={side} type="button" disabled={readOnly}
            aria-label={`${label}: ${n.note}, degree ${n.degree}${mark(n) ? `, ${mark(n)}` : ''}`}
            aria-pressed={pressed(n)} onClick={() => inspect(n)} className={cell}
            style={mark(n) === 'changed' ? { borderColor: 'var(--accent-700)' } : mark(n) === 'shared' ? { background: 'var(--accent-100)' } : undefined}>
            <strong className="block text-sm">{intervals ? n.degree : n.note}</strong><small className="text-[10px]">{mark(n) || n.degree}</small>
          </button>
        : <span key={side} className={`${cell} opacity-30`}>—</span>)}
    </div>)}</div>
  </div>;
}
