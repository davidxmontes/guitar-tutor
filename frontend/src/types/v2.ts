import type { Composition } from '../v2/Composition';
import type { TabData } from './song';

export type ArtifactKind = 'song_study' | 'progression' | 'exercise';
export type WorkspaceKind = 'harmony' | 'progression';

// Branch state (Spec #100 §5.1). Ticket #101 hard cutover: the old
// concept_study / working_draft / selection / focus / recent_ideas /
// fork_context fields are gone. HarmonyExploration (H1) and
// ProgressionWorkspaceState (P1) internals are intentionally loose here.
export interface HarmonyExploration {
  tonal_center: Record<string, unknown> | null;
  tuning: number[];
  scratch: Record<string, unknown>[];
  focus: Record<string, unknown>;
  pinned_voicings: Record<string, unknown>[];
  kept_note_groups: Record<string, unknown>[];
  provenance: Record<string, unknown> | null;
}

export interface ProgressionWorkspaceState {
  ideas: import('../v2/progression').ProgressionIdea[];
  active_idea_id: string | null;
  focus: import('../v2/progression').ProgressionFocus | null;
}

export interface V2Branch {
  id: string;
  session_id: string;
  tutor_thread_id: string;
  title: string;
  harmony_exploration: HarmonyExploration | null;
  progression_workspace: ProgressionWorkspaceState | null;
  active_workspace: WorkspaceKind;
  live_presentation_turn_id: string | null;
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

export interface CreateBranchRequest {
  title?: string;
}

export interface UpdateBranchRequest {
  title?: string;
  active_workspace?: WorkspaceKind;
  live_presentation_turn_id?: string | null;
  closed?: boolean;
}

// --- SongStudy artifact (backend kind retained; frontend surface is rebuilt later) ---

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
export type LibraryItem = Omit<Artifact, 'payload'> & { provenance: Record<string, unknown> | null };

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

// --- Tutor (stateless message turn — full contract is ticket T3, Spec §5.7) ---

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

export interface TutorAttention {
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

export type ProgressionArtifact = Omit<Artifact, 'payload' | 'kind'> & {
  kind: 'progression';
  payload: { title: string } & Pick<import('../v2/progression').ProgressionIdea, 'tonal_center' | 'tuning' | 'chords' | 'provenance'>;
};

export interface TutorResponse {
  message: string;
  focus: Record<string, unknown> | null;
  attention: TutorAttention | null;
  mutation: ({ kind: 'noop' | 'set_tonal_center' | 'set_scale' | 'set_tuning' | 'scratch_add' | 'scratch_remove' | 'scratch_reorder' | 'add_kept_note_group' | 'progression_add' | 'progression_remove' | 'progression_reorder' | 'progression_edit' | 'set_duration' | 'assign_step_voicing' | 'transpose' } & Record<string, unknown>) | null;
  presentation: Composition | null;
  presentation_applied: boolean;
  branch: V2Branch | null;
  comparison_groups?: BranchFocusGroup[];
  candidates: { candidate_kind: 'voicing' | 'progression-idea' | 'chord-replacement'; candidates: Record<string, unknown>[] } | null;
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
  content: {
    text?: string;
    comparison_groups?: BranchFocusGroup[];
    candidates?: TutorResponse['candidates'];
    presentation?: Composition;
    [key: string]: unknown;
  };
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
