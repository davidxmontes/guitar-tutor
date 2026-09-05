import type { TutorFocus } from '../types/v2';
import type { ConceptWorkspace, Inspection, ResolvedWorkspace, WorkspaceBlock, WorkspaceNote } from '../types/conceptWorkspace';

const noteStyle = (shared: boolean, selected: boolean) => ({
  background: shared ? 'var(--accent-100)' : 'var(--card-bg)',
  color: 'var(--text-primary)', borderColor: shared ? 'var(--accent-700)' : 'var(--text-secondary)',
  outline: selected ? '3px solid var(--accent-700)' : undefined, outlineOffset: 2,
});

export function ConceptWorkspaceBlock({ block, workspace, resolved, inspection, onInspect, tutorFocus, readOnly = false }: {
  block: WorkspaceBlock; workspace: ConceptWorkspace; resolved: ResolvedWorkspace;
  tutorFocus?: TutorFocus | null; readOnly?: boolean;
  inspection: Inspection | null; onInspect: (inspection: Inspection) => void;
}) {
  const relation = workspace.relations.find(item => item.id === block.source_id);
  const ids = relation?.entity_ids ?? [block.source_id];
  const shared = resolved.comparisons[block.source_id]?.shared ?? [];
  const compatible = inspection && (ids.includes(inspection.source_id) || inspection.source_id === block.source_id);
  const selected = (note: WorkspaceNote) => Boolean(compatible && inspection.key === note.pitch_class);
  const inspect = (id: string, note: WorkspaceNote) => onInspect({ source_id: id, kind: 'pitch', key: note.pitch_class });
  const label = (id: string, note: WorkspaceNote) => `${resolved.scales[id].label}: ${note.note}, degree ${note.degree}${relation ? shared.includes(note.pitch_class) ? ', shared' : ', changed' : ''}`;
  if (block.kind === 'degree_strip') return <div className="space-y-4">{ids.map(id => <div key={id}>
    <h4 className="mb-2 font-semibold">{resolved.scales[id].label}</h4>
    <div className="flex flex-wrap gap-2">{resolved.scales[id].notes.filter(note => !block.settings.shared_only || shared.includes(note.pitch_class)).map(note => <button
      key={note.degree} type="button" disabled={readOnly} aria-label={label(id, note)} aria-pressed={selected(note)} onClick={() => inspect(id, note)}
      className="min-h-14 min-w-14 rounded-lg border px-3 py-2" style={noteStyle(shared.includes(note.pitch_class), selected(note))}>
      <strong className="block">{block.settings.labels === 'notes' ? note.note : note.degree}</strong>
      <small>{relation ? shared.includes(note.pitch_class) ? 'shared' : 'changed' : note.degree}</small>
    </button>)}</div>
  </div>)}</div>;

  const frets = Array.from({ length: block.settings.fret_end - block.settings.fret_start + 1 }, (_, index) => index + block.settings.fret_start);
  return <div className="overflow-x-auto rounded-lg border border-[var(--border-primary)] p-2" tabIndex={0} aria-label="Scrollable guitar fretboard">
    {tutorFocus?.label && <p className="mb-2 text-sm">Tutor focus: {tutorFocus.label}</p>}
    <div style={{ minWidth: 48 * (frets.length + 1) }}>
      <div className="grid text-center text-xs" style={{ gridTemplateColumns: `44px repeat(${frets.length}, 1fr)` }}><span>String</span>{frets.map(fret => <span key={fret}>{fret === 0 ? 'Open' : fret}</span>)}</div>
      {workspace.tuning.map((midi, index) => <div key={index} className="grid items-center" style={{ gridTemplateColumns: `44px repeat(${frets.length}, 1fr)` }}>
        <span className="text-center text-xs" title={`Open MIDI ${midi}`}>{index + 1}</span>
        {frets.map(fret => {
          const matches = ids.flatMap(id => resolved.scales[id].positions.filter(p => p.string === index + 1 && p.fret === fret).map(note => ({ id, note })));
          const first = matches[0];
          const visible = first && (!block.settings.shared_only || shared.includes(first.note.pitch_class));
          return <div key={fret} className="flex min-h-14 items-center justify-center border-l border-b border-[var(--border-primary)]">
            {visible && <button type="button" disabled={readOnly} aria-label={`${matches.map(({ id, note }) => label(id, note)).join('; ')}, string ${index + 1}, fret ${fret}`}
              data-tutor-focus={tutorFocus?.notes.some(note => note.string === index + 1 && note.fret === fret) || undefined}
              aria-pressed={selected(first.note)} onClick={() => inspect(first.id, first.note)}
              className="min-h-11 min-w-11 rounded-full border px-1 text-xs font-bold data-[tutor-focus=true]:ring-4 data-[tutor-focus=true]:ring-amber-500" style={noteStyle(shared.includes(first.note.pitch_class), selected(first.note))}>
              {matches.map(({ note }) => block.settings.labels === 'notes' ? note.note : note.degree).filter((text, i, all) => all.indexOf(text) === i).join('/')}
            </button>}
          </div>;
        })}
      </div>)}
    </div>
  </div>;
}
