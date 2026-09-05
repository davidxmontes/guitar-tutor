import type { TabData } from './song';

export type ArtifactKind = 'song_study' | 'progression' | 'concept_study' | 'exercise';

export interface V2Branch {
  id: string;
  session_id: string;
  tutor_thread_id: string;
  current_artifact_kind: ArtifactKind | null;
  current_artifact_id: string | null;
  selection: Record<string, unknown> | null;
  focus: Record<string, unknown> | null;
  recent_ideas: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

export interface V2Session {
  id: string;
  user_id: string;
  branches: V2Branch[];
  created_at: string;
  updated_at: string;
}

export interface UpdateBranchRequest {
  current_artifact_kind?: ArtifactKind;
  current_artifact_id?: string;
  selection?: Record<string, unknown> | null;
  focus?: Record<string, unknown> | null;
  recent_ideas?: Record<string, unknown>[];
}

// --- SongStudy artifact (ticket #12) ---

export interface SongStudyTrack {
  index: number;
  name: string;
  instrument: string;
  tuning: number[] | null;
}

export interface SongSourceSection {
  label: string;
  start_measure: number;
  end_measure: number;
  source: 'tab' | 'chordpro';
}

export interface SongDerivedRange {
  start_measure: number;
  end_measure: number;
  section: string | null;
  lyrics: string[];
  broad_harmony: string[];
  detailed_harmony: string[];
  confidence: 'low' | 'medium' | 'high';
  provenance: 'ai';
}

export interface SongEnrichment {
  tab_fingerprint: string;
  chordpro_fingerprint: string | null;
  source_sections: SongSourceSection[];
  ranges: SongDerivedRange[];
  generated_at: string;
}

export interface SongShapeSource {
  measure_index: number;
  beat_index: number;
}

export interface SongShapeEvent {
  label: string | null;
  positions: Array<{ string: number; fret: number }>;
  tuning: number[];
  sources: SongShapeSource[];
}

export interface SongStudyPayload {
  song_id: number;
  artist: string;
  title: string;
  track: SongStudyTrack;
  tab_data: TabData;
  shape_events: SongShapeEvent[];
  chordpro: string | null;
  enrichment: SongEnrichment | null;
}

export interface Artifact {
  id: string;
  user_id: string;
  kind: ArtifactKind;
  title: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type SongStudyArtifact = Omit<Artifact, 'payload' | 'kind'> & {
  kind: 'song_study';
  payload: SongStudyPayload;
};

export interface CreateSongStudyRequest {
  session_id: string;
  branch_id: string;
  song_id: number;
  track_index: number;
}

// --- ConceptStudy artifact (ticket #21) ---

export type ConceptId =
  | 'major'
  | 'ionian'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'aeolian'
  | 'natural_minor'
  | 'locrian'
  | 'harmonic_minor'
  | 'melodic_minor'
  | 'pentatonic_major'
  | 'pentatonic_minor'
  | 'blues'
  | 'intervals';

export type ScaleConceptId = Exclude<ConceptId, 'intervals'>;

export interface ConceptNote {
  note: string;
  interval: string;
}

export interface ConceptPosition extends ConceptNote {
  string: number;
  fret: number;
}

export interface ConceptRelationship {
  id: string;
  label: string;
  explanation: string;
  notes: ConceptNote[];
  positions: ConceptPosition[];
}

interface ConceptPayloadBase {
  root: string;
  display_name: string;
  explanation: string;
  tuning: string[];
  fret_start: number;
  fret_end: number;
  overlay: 'notes' | 'intervals';
  positions: ConceptPosition[];
}

export interface ScaleStudyPayload extends ConceptPayloadBase {
  visualization: 'scale';
  concept_id: ScaleConceptId;
  notes: ConceptNote[];
  relationships: ConceptRelationship[];
  comparison_id: ScaleConceptId | null;
}

export interface StudyInterval {
  note: string;
  label: string;
  name: string;
  semitones: number;
}

export interface IntervalStudyPayload extends ConceptPayloadBase {
  visualization: 'interval';
  concept_id: 'intervals';
  selected_interval: number;
  intervals: StudyInterval[];
}

export type ConceptStudyPayload = ScaleStudyPayload | IntervalStudyPayload;

export interface StudyCatalogConcept {
  id: ConceptId;
  display_name: string;
  description: string;
  visualization: 'scale' | 'interval';
}

export interface StudyCatalogGroup {
  id: 'essentials' | 'explore_more' | 'systems';
  display_name: string;
  concepts: StudyCatalogConcept[];
}

export interface StudyCatalog {
  roots: string[];
  groups: StudyCatalogGroup[];
}

export type ConceptStudyArtifact = Omit<Artifact, 'payload' | 'kind'> & {
  kind: 'concept_study';
  payload: ConceptStudyPayload;
};

export interface CreateConceptStudyRequest {
  session_id: string;
  branch_id: string;
  root: string;
  concept_id: ConceptId;
  comparison_id?: ScaleConceptId | null;
  overlay?: 'notes' | 'intervals';
  selected_interval?: number;
  promotion: 'save' | 'work_on_this';
}

export interface StudyVisualizationRequest {
  root: string;
  concept_id: ConceptId;
  comparison_id?: ScaleConceptId | null;
  overlay?: 'notes' | 'intervals';
  selected_interval?: number;
}

export interface OpenConceptStudyResponse {
  artifact: ConceptStudyArtifact;
  branch: V2Branch;
}

export interface ConceptSuggestion {
  concept_id: ConceptId;
  root: string;
  label: string;
}

// Branch.selection/focus shapes this ticket writes/reads — a beat pick or a
// contiguous measure range, and a focused measure window. Stored as an
// opaque dict on the branch (hence the index signatures below, so these
// assign directly to UpdateBranchRequest's Record<string, unknown> fields);
// this is a frontend-only contract, not something the backend validates.
export type SongSelection = { [key: string]: unknown } & (
  | { type: 'beat'; measureIndex: number; beatIndex: number }
  | { type: 'range'; startMeasureIndex: number; endMeasureIndex: number }
);

export interface SongFocus {
  [key: string]: unknown;
  measureIndex: number;
  windowSize: number;
}

// --- Tutor (ticket #13) — mirrors backend/app/v2/tutor/contract.py. `focus`
// here is ephemeral cross-view attention the tutor expresses on a turn, not
// navigation state — never written into V2Branch.selection/focus above.

export interface TutorFretPosition {
  string: number;
  fret: number;
}

export interface TutorFocus {
  role: string;
  notes: TutorFretPosition[];
  label?: string | null;
}

export interface TutorUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
  uncached_input_tokens?: number | null;
  reasoning_tokens?: number | null;
}

// --- Progression (ticket #14). `voicing`/`tuning` are populated only when
// the backend's chord_service had a curated voicing for that root/quality --
// no entry is expected/normal, not an error; the diagram simply has nothing
// to draw for that chord.

export interface ProgressionVoicingPosition {
  string: number;
  fret: number;
}

export interface ProgressionFingering extends ProgressionVoicingPosition {
  finger: string | number;
  provenance: 'source' | 'suggested';
}

export interface ProgressionBarre {
  fret: number;
  fromString: number;
  toString: number;
}

export interface ProgressionChord {
  root: string;
  quality: string;
  voicing: ProgressionVoicingPosition[] | null;
  tuning: string | null;
  barre?: ProgressionBarre | null;
  fingering?: ProgressionFingering[];
}

export interface ProgressionPayload {
  title: string;
  chords: ProgressionChord[];
  inspired_by: Record<string, unknown> | null;
}

export type ProgressionArtifact = Omit<Artifact, 'payload' | 'kind'> & {
  kind: 'progression';
  payload: ProgressionPayload;
};

export interface TutorResponse {
  message: string;
  focus: TutorFocus | null;
  concept_suggestion?: ConceptSuggestion | null;
  candidates: ProgressionPayload[] | null;
  provider: string;
  model: string;
  latency_ms: number;
  usage: TutorUsage;
  tool_call_count: number;
  status: 'completed';
}

export interface TutorTurnRequest {
  session_id: string;
  branch_id: string;
  message: string;
}

export type TutorMessageRole = 'user' | 'assistant' | 'tool';

export interface TutorMessage {
  id: string;
  tutor_thread_id: string;
  role: TutorMessageRole;
  content: { text?: string; focus?: TutorFocus | null; concept_suggestion?: ConceptSuggestion | null; candidates?: ProgressionPayload[] | null; [key: string]: unknown };
  created_at: string;
}
