import type { ConceptWorkspace, TypedInspection } from './conceptWorkspace';
import type { TabData } from './song';

export type ArtifactKind = 'song_study' | 'progression' | 'concept_study' | 'exercise';

export interface V2Branch {
  id: string;
  session_id: string;
  tutor_thread_id: string;
  title: string;
  current_artifact_kind: ArtifactKind | null;
  current_artifact_id: string | null;
  working_draft?: ConceptWorkspace | null;
  saved_artifact_revision?: string | null;
  selection: Record<string, unknown> | null;
  focus: Record<string, unknown> | null;
  recent_ideas: Record<string, unknown>[];
  fork_context: Record<string, unknown> | null;
  closed: boolean;
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
  title?: string;
  current_artifact_kind?: ArtifactKind;
  current_artifact_id?: string;
  selection?: Record<string, unknown> | null;
  focus?: Record<string, unknown> | null;
  recent_ideas?: Record<string, unknown>[];
  closed?: boolean;
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

export interface SongSavedRange { label: string; start_measure: number; end_measure: number }

export interface SongDerivedRange {
  start_measure: number;
  end_measure: number;
  section: string | null;
  lyrics: string[];
  broad_harmony: string[];
  detailed_harmony: string[];
  confidence: 'low' | 'medium' | 'high';
  provenance: 'ai';
  kind?: 'section' | 'phrase' | 'transition';
  repeat_group?: string | null;
  annotation?: string | null;
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
  saved_ranges?: SongSavedRange[];
}

export interface ArtifactRevision { revision: string; current: boolean }
export type LibraryItem = Omit<Artifact, 'payload'> & { is_concept_workspace?: boolean; provenance: Record<string, unknown> | null };

export interface Artifact {
  id: string;
  user_id: string;
  kind: ArtifactKind;
  title: string;
  payload: Record<string, unknown>;
  saved_at?: string | null;
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

// Supported concept tangents open fresh ConceptWorkspace drafts.

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
  | 'caged' | 'circle' | 'chord_major' | 'chord_minor';

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

export interface BranchFocusGroup {
  branch_id: string;
  branch_title: string;
  label: string;
  notes: TutorFretPosition[];
  tuning: number[];
}

export interface TutorFocus {
  role: string;
  notes: TutorFretPosition[];
  label?: string | null;
  groups?: BranchFocusGroup[];
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
  tuning: string | number[] | null;
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

export interface OpenProgressionResponse {
  source_branch?: V2Branch | null;
  artifact: ProgressionArtifact;
  branch: V2Branch;
}

export interface VoicingProposal {
  label: string;
  artifact_id: string;
  expected_updated_at: string;
  chord_index: number;
  chord: ProgressionChord;
}

export interface WorkspaceChange { status: 'applied' | 'rejected' | 'unchanged' | 'undone' | 'restored'; reason?: string | null; undo_of?: string }
export interface WorkspaceTurnResult extends WorkspaceChange { message_id: string; branch: V2Branch }

export interface TutorResponse {
  workspace_result?: WorkspaceTurnResult | null;
  message: string;
  focus: TutorFocus | null;
  concept_suggestion?: ConceptSuggestion | null;
  candidates: ProgressionPayload[] | null;
  exercise_suggestion?: ExerciseProposal | null;
  voicing_candidates?: VoicingProposal[] | null;
  provider: string;
  model: string;
  latency_ms: number;
  usage: TutorUsage;
  tool_call_count: number;
  status: 'completed';
}

export interface TutorTurnRequest {
  inspection?: TypedInspection | null;
  session_id: string;
  branch_id: string;
  message: string;
}

export type TutorMessageRole = 'user' | 'assistant' | 'tool';

export interface TutorMessage {
  id: string;
  tutor_thread_id: string;
  role: TutorMessageRole;
  content: { workspace_after?: ConceptWorkspace | null; workspace_change?: WorkspaceChange; exercise_suggestion?: ExerciseProposal | null; voicing_candidates?: VoicingProposal[] | null; text?: string; focus?: TutorFocus | null; concept_suggestion?: ConceptSuggestion | null; candidates?: ProgressionPayload[] | null; [key: string]: unknown };
  created_at: string;
}

export interface ExerciseStep {
  label: string;
  beats: number;
  positions: { string: number; fret: number }[];
  tuning: number[];
}
export interface ExerciseDraft {
  title: string;
  intent: string;
  tempo: number;
  steps: ExerciseStep[];
}
export interface ExerciseProposal extends ExerciseDraft {
  source_artifact_id: string;
  expected_updated_at: string;
  source_selection: Record<string, unknown> | null;
}
export type ExerciseArtifact = Omit<Artifact, 'kind' | 'payload'> & {
  kind: 'exercise';
  payload: ExerciseDraft & { created_from: { artifact_id: string; title: string; kind: ArtifactKind; selection: Record<string, unknown> | null } };
};
