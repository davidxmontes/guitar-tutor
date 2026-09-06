import { CagedWorkspaceBlock } from './CagedWorkspaceBlock';
import { WorkspaceProgressionBlock } from './WorkspaceProgressionBlock';
import { PhysicalWorkspaceBlock } from './PhysicalWorkspaceBlocks';
import { isInspected } from './workspaceInspection';
import type { TutorFocus } from '../types/v2';
import type { ConceptWorkspace, Inspection, ResolvedWorkspace, WorkspaceBlock, WorkspaceNote } from '../types/conceptWorkspace';

const noteStyle = (shared: boolean, selected: boolean) => ({
  background: shared ? 'var(--accent-100)' : 'var(--card-bg)',
  color: 'var(--text-primary)', borderColor: shared ? 'var(--accent-700)' : 'var(--text-secondary)',
  outline: selected ? '3px solid var(--accent-700)' : undefined, outlineOffset: 2,
});

export function ConceptWorkspaceBlock({ block, workspace, resolved, inspection, onInspect, tutorFocus, readOnly = false, disabled = false, onKeepRegion }: {
  block: WorkspaceBlock; workspace: ConceptWorkspace; resolved: ResolvedWorkspace;
  tutorFocus?: TutorFocus | null; readOnly?: boolean; disabled?: boolean;
  onKeepRegion?: (shape: string) => void;
  inspection: Inspection | null; onInspect: (inspection: Inspection) => void;
}) {
  if (resolved.caged[block.source_id]) return <CagedWorkspaceBlock {...{block, workspace, resolved, inspection, onInspect, readOnly, disabled, onKeepRegion}} />;
  if (block.kind === 'progression') return <WorkspaceProgressionBlock {...{ block, resolved, inspection, onInspect, readOnly, disabled }} />;
  const relation = workspace.relations.find(item => item.id === block.source_id);
  const ids = relation?.entity_ids ?? [block.source_id];
  if (block.kind === 'circle' || block.kind === 'chord_diagrams') return <PhysicalWorkspaceBlock {...{ block, workspace, resolved, inspection, onInspect, readOnly }} />;
  const transition = resolved.transitions[block.source_id];
  const shared = resolved.comparisons[block.source_id]?.shared ?? transition?.shared ?? [];
  const tuning = resolved.voicings[ids[0]]?.tuning ?? workspace.tuning;
  const musical = (id: string) => resolved.scales[id] ?? resolved.voicings[id];
  const selected = (id: string, note: WorkspaceNote) => isInspected(id, [note], inspection, workspace);
  const inspect = (id: string, note: WorkspaceNote) => onInspect({ source_id: id, kind: 'pitch', key: note.pitch_class });
  const label = (id: string, note: WorkspaceNote) => `${musical(id).label}: ${note.note}, degree ${note.degree}${relation ? shared.includes(note.pitch_class) ? ', shared' : transition ? ids[0] === id ? ', removed' : ', added' : ', changed' : ''}`;
  if (block.kind === 'degree_strip') return <div className="space-y-3">{ids.map(id => <div key={id}>
    <h4 className="mb-1.5 text-sm font-semibold">{resolved.scales[id].label}</h4>
    <div className="flex flex-wrap gap-1.5">{resolved.scales[id].notes.filter(note => !block.settings.shared_only || shared.includes(note.pitch_class)).map(note => <button
      key={note.degree} type="button" disabled={readOnly} aria-label={label(id, note)} aria-pressed={selected(id, note)} onClick={() => inspect(id, note)}
      className="flex min-h-11 min-w-11 flex-col items-center justify-center rounded-md border px-2 py-1 leading-tight" style={noteStyle(shared.includes(note.pitch_class), selected(id, note))}>
      <strong className="block text-sm">{block.settings.labels === 'notes' ? note.note : note.degree}</strong>
      <small className="text-[10px]">{relation ? shared.includes(note.pitch_class) ? 'shared' : 'changed' : note.degree}</small>
    </button>)}</div>
  </div>)}</div>;

  const frets = Array.from({ length: block.settings.fret_end - block.settings.fret_start + 1 }, (_, index) => index + block.settings.fret_start);
  return <div className="overflow-x-auto rounded-lg border border-[var(--border-primary)] p-2" tabIndex={0} aria-label="Scrollable guitar fretboard">
    {tutorFocus?.label && <p className="mb-2 text-sm">Tutor focus: {tutorFocus.label}</p>}
    <div style={{ minWidth: 48 * (frets.length + 1) }}>
      <div className="grid text-center text-xs" style={{ gridTemplateColumns: `44px repeat(${frets.length}, 1fr)` }}><span>String</span>{frets.map(fret => <span key={fret}>{fret === 0 ? 'Open' : fret}</span>)}</div>
      {tuning.map((midi, index) => <div key={index} className="grid items-center" style={{ gridTemplateColumns: `44px repeat(${frets.length}, 1fr)` }}>
        <span className="text-center text-xs" title={`Open MIDI ${midi}`}>{index + 1}</span>
        {frets.map(fret => {
          const matches = ids.flatMap(id => musical(id).positions.filter(p => p.string === index + 1 && p.fret === fret).map(note => ({ id, note })));
          const first = matches[0];
          const visible = first && (!block.settings.shared_only || shared.includes(first.note.pitch_class));
          return <div key={fret} className="flex min-h-14 items-center justify-center border-l border-b border-[var(--border-primary)]">
            {visible && <button type="button" disabled={readOnly} aria-label={`${matches.map(({ id, note }) => label(id, note)).join('; ')}, string ${index + 1}, fret ${fret}`}
              data-tutor-focus={tutorFocus?.notes.some(note => note.string === index + 1 && note.fret === fret) || undefined}
              aria-pressed={matches.some(({ id, note }) => selected(id, note))} onClick={() => inspect(first.id, first.note)}
              className="min-h-11 min-w-11 rounded-full border px-1 text-xs font-bold data-[tutor-focus=true]:ring-4 data-[tutor-focus=true]:ring-amber-500" style={noteStyle(shared.includes(first.note.pitch_class), matches.some(({ id, note }) => selected(id, note)))}>
              {matches.map(({ note }) => block.settings.labels === 'notes' ? note.note : note.degree).filter((text, i, all) => all.indexOf(text) === i).join('/')}
              {transition && <small className="block text-[9px]">{shared.includes(first.note.pitch_class) ? 'shared' : first.id === ids[0] ? 'removed' : 'added'}</small>}
            </button>}
          </div>;
        })}
      </div>)}
    </div>
  </div>;
}
