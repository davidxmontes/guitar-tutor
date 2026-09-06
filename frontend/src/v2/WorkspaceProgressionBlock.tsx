import type { Resolved, ResolvedProgression, TypedInspection, WorkspaceBlock } from '../types/conceptWorkspace';
import { adaptBlock } from './workspaceAdapter';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
const control = 'min-h-11 max-w-full rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] px-3 py-2 disabled:opacity-50';

// `progression` stays self-contained: it renders its own resolved `steps` (spec #88 §4).
export function WorkspaceProgressionBlock({ block, resolved, inspection, onInspect, readOnly, disabled }: {
  block: WorkspaceBlock; resolved: Resolved; inspection: TypedInspection | null; onInspect: (i: TypedInspection) => void;
  readOnly: boolean; disabled: boolean;
}) {
  const progression = adaptBlock(block, resolved).sources.find(source => source.kind === 'progression') as ResolvedProgression | undefined;
  if (progression?.kind !== 'progression') return null;
  const index = inspection?.kind === 'step' && inspection.block_id === block.id ? inspection.index : 0;
  return <div className="space-y-3">
    <p>{progression.derived ? 'Follows the key · your first edit creates concrete music' : 'Concrete music · key changes only reanalyze'}</p>
    <ol aria-label="Progression chords" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{progression.steps.map((step, i) => <li key={i} className="min-w-0 space-y-2 rounded-lg border border-[var(--border-primary)] p-3">
      <button className={`${control} w-full text-left aria-pressed:ring-2 aria-pressed:ring-[var(--accent-700)]`} disabled={readOnly || disabled} aria-label={`Select chord ${i + 1}: ${step.root} ${step.quality}`} aria-pressed={index === i} onClick={() => onInspect({ kind: 'step', block_id: block.id, index: i })}>
        <small>{i + 1} · {block.settings.labels === 'intervals' ? step.function : step.quality}</small><strong className="block">{step.root}{step.quality === 'minor' ? 'm' : step.quality === 'major' ? '' : ` ${step.quality}`}</strong>
      </button>
      {step.positions.length ? <PhysicalChordDiagram positions={step.positions} tuning={step.tuning} label={`${step.root} ${step.quality}`} /> : <p>Add a voicing to hear this chord.</p>}
      <p className="text-sm">{step.function}</p>
    </li>)}</ol>
    {!readOnly && <p className="text-sm text-[var(--text-secondary)]">Select a chord to edit its root, quality or frets in the Music bar.</p>}
  </div>;
}
