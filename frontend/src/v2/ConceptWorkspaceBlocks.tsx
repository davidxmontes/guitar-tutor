import { Fretboard } from './Fretboard';
import type { TutorFocus } from '../types/v2';
import type { ConceptWorkspace, Resolved, TypedInspection, WorkspaceBlock } from '../types/conceptWorkspace';

// T3 owns the fretboard (incl. CAGED mode). degree-strip / chord-diagram / circle /
// progression are rebuilt against the uniform model by T4 — placeholder until then.
export function ConceptWorkspaceBlock({ block, resolved, inspection, onInspect, tutorFocus, readOnly = false, disabled = false, onMaterializeRegion }: {
  block: WorkspaceBlock; workspace: ConceptWorkspace; resolved: Resolved;
  tutorFocus?: TutorFocus | null; readOnly?: boolean; disabled?: boolean;
  onMaterializeRegion?: (shape: string) => void;
  inspection: TypedInspection | null; onInspect: (inspection: TypedInspection) => void;
}) {
  if (block.kind === 'fretboard')
    return <Fretboard {...{ block, resolved, inspection, onInspect, tutorFocus, readOnly, disabled, onMaterializeRegion }} />;
  return <p className="text-sm text-[var(--text-secondary)]">This {block.kind.replace('_', ' ')} view is being rebuilt.</p>;
}
