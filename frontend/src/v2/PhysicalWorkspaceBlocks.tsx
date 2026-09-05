import type { ConceptWorkspace, Inspection, ResolvedWorkspace, WorkspaceBlock } from '../types/conceptWorkspace';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import { isInspected } from './workspaceInspection';

const button = 'min-h-11 rounded-lg border border-[var(--border-primary)] px-3 py-2 text-sm aria-pressed:ring-2 aria-pressed:ring-[var(--accent-700)]';
export function PhysicalWorkspaceBlock({ block, workspace, resolved, inspection, onInspect, readOnly }: {
  block: WorkspaceBlock; workspace: ConceptWorkspace; resolved: ResolvedWorkspace; inspection: Inspection | null; onInspect: (i: Inspection) => void; readOnly: boolean;
}) {
  const relation = workspace.relations.find(r => r.id === block.source_id);
  const ids = relation?.entity_ids ?? [block.source_id];
  const transition = resolved.transitions[block.source_id];
  if (block.kind === 'circle') {
    const key = resolved.keys[block.source_id];
    const transitions = workspace.relations.filter(r => r.kind === 'transition' && r.key_id === block.source_id);
    const chords = [...new Set(transitions.flatMap(r => r.entity_ids.map(id => resolved.voicings[id].chord_id)).filter((id): id is string => Boolean(id)))];
    return <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-80" aria-label="Circle of Fifths">
        <div aria-hidden="true" className="absolute inset-[12%] rounded-full border-2 border-[var(--border-primary)]" />
        {key.circle.map((root, i) => <span key={root} className="absolute flex min-h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-[var(--card-bg)] text-sm" style={{ left:`${50 + 42 * Math.sin(i * Math.PI / 6)}%`, top:`${50 - 42 * Math.cos(i * Math.PI / 6)}%`, fontWeight: root === key.root ? 800 : 400 }}>{root}</span>)}
        <strong className="absolute inset-[30%] flex items-center justify-center text-center">{key.label}<br />Home</strong>
      </div>
      <div className="flex flex-wrap gap-2">{chords.map(id => { const chord = resolved.chords[id]; const r = transitions.find(r => r.entity_ids.some(v => resolved.voicings[v].chord_id === id))!; const index = r.entity_ids.findIndex(v => resolved.voicings[v].chord_id === id);
        return <button key={id} disabled={readOnly} className={button} aria-label={`Inspect ${chord.label}`} aria-pressed={isInspected(id, chord.notes, inspection, workspace)} onClick={() => onInspect({ source_id:id, kind:'chord', key:id })}>{chord.label} · {resolved.transitions[r.id].functions[index]}</button>;
      })}</div>
      <details><summary className="min-h-11 cursor-pointer py-2">Harmonic detail</summary>{chords.map(id => <p key={id}>{resolved.chords[id].label}: {resolved.chords[id].notes.map(n => `${n.note} (${n.degree})`).join(' · ')}</p>)}</details>
    </div>;
  }
  return <div className="space-y-3">
    {transition && <button className={button} disabled={readOnly} aria-pressed={inspection?.source_id === block.source_id} onClick={() => onInspect({ source_id:block.source_id, kind:'transition', key:block.source_id })}>Inspect transition · {transition.functions.join(' → ')}</button>}
    <div className="flex flex-wrap gap-6">{ids.map((id, index) => {
      const v = resolved.voicings[id]; const chord = v.chord_id ? resolved.chords[v.chord_id] : null;
      const role = (pitch: number) => transition ? transition.shared.includes(pitch) ? 'shared' : index === 0 ? 'removed' : 'added' : '';
      return <div key={id} className="min-w-0 flex-1 space-y-2">
        <button className={button} disabled={readOnly} aria-label={`Inspect ${v.label}`} aria-pressed={isInspected(id, v.positions, inspection, workspace)} onClick={() => onInspect({ source_id:id, kind:'voicing', key:id })}>{v.label}</button>
        <PhysicalChordDiagram positions={v.positions} tuning={v.tuning} label={v.label} highlightedPositions={v.positions.filter(p => isInspected(id, [p], inspection, workspace))} />
        {chord && <button className={button} disabled={readOnly} aria-label={`Inspect ${chord.label}`} aria-pressed={isInspected(v.chord_id!, chord.notes, inspection, workspace)} onClick={() => onInspect({ source_id:v.chord_id!, kind:'chord', key:v.chord_id! })}>{chord.label}</button>}
        <div className="flex flex-wrap gap-2">{v.positions.filter(p => !block.settings.shared_only || role(p.pitch_class) === 'shared').map(p => <button key={p.string} disabled={readOnly} className={button} aria-label={`${v.label}: ${p.note}, string ${p.string}, fret ${p.fret}`} aria-pressed={isInspected(id, [p], inspection, workspace)} onClick={() => onInspect({ source_id:id, kind:'pitch', key:p.pitch_class })}>{block.settings.labels === 'notes' ? p.note : p.degree}<small className="block">{role(p.pitch_class)}</small></button>)}</div>
      </div>;
    })}</div>
    {transition && <details><summary className="min-h-11 cursor-pointer py-2">String-by-string movement</summary><p>Shared means the same pitch class; a fixed string keeps the exact pitch and fret.</p><ul>{transition.movement.map(m => <li key={m.string}>String {m.string}: {m.before ? `${m.before.note} (fret ${m.before.fret})` : 'muted'} → {m.after ? `${m.after.note} (fret ${m.after.fret})` : 'muted'} · {m.kind}{m.kind === 'moving' ? ` ${m.semitones! > 0 ? '+' : ''}${m.semitones} semitones` : ''}</li>)}</ul></details>}
  </div>;
}
