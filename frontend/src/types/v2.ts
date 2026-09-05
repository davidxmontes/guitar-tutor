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

export interface SongStudyPayload {
  song_id: number;
  artist: string;
  title: string;
  track: SongStudyTrack;
  tab_data: TabData;
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
  | 'pentatonic_minor'
  | 'major_triad'
  | 'minor_triad'
  | 'perfect_fifth'
  | 'dominant_resolution';

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

export interface ConceptStudyPayload {
  concept_id: ConceptId;
  root: string;
  display_name: string;
  explanation: string;
  tuning: string[];
  fret_start: number;
  fret_end: number;
  notes: ConceptNote[];
  positions: ConceptPosition[];
  relationships: ConceptRelationship[];
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
  open_in_new_branch?: boolean;
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

export interface ProgressionChord {
  root: string;
  quality: string;
  voicing: ProgressionVoicingPosition[] | null;
  tuning: string | null;
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
