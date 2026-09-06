import type { Inspection, ResolvedWorkspace, WorkspaceBlock } from '../types/conceptWorkspace';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
const control = 'min-h-11 max-w-full rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] px-3 py-2 disabled:opacity-50';

export function WorkspaceProgressionBlock({ block, resolved, inspection, onInspect, readOnly, disabled }: {
  block: WorkspaceBlock; resolved: ResolvedWorkspace; inspection: Inspection | null; onInspect: (i: Inspection) => void;
  readOnly: boolean; disabled: boolean;
}) {
  const progression = resolved.progressions[block.source_id];
  const index = inspection?.source_id === block.source_id && inspection.kind === 'step' && typeof inspection.key === 'number' ? inspection.key : 0;
  return <div className="space-y-3">
    <p>{progression.derived ? 'Follows the key · your first edit creates concrete music' : 'Concrete music · key changes only reanalyze'}</p>
    <ol aria-label="Progression chords" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{progression.steps.map((step, i) => <li key={i} className="min-w-0 space-y-2 rounded-lg border border-[var(--border-primary)] p-3">
      <button className={`${control} w-full text-left aria-pressed:ring-2 aria-pressed:ring-[var(--accent-700)]`} disabled={readOnly || disabled} aria-label={`Select chord ${i+1}: ${step.root} ${step.quality}`} aria-pressed={index === i} onClick={() => onInspect({ source_id:block.source_id, kind:'step', key:i })}>
        <small>{i+1} · {block.settings.labels === 'intervals' ? step.function : step.quality}</small><strong className="block">{step.root}{step.quality === 'minor' ? 'm' : step.quality === 'major' ? '' : ` ${step.quality}`}</strong>
      </button>
      {step.positions.length ? <PhysicalChordDiagram positions={step.positions} tuning={step.tuning} label={`${step.root} ${step.quality}`} /> : <p>Add a voicing to hear this chord.</p>}
      <p className="text-sm">{step.function}</p>
    </li>)}</ol>
    {!readOnly && <p className="text-sm text-[var(--text-secondary)]">Select a chord to edit its root, quality or frets in the Music bar.</p>}
  </div>;
}
