import { Fretboard } from './Fretboard';
import { WorkspaceProgressionBlock } from './WorkspaceProgressionBlock';
import { ChordDiagramBlock, CircleBlock } from './PhysicalWorkspaceBlocks';
import { DegreeStripBlock } from './DegreeStripBlock';
import type { TutorFocus } from '../types/v2';
import type { ConceptWorkspace, Resolved, TypedInspection, WorkspaceBlock } from '../types/conceptWorkspace';

// Thin dispatcher: every block consumes the uniform resolved model + the pull-based
// TypedInspection and derives its own view (spec #88 §4).
export function ConceptWorkspaceBlock({ block, workspace, resolved, inspection, onInspect, tutorFocus, readOnly = false, disabled = false, onMaterializeRegion }: {
  block: WorkspaceBlock; workspace: ConceptWorkspace; resolved: Resolved;
  tutorFocus?: TutorFocus | null; readOnly?: boolean; disabled?: boolean;
  onMaterializeRegion?: (shape: string) => void;
  inspection: TypedInspection | null; onInspect: (inspection: TypedInspection) => void;
}) {
  if (block.kind === 'fretboard')
    return <Fretboard {...{ block, resolved, inspection, onInspect, tutorFocus, readOnly, disabled, onMaterializeRegion }} />;
  if (block.kind === 'progression')
    return <WorkspaceProgressionBlock {...{ block, resolved, inspection, onInspect, readOnly, disabled }} />;
  if (block.kind === 'chord_diagrams')
    return <ChordDiagramBlock {...{ block, resolved, inspection, onInspect, readOnly }} />;
  if (block.kind === 'circle')
    return <CircleBlock {...{ block, workspace, resolved, inspection, onInspect, readOnly }} />;
  return <DegreeStripBlock {...{ block, resolved, inspection, onInspect, readOnly }} />;
}
