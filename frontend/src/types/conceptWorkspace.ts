export type ScaleMode = 'major' | 'natural_minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian' | 'harmonic_minor' | 'melodic_minor' | 'pentatonic_major' | 'pentatonic_minor' | 'blues';
export interface ScaleEntity { id: string; kind: 'scale'; root: string; mode: ScaleMode }
export interface CompareRelation { id: string; kind: 'compare'; entity_ids: string[] }
export interface BlockSettings { labels: 'notes' | 'intervals'; shared_only: boolean; fret_start: number; fret_end: number }
export interface WorkspaceBlock { id: string; kind: 'fretboard' | 'degree_strip'; source_id: string; settings: BlockSettings }
export interface ConceptWorkspace {
  schema_version: 1; version: number; title: string; provenance: 'scale-comparison'; tuning: number[];
  entities: ScaleEntity[]; relations: CompareRelation[]; blocks: WorkspaceBlock[];
  composition: { items: { block_id: string; span: 4 | 6 | 8 | 12; priority: 'primary' | 'supporting' | 'reference' }[] }[];
}
export interface WorkspaceNote { note: string; degree: string; pitch_class: number; offset: number }
export interface WorkspacePosition extends WorkspaceNote { string: number; fret: number; midi: number }
export interface ResolvedWorkspace {
  scales: Record<string, { label: string; notes: WorkspaceNote[]; positions: WorkspacePosition[]; playback: WorkspacePosition[] }>;
  comparisons: Record<string, { shared: number[]; added: WorkspaceNote[]; removed: WorkspaceNote[] }>;
  block_sources: Record<WorkspaceBlock['kind'], ('scale' | 'compare')[]>;
}
export interface Inspection { source_id: string; kind: 'pitch'; key: number }
