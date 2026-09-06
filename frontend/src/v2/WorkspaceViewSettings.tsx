import { useState } from 'react';
import type { ConceptWorkspace, Resolved, WorkspaceBlock } from '../types/conceptWorkspace';
import { BLOCK_ACCEPTS } from './workspaceAdapter';

export function WorkspaceViewSettings({ workspace, resolved, block, disabled, onUpdate, onRemove }: {
  workspace: ConceptWorkspace; resolved: Resolved | null; block: WorkspaceBlock; disabled: boolean;
  onUpdate: (block: WorkspaceBlock) => void; onRemove: () => void;
}) {
  const [source, setSource] = useState('');
  const range = block.settings.fret_start == null || block.settings.fret_end == null ? 'auto' : `${block.settings.fret_start}-${block.settings.fret_end}`;
  const sources = [...workspace.entities, ...workspace.relations];
  const available = sources.filter(item => !block.sources.includes(item.id) && BLOCK_ACCEPTS[block.kind].includes(item.kind));
  const label = (id: string) => resolved?.entities[id]?.label ?? sources.find(item => item.id === id)?.kind ?? id;
  const updateSources = (ids: string[]) => onUpdate({ ...block, sources: ids,
    source_roles: Object.fromEntries(Object.entries(block.source_roles ?? {}).filter(([id]) => ids.includes(id))) });
  const settings = (patch: Partial<WorkspaceBlock['settings']>) => onUpdate({ ...block, settings: { ...block.settings, ...patch } });
  return <fieldset disabled={disabled} className="flex min-w-0 flex-wrap items-center gap-3">
    <legend className="font-semibold">View settings</legend>
    <ol aria-label="View sources" className="flex min-w-0 flex-wrap gap-2">{block.sources.map((id, index) => <li key={id} className="flex max-w-full flex-wrap items-center gap-1 rounded border border-[var(--border-primary)] p-1">
      <span>{label(id)}</span>
      <button className="ct-field ct-btn" aria-label={`Move ${label(id)} earlier`} disabled={index === 0} onClick={() => { const ids = [...block.sources]; [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; updateSources(ids); }}>↑</button>
      <button className="ct-field ct-btn" aria-label={`Move ${label(id)} later`} disabled={index === block.sources.length - 1} onClick={() => { const ids = [...block.sources]; [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]; updateSources(ids); }}>↓</button>
      <button className="ct-field ct-btn" aria-label={`Remove source ${label(id)}`} disabled={block.sources.length === 1} onClick={() => updateSources(block.sources.filter(sourceId => sourceId !== id))}>×</button>
    </li>)}</ol>
    <label className="min-w-0">Add source<select className="ct-field max-w-full" value={source} onChange={event => setSource(event.target.value)}><option value="">Choose source</option>{available.map(item => <option key={item.id} value={item.id}>{label(item.id)}</option>)}</select></label>
    <button className="ct-field ct-btn" disabled={!available.some(item => item.id === source) || block.sources.length >= 8} onClick={() => { updateSources([...block.sources, source]); setSource(''); }}>Add source to view</button>
    <label>Labels<select aria-label="Labels" className="ct-field" value={block.settings.labels} onChange={event => settings({ labels: event.target.value as 'notes' | 'intervals' })}><option value="notes">Notes</option><option value="intervals">Intervals</option></select></label>
    {block.kind === 'fretboard' && <label>Frets<select aria-label="Frets" className="ct-field" value={range} onChange={event => { const [fret_start, fret_end] = event.target.value === 'auto' ? [null, null] : event.target.value.split('-').map(Number); settings({ fret_start, fret_end }); }}>{[...new Set([range, 'auto', '0-5', '3-8', '5-10', '7-12', '0-19'])].map(value => <option key={value}>{value}</option>)}</select></label>}
    <label>Comparison<select aria-label="Comparison" className="ct-field" value={block.settings.comparison ?? 'highlight'} onChange={event => settings({ comparison: event.target.value as 'highlight' | 'plain' | 'shared-only' })}><option value="highlight">Highlight</option><option value="plain">Plain</option><option value="shared-only">Shared notes only</option></select></label>
    <button className="ct-field ct-btn" onClick={onRemove}>Remove View</button>
  </fieldset>;
}
