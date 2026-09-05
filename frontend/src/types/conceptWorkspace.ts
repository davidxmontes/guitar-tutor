export type ScaleMode = 'major' | 'natural_minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian' | 'harmonic_minor' | 'melodic_minor' | 'pentatonic_major' | 'pentatonic_minor' | 'blues';
export interface ScaleEntity { id: string; kind: 'scale'; label?: string | null; root: string; mode: ScaleMode }
export interface KeyEntity { id: string; kind: 'key'; root: string; mode: 'major' }
export interface ChordEntity { id: string; kind: 'chord'; root: string; quality: string }
export interface VoicingEntity { id: string; kind: 'voicing'; label: string; chord_id: string | null; tuning: number[]; positions: { string: number; fret: number }[] }
export type WorkspaceEntity = ScaleEntity | KeyEntity | ChordEntity | VoicingEntity;
export interface TransitionRelation { id: string; kind: 'transition'; entity_ids: string[]; key_id: string }
export interface CompareRelation { id: string; kind: 'compare'; entity_ids: string[] }
export interface BlockSettings { labels: 'notes' | 'intervals'; shared_only: boolean; fret_start: number; fret_end: number }
export interface WorkspaceBlock { id: string; kind: 'fretboard' | 'degree_strip' | 'chord_diagrams' | 'circle'; source_id: string; settings: BlockSettings }
export interface ConceptWorkspace {
  schema_version: 1; version: number; title: string; provenance: 'scale-comparison' | 'physical-resolution'; tuning: number[];
  entities: WorkspaceEntity[]; relations: (CompareRelation | TransitionRelation)[]; blocks: WorkspaceBlock[];
  composition: { items: { block_id: string; span: 4 | 6 | 8 | 12; priority: 'primary' | 'supporting' | 'reference' }[] }[];
}
export interface WorkspaceNote { note: string; degree: string; pitch_class: number; offset: number }
export interface WorkspacePosition extends WorkspaceNote { string: number; fret: number; midi: number }
export interface ResolvedWorkspace {
  scales: Record<string, { label: string; notes: WorkspaceNote[]; positions: WorkspacePosition[]; playback: WorkspacePosition[] }>;
  comparisons: Record<string, { shared: number[]; added: WorkspaceNote[]; removed: WorkspaceNote[] }>;
  keys: Record<string, { label: string; root: string; notes: WorkspaceNote[]; circle: string[] }>;
  chords: Record<string, { label: string; root: string; quality: string; notes: WorkspaceNote[] }>;
  voicings: Record<string, { label: string; chord_id: string | null; tuning: number[]; positions: WorkspacePosition[] }>;
  transitions: Record<string, { label: string; functions: string[]; shared: number[]; added: number[]; removed: number[]; explanation: string; movement: { string: number; before: WorkspacePosition | null; after: WorkspacePosition | null; kind: 'fixed' | 'moving' | 'added' | 'removed'; semitones: number | null }[] }>;
  block_sources: Record<WorkspaceBlock['kind'], (WorkspaceEntity['kind'] | 'compare' | 'transition')[]>;
}
export interface Inspection { source_id: string; kind: 'pitch' | 'chord' | 'voicing' | 'transition'; key: number | string }
