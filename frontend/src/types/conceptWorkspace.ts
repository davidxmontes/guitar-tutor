export type ScaleMode = 'major' | 'natural_minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian' | 'harmonic_minor' | 'melodic_minor' | 'pentatonic_major' | 'pentatonic_minor' | 'blues';
export interface ScaleEntity { id: string; kind: 'scale'; label?: string | null; root: string; mode: ScaleMode }
export interface KeyEntity { id: string; kind: 'key'; root: string; mode: 'major' }
export interface ChordEntity { id: string; kind: 'chord'; root: string; quality: string }
export interface VoicingEntity { id: string; kind: 'voicing'; label: string; chord_id: string | null; tuning: number[]; positions: { string: number; fret: number }[] }
export interface ProgressionEntity { id: string; kind: 'progression'; key_id: string; steps: { chord_id: string; voicing_id: string | null }[] }
export type NoteRef = { pitch_class: number } | { string: number; fret: number };
export interface NoteGroupEntity { id: string; kind: 'noteGroup'; label: string; notes: NoteRef[] }
export interface ProgressionAction { action: 'materialize' | 'edit' | 'transpose'; step?: number; root?: string; quality?: 'major' | 'minor'; positions?: { string: number; fret: number }[]; semitones?: number }
export type WorkspaceEntity = ScaleEntity | KeyEntity | ChordEntity | VoicingEntity | ProgressionEntity | NoteGroupEntity;
export interface TransitionRelation { id: string; kind: 'transition'; entity_ids: string[]; key_id: string }
export interface CompareRelation { id: string; kind: 'compare'; entity_ids: string[] }
export type ComparisonMode = 'highlight' | 'plain' | 'shared-only';
export interface BlockSettings { pattern?: 'I-V-vi-IV' | null; labels: 'notes' | 'intervals'; mode?: 'notes' | 'caged' | null; comparison?: ComparisonMode; fret_start: number | null; fret_end: number | null }
export type SourceRole = 'primary' | 'context' | 'highlight';
export interface WorkspaceBlock { id: string; kind: 'fretboard' | 'degree_strip' | 'chord_diagrams' | 'circle' | 'progression'; source_id: string; sources: string[]; source_roles?: Record<string, SourceRole> | null; settings: BlockSettings }
export interface ConceptWorkspace {
  schema_version: 2; version: number; title: string; provenance: 'scale-comparison' | 'physical-resolution' | 'four-chord-progression' | 'caged-exploration'; tuning: number[];
  entities: WorkspaceEntity[]; relations: (CompareRelation | TransitionRelation)[]; blocks: WorkspaceBlock[];
  composition: { items: { block_id: string; span: 4 | 6 | 8 | 12; priority: 'primary' | 'supporting' | 'reference' }[] }[];
}
export interface WorkspaceNote { note: string; degree: string; pitch_class: number; offset: number }
export interface WorkspacePosition extends WorkspaceNote { string: number; fret: number; midi: number }

export interface ExploreRecipe { id: string; title: string; question: string; description: string; search: string; starter: boolean; request: {recipe: ConceptWorkspace['provenance']; mode?: ScaleMode} }


// --- Uniform resolved model (spec #88 §5) --------------------------------------

export interface ResolvedEntityCore { id: string; label: string; notes: WorkspaceNote[]; positions: WorkspacePosition[]; tuning: number[] }
export interface ResolvedCagedRegion { shape: string; label: string; fret_start: number; fret_end: number; positions: WorkspacePosition[] }
export interface ResolvedScale extends ResolvedEntityCore { kind: 'scale' }
export interface ResolvedChord extends ResolvedEntityCore { kind: 'chord'; quality: string; cagedRegions?: ResolvedCagedRegion[] }
export interface ResolvedKey extends ResolvedEntityCore { kind: 'key'; circle: string[]; diatonicChords: { numeral: string; root: string; quality: string }[] }
export interface ResolvedVoicing extends ResolvedEntityCore { kind: 'voicing'; chord_id: string | null }
export interface ResolvedProgressionStep { chord_id: string | null; voicing_id: string | null; root: string; quality: string; function: string; positions: WorkspacePosition[]; tuning: number[] }
export interface ResolvedProgression extends ResolvedEntityCore { kind: 'progression'; derived: boolean; key_id: string; steps: ResolvedProgressionStep[] }
export interface ResolvedNoteGroup extends ResolvedEntityCore { kind: 'noteGroup' }
export type ResolvedEntity = ResolvedScale | ResolvedChord | ResolvedKey | ResolvedVoicing | ResolvedProgression | ResolvedNoteGroup;

export interface ResolvedMovement { string: number; before: WorkspacePosition | null; after: WorkspacePosition | null; kind: 'fixed' | 'moving' | 'added' | 'removed'; semitones: number | null }
export interface ResolvedCompareRelation { kind: 'compare'; entity_ids: string[]; shared: number[]; added: WorkspaceNote[]; removed: WorkspaceNote[] }
export interface ResolvedTransitionRelation { kind: 'transition'; entity_ids: string[]; key_id: string; label: string; functions: string[]; shared: number[]; added: number[]; removed: number[]; explanation: string; movement: ResolvedMovement[] }
export type ResolvedRelation = ResolvedCompareRelation | ResolvedTransitionRelation;

export interface Resolved { entities: Record<string, ResolvedEntity>; relations: Record<string, ResolvedRelation> }

export type TypedInspection =
  | { kind: 'pitch'; pitch_class: number }
  | { kind: 'chord'; root: number; quality: string }
  | { kind: 'chord'; entity_id: string }
  | { kind: 'voicing'; entity_id: string }
  | { kind: 'step'; block_id: string; index: number }
  | { kind: 'region' | 'region_note' | 'region_pair'; source_id: string; key: string };

export interface AdaptedComparison { shared: number[]; changed?: number[]; added?: number[]; removed?: number[] }
export interface AdaptedBlock {
  sources: ResolvedEntity[];
  relations: ResolvedRelation[];
  sourceRoles: Record<string, SourceRole>;
  comparison?: AdaptedComparison;
  conflicts: { tuningMismatch: string[]; skipped: string[] };
  settings: BlockSettings;
}
