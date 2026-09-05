import { useState } from 'react';
import type { ConceptWorkspace, Inspection, ProgressionAction, ResolvedWorkspace, WorkspaceBlock } from '../types/conceptWorkspace';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
const control = 'min-h-11 max-w-full rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] px-3 py-2 disabled:opacity-50';
const roots = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

export function WorkspaceProgressionBlock({ block, workspace, resolved, inspection, onInspect, readOnly, disabled, onAction, onChange, onHear }: {
  block: WorkspaceBlock; workspace: ConceptWorkspace; resolved: ResolvedWorkspace; inspection: Inspection | null; onInspect: (i: Inspection) => void;
  readOnly: boolean; disabled: boolean; onAction?: (action: ProgressionAction) => void; onChange?: (w: ConceptWorkspace) => void;
  onHear?: (steps: ResolvedWorkspace['progressions'][string]['steps']) => void;
}) {
  const [distance, setDistance] = useState(2);
  const progression = resolved.progressions[block.source_id];
  const key = resolved.keys[progression.key_id];
  const index = inspection?.source_id === block.source_id && inspection.kind === 'step' && typeof inspection.key === 'number' ? inspection.key : 0;
  const selected = progression.steps[index] ?? progression.steps[0];
  return <div className="space-y-4">
    <p>{progression.derived ? 'Follows the key · your first edit creates concrete music' : 'Concrete music · key changes only reanalyze'}</p>
    {!readOnly && <fieldset disabled={disabled} className="flex flex-wrap gap-3"><label>Progression key <select aria-label="Progression key" className={control} value={key.root} onChange={e => onChange?.({ ...workspace, entities:workspace.entities.map(entity => entity.id === progression.key_id && entity.kind === 'key' ? { ...entity, root:e.target.value } : entity) })}>{[...new Set([...roots, key.root])].map(root => <option key={root}>{root}</option>)}</select></label>
      {progression.derived ? <button className={control} onClick={() => onAction?.({ action:'materialize' })}>Work with these chords</button> : <><label>Transpose distance <select aria-label="Transpose distance" className={control} value={distance} onChange={e => setDistance(Number(e.target.value))}>{Array.from({length:25}, (_,i) => i-12).filter(n => n !== 0).map(n => <option key={n} value={n}>{n > 0 ? '+' : ''}{n} semitones</option>)}</select></label><button className={control} onClick={() => onAction?.({ action:'transpose', semitones:distance })}>Transpose progression</button></>}
    </fieldset>}
    <ol aria-label="Progression chords" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{progression.steps.map((step, i) => <li key={i} className="min-w-0 space-y-2 rounded-lg border border-[var(--border-primary)] p-3">
      <button className={`${control} w-full text-left aria-pressed:ring-2 aria-pressed:ring-[var(--accent-700)]`} disabled={readOnly || disabled} aria-label={`Select chord ${i+1}: ${step.root} ${step.quality}`} aria-pressed={index === i} onClick={() => onInspect({ source_id:block.source_id, kind:'step', key:i })}>
        <small>{i+1} · {block.settings.labels === 'intervals' ? step.function : step.quality}</small><strong className="block">{step.root}{step.quality === 'minor' ? 'm' : step.quality === 'major' ? '' : ` ${step.quality}`}</strong>
      </button>
      {step.positions.length ? <PhysicalChordDiagram positions={step.positions} tuning={step.tuning} label={`${step.root} ${step.quality}`} /> : <p>Add a voicing to hear this chord.</p>}
      <p className="text-sm">{step.function}</p>
    </li>)}</ol>
    {!readOnly && <fieldset disabled={disabled} className="space-y-3"><legend className="font-semibold">Edit chord {index+1}</legend>
      <div className="flex flex-wrap gap-3"><label>Selected chord root <select aria-label="Selected chord root" className={control} value={selected.root} onChange={e => onAction?.({ action:'edit', step:index, root:e.target.value })}>{[...new Set([...roots, selected.root])].map(root => <option key={root}>{root}</option>)}</select></label>
        <label>Selected chord quality <select aria-label="Selected chord quality" className={control} value={selected.quality} onChange={e => onAction?.({ action:'edit', step:index, quality:e.target.value as 'major' | 'minor' })}><option value="major">Major</option><option value="minor">Minor</option>{!['major','minor'].includes(selected.quality) && <option value={selected.quality}>{selected.quality}</option>}</select></label></div>
      <p className="text-sm">Changing root or quality chooses a reference shape for this occurrence. Exact fret edits keep the chord name.</p>
      <details><summary className="min-h-11 cursor-pointer py-2">Edit this occurrence’s frets</summary><div className="flex flex-wrap gap-2">{Array.from({length:6}, (_,i) => i+1).map(string => <label key={string}>String {string}<select aria-label={`Selected voicing string ${string}`} className={`${control} block`} value={selected.positions.find(p => p.string === string)?.fret ?? 'muted'} onChange={e => onAction?.({ action:'edit', step:index, positions:[...selected.positions.filter(p => p.string !== string).map(p => ({string:p.string, fret:p.fret})), ...(e.target.value === 'muted' ? [] : [{string, fret:Number(e.target.value)}])].sort((a,b) => a.string-b.string) })}><option value="muted">Muted</option>{Array.from({length:25}, (_,i) => <option key={i} value={i}>{i === 0 ? 'Open' : i}</option>)}</select></label>)}</div></details>
      <button className={control} disabled={index >= progression.steps.length-1 || progression.steps.slice(index,index+2).some(s => !s.positions.length)} onClick={() => onHear?.(progression.steps.slice(index,index+2))}>Hear selected transition</button>
      <p className="text-sm">{index < progression.steps.length-1 ? `Chord ${index+1} → ${index+2}` : 'Select an earlier chord to hear its next transition.'}</p>
    </fieldset>}
  </div>;
}
