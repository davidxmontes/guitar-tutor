export type ScaleMode = 'major' | 'natural_minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian' | 'harmonic_minor' | 'melodic_minor' | 'pentatonic_major' | 'pentatonic_minor' | 'blues';
export interface ScaleEntity { id: string; kind: 'scale'; label?: string | null; root: string; mode: ScaleMode }
export interface KeyEntity { id: string; kind: 'key'; root: string; mode: 'major' }
export interface ChordEntity { id: string; kind: 'chord'; root: string; quality: string }
export interface VoicingEntity { id: string; kind: 'voicing'; label: string; chord_id: string | null; tuning: number[]; positions: { string: number; fret: number }[] }
export interface ProgressionEntity { id: string; kind: 'progression'; key_id: string; steps: { chord_id: string; voicing_id: string | null }[] }
export interface ProgressionAction { action: 'materialize' | 'edit' | 'transpose'; step?: number; root?: string; quality?: 'major' | 'minor'; positions?: { string: number; fret: number }[]; semitones?: number }
export type WorkspaceEntity = ScaleEntity | KeyEntity | ChordEntity | VoicingEntity | ProgressionEntity;
export interface TransitionRelation { id: string; kind: 'transition'; entity_ids: string[]; key_id: string }
export interface CompareRelation { id: string; kind: 'compare'; entity_ids: string[] }
export interface BlockSettings { pattern?: 'I-V-vi-IV' | null; labels: 'notes' | 'intervals'; shared_only: boolean; fret_start: number; fret_end: number }
export interface WorkspaceBlock { id: string; kind: 'fretboard' | 'degree_strip' | 'chord_diagrams' | 'circle' | 'progression' | 'caged'; source_id: string; settings: BlockSettings }
export interface ConceptWorkspace {
  schema_version: 1; version: number; title: string; provenance: 'scale-comparison' | 'physical-resolution' | 'four-chord-progression' | 'caged-exploration'; tuning: number[];
  entities: WorkspaceEntity[]; relations: (CompareRelation | TransitionRelation)[]; blocks: WorkspaceBlock[];
  composition: { items: { block_id: string; span: 4 | 6 | 8 | 12; priority: 'primary' | 'supporting' | 'reference' }[] }[];
}
export interface WorkspaceNote { note: string; degree: string; pitch_class: number; offset: number }
export interface WorkspacePosition extends WorkspaceNote { string: number; fret: number; midi: number }
export interface ResolvedWorkspace {
  caged: Record<string, { label: string; regions: (ResolvedWorkspace['voicings'][string] & { shape: string; fret_start: number; fret_end: number })[]; pairs: { key: string; shared: WorkspacePosition[]; movement: ResolvedWorkspace['transitions'][string]['movement'] }[] }>;
  scales: Record<string, { label: string; notes: WorkspaceNote[]; positions: WorkspacePosition[]; playback: WorkspacePosition[] }>;
  comparisons: Record<string, { shared: number[]; added: WorkspaceNote[]; removed: WorkspaceNote[] }>;
  progressions: Record<string, { label: string; derived: boolean; key_id: string; steps: { chord_id: string | null; voicing_id: string | null; root: string; quality: string; function: string; positions: WorkspacePosition[]; tuning: number[] }[] }>;
  keys: Record<string, { label: string; root: string; notes: WorkspaceNote[]; circle: string[] }>;
  chords: Record<string, { label: string; root: string; quality: string; notes: WorkspaceNote[] }>;
  voicings: Record<string, { label: string; chord_id: string | null; tuning: number[]; positions: WorkspacePosition[] }>;
  transitions: Record<string, { label: string; functions: string[]; shared: number[]; added: number[]; removed: number[]; explanation: string; movement: { string: number; before: WorkspacePosition | null; after: WorkspacePosition | null; kind: 'fixed' | 'moving' | 'added' | 'removed'; semitones: number | null }[] }>;
  block_sources: Record<WorkspaceBlock['kind'], (WorkspaceEntity['kind'] | 'compare' | 'transition')[]>;
}
export interface Inspection { source_id: string; kind: 'pitch' | 'chord' | 'voicing' | 'transition' | 'step' | 'region' | 'region_note' | 'region_pair'; key: number | string }
