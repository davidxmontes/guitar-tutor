import type { ConceptWorkspace, Inspection, WorkspaceNote } from '../types/conceptWorkspace';

// Legacy shim: still read by the not-yet-rebuilt physical/progression blocks (T4).
export function isInspected(id: string, notes: WorkspaceNote[], inspection: Inspection | null, workspace: ConceptWorkspace) {
  if (!inspection) return false;
  const related = (source: string): string[] => {
    const relation = workspace.relations.find(r => r.id === source);
    const ids = relation?.entity_ids ?? [source];
    return ids.flatMap(id => { const e = workspace.entities.find(e => e.id === id); return e?.kind === 'voicing' && e.chord_id ? [id, e.chord_id] : [id]; });
  };
  return related(id).some(id => related(inspection.source_id).includes(id)) && (inspection.kind !== 'pitch' || notes.some(n => n.pitch_class === inspection.key));
}
