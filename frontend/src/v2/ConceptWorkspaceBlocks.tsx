import { Fretboard } from './Fretboard';
import { WorkspaceProgressionBlock } from './WorkspaceProgressionBlock';
import { ChordDiagramBlock, CircleBlock } from './PhysicalWorkspaceBlocks';
import { DegreeStripBlock } from './DegreeStripBlock';
import { KeyFamilyBlock } from './KeyFamilyBlock';
import type { TutorFocus } from '../types/v2';
import type { ConceptWorkspace, Resolved, TypedInspection, WorkspaceBlock } from '../types/conceptWorkspace';

// Thin dispatcher: every block consumes the uniform resolved model + the pull-based
// TypedInspection and derives its own view (spec #88 §4).
export function ConceptWorkspaceBlock({ block, workspace, resolved, inspection, onInspect, tutorFocus, readOnly = false, disabled = false, onMaterializeRegion, onMaterializeChord }: {
  block: WorkspaceBlock; workspace: ConceptWorkspace; resolved: Resolved;
  tutorFocus?: TutorFocus | null; readOnly?: boolean; disabled?: boolean;
  onMaterializeRegion?: (shape: string) => void;
  onMaterializeChord?: (inspection: Extract<TypedInspection, { kind: 'chord'; root: number }>) => void;
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
  if (block.kind === 'key_family')
    return <KeyFamilyBlock {...{ block, resolved, inspection, onInspect, readOnly, onMaterialize: onMaterializeChord }} />;
  return <DegreeStripBlock {...{ block, resolved, inspection, onInspect, readOnly }} />;
}
