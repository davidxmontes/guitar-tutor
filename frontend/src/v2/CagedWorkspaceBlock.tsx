import type { ConceptWorkspace, Inspection, ResolvedWorkspace, WorkspaceBlock, WorkspacePosition } from '../types/conceptWorkspace';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import { cagedSelection } from './workspaceInspection';

const control = 'min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] px-3 py-2 disabled:opacity-50 aria-pressed:ring-2 aria-pressed:ring-[var(--accent-700)]';
export function CagedWorkspaceBlock({ block, workspace, resolved, inspection, onInspect, readOnly, disabled, onWorkspaceChange, onKeepRegion }: {
  block: WorkspaceBlock; workspace: ConceptWorkspace; resolved: ResolvedWorkspace; inspection: Inspection | null;
  onInspect: (inspection: Inspection) => void; readOnly: boolean; disabled: boolean;
  onWorkspaceChange?: (workspace: ConceptWorkspace) => void; onKeepRegion?: (shape: string) => void;
}) {
  const source = resolved.caged[block.source_id];
  const { selected, pair, regions, pitch } = cagedSelection(block.source_id, resolved, inspection);
  const inspect = (kind: Inspection['kind'], key: string) => onInspect({ source_id: block.source_id, kind, key });
  const shared = (p: WorkspacePosition) => pair.shared.some(n => n.string === p.string && n.fret === p.fret);
  const highlighted = (shape: string, p: WorkspacePosition) => inspection?.source_id === block.source_id && (pitch !== null ? pitch === p.pitch_class : inspection.kind === 'region_pair' || selected.shape === shape);
  const tones = (positions: WorkspacePosition[]) => positions.filter((p,i,all) => all.findIndex(n => n.pitch_class === p.pitch_class) === i && (!block.settings.shared_only || positions.some(n => n.pitch_class === p.pitch_class && shared(n))));
  const label = (shape: string, p: WorkspacePosition) => `${shape} shape: ${p.note}, degree ${p.degree}`;
  const noteButton = (shape: string, p: WorkspacePosition) => ({
    disabled: readOnly, 'aria-label': label(shape, p), 'aria-pressed': highlighted(shape, p),
    onClick: () => inspect('region_note', `${shape}:${p.pitch_class}`),
  });
  if (block.kind === 'caged') {
    const chord = workspace.entities.find(e => e.id === block.source_id)!;
    if (chord.kind !== 'chord') return null;
    return <div className="space-y-3">
      <p>One chord, five connected shapes. Select a region to find its notes in both views.</p>
      {!readOnly && <fieldset disabled={disabled} className="flex flex-wrap gap-3">
        <label>CAGED root<select aria-label="CAGED root" className={`${control} block`} value={chord.root} onChange={e => onWorkspaceChange?.({...workspace, entities:workspace.entities.map(item => item.id === chord.id ? {...chord, root:e.target.value} : item)})}>{['C','C#','Db','D','Eb','E','F','F#','Gb','G','Ab','A','Bb','B'].map(root => <option key={root}>{root}</option>)}</select></label>
        <label>CAGED quality<select aria-label="CAGED quality" className={`${control} block`} value={chord.quality} onChange={e => onWorkspaceChange?.({...workspace, entities:workspace.entities.map(item => item.id === chord.id ? {...chord, quality:e.target.value} : item)})}><option value="major">Major</option><option value="minor">Minor</option></select></label>
        <label>CAGED tuning<select aria-label="CAGED tuning" className={`${control} block`} value={JSON.stringify(workspace.tuning)} onChange={e => onWorkspaceChange?.({...workspace,tuning:JSON.parse(e.target.value)})}><option value="[64,59,55,50,45,40]">Standard</option><option value="[64,59,55,50,45,38]">Drop D</option>{!['[64,59,55,50,45,40]','[64,59,55,50,45,38]'].includes(JSON.stringify(workspace.tuning)) && <option value={JSON.stringify(workspace.tuning)}>Custom</option>}</select></label>
      </fieldset>}
      <div className="flex flex-wrap gap-2">{source.regions.map(region => <button key={region.shape} className={control} disabled={readOnly} aria-label={`Inspect ${region.shape} shape`} aria-pressed={selected.shape === region.shape} onClick={() => inspect('region', region.shape)}>{region.shape} shape · frets {region.fret_start}–{region.fret_end}</button>)}</div>
      <div className="flex flex-wrap gap-2">{tones(selected.positions).map(p => <button key={p.pitch_class} className={control} {...noteButton(selected.shape,p)}>{block.settings.labels === 'notes' ? p.note : p.degree}</button>)}</div>
      <button className={control} disabled={readOnly} onClick={() => inspect('region_pair', pair.key)}>Inspect adjacent regions · {pair.key.replace(':',' → ')}</button>
      <p>Shared positions: {pair.shared.length}. These stay on the same string and fret. Both shapes contain the same chord tones.</p>
      <details><summary className="min-h-11 cursor-pointer py-3">How the fingers move · {pair.key.replace(':',' → ')}</summary><ul>{pair.movement.map(m => <li key={m.string}>String {m.string}: {m.before ? `fret ${m.before.fret}` : 'muted'} → {m.after ? `fret ${m.after.fret}` : 'muted'} · {m.kind === 'moving' ? `${m.semitones! > 0 ? '+' : ''}${m.semitones} semitones` : m.kind}</li>)}</ul></details>
      {!readOnly && <button className={control} disabled={disabled || workspace.blocks.length > 10 || workspace.entities.length > 10} onClick={() => onKeepRegion?.(selected.shape)}>Keep selected voicing</button>}
      <p className="text-sm text-[var(--text-secondary)]">Keeping a voicing adds an editable copy. Changing this exploration later keeps that copy intact.</p>
    </div>;
  }
  if (block.kind === 'chord_diagrams') return <div className="flex flex-wrap gap-6">{regions.map(region => <div key={region.shape} className="min-w-0 space-y-2">
    <h4 className="font-semibold">{selected.shape === region.shape ? 'Selected' : 'Adjacent'} · {region.shape} shape</h4>
    <PhysicalChordDiagram positions={region.positions.filter(p => !block.settings.shared_only || shared(p))} tuning={region.tuning} label={`${source.label} · ${region.shape} shape`} highlightedPositions={region.positions.filter(p => highlighted(region.shape,p))} />
    <div className="flex flex-wrap gap-2">{tones(region.positions).map(p => <button key={p.pitch_class} className={control} {...noteButton(region.shape,p)}>{block.settings.labels === 'notes' ? p.note : p.degree}</button>)}</div>
  </div>)}</div>;
  const start = Math.min(...regions.map(r => r.fret_start));
  const end = Math.max(...regions.map(r => r.fret_end));
  const frets = Array.from({length:end-start+1},(_,i)=>start+i);
  return <div className="overflow-x-auto rounded-lg border border-[var(--border-primary)] p-2" tabIndex={0} aria-label="Scrollable CAGED fretboard"><div style={{minWidth:48*(frets.length+1)}}>
    <div className="grid text-center text-xs" style={{gridTemplateColumns:`44px repeat(${frets.length},1fr)`}}><span>String</span>{frets.map(fret => <span key={fret}>{fret === 0 ? 'Open' : fret}</span>)}</div>
    {workspace.tuning.map((_,i) => <div key={i} className="grid items-center" style={{gridTemplateColumns:`44px repeat(${frets.length},1fr)`}}><span className="text-center text-xs">{i+1}</span>{frets.map(fret => {
      const matches = regions.flatMap(r => r.positions.filter(p => p.string === i+1 && p.fret === fret).map(p => ({shape:r.shape,p})));
      const first = matches[0];
      return <div key={fret} className="flex min-h-14 items-center justify-center border-l border-b border-[var(--border-primary)]">{first && (!block.settings.shared_only || shared(first.p)) && <button {...noteButton(first.shape, first.p)} aria-label={`${matches.map(m => label(m.shape,m.p)).join('; ')}, string ${i+1}, fret ${fret}`} aria-pressed={matches.some(m => highlighted(m.shape,m.p))} className="min-h-11 min-w-11 rounded-full border px-1 text-xs font-bold aria-pressed:ring-2" style={{background: shared(first.p) ? 'var(--accent-100)' : 'var(--card-bg)'}}>{block.settings.labels === 'notes' ? first.p.note : first.p.degree}<small className="block text-[9px]">{shared(first.p) ? 'shared' : first.shape + ' shape'}</small></button>}</div>;
    })}</div>)}
  </div></div>;
}
