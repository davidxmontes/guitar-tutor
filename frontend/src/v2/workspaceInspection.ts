import type { ConceptWorkspace, Inspection, ResolvedWorkspace, WorkspaceNote } from '../types/conceptWorkspace';

export function workspaceLabel(id: string, facts: ResolvedWorkspace) {
  return facts.scales[id]?.label ?? facts.voicings[id]?.label ?? facts.chords[id]?.label ?? facts.keys[id]?.label ?? facts.transitions[id]?.label ?? facts.progressions[id]?.label ?? 'Scale comparison';
}

export function isInspected(id: string, notes: WorkspaceNote[], inspection: Inspection | null, workspace: ConceptWorkspace) {
  if (!inspection) return false;
  const related = (source: string): string[] => {
    const relation = workspace.relations.find(r => r.id === source);
    const ids = relation?.entity_ids ?? [source];
    return ids.flatMap(id => { const e = workspace.entities.find(e => e.id === id); return e?.kind === 'voicing' && e.chord_id ? [id, e.chord_id] : [id]; });
  };
  return related(id).some(id => related(inspection.source_id).includes(id)) && (inspection.kind !== 'pitch' || notes.some(n => n.pitch_class === inspection.key));
}

export function cagedSelection(sourceId: string, facts: ResolvedWorkspace, inspection: Inspection | null) {
  const source = facts.caged[sourceId];
  const key = inspection?.source_id === sourceId && inspection.kind.startsWith('region') ? String(inspection.key) : '';
  const selected = source.regions.find(r => r.shape === key.split(':')[0]) ?? source.regions[0];
  const pair = source.pairs.find(p => p.key === key) ?? source.pairs.find(p => p.key.startsWith(selected.shape + ':')) ?? source.pairs[source.pairs.length - 1];
  return { selected, pair, regions: pair.key.split(':').map(shape => source.regions.find(r => r.shape === shape)!), pitch: inspection?.kind === 'region_note' && inspection.source_id === sourceId ? Number(key.split(':')[1]) : null };
}
