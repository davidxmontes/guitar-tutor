import type { TabData } from './song';
import type { SongVideoAlignment } from './songVideo';
import type { ChordRef, NoteGroup, PhysicalPosition, TonalCenter, VoicingValue } from './music';

export type BlockSpec = {
  kind: string;
  subject?: unknown;
  config?: Record<string, unknown>;
  emphasis?: 'normal' | 'muted';
  size?: 'small' | 'medium' | 'large' | 'fill';
};
export type Composition = {
  pattern: 'hero-with-support' | 'comparison' | 'master-detail' | 'explanation-led' | 'stack' | 'split' | 'grid';
  size?: 'small' | 'medium' | 'large' | 'fill';
  slots: Record<string, (BlockSpec | Composition)[]>;
  focal: string;
  per_block_config?: Record<string, Record<string, unknown>>;
};

export type ArtifactKind = 'song_study' | 'progression' | 'exercise';
export type WorkspaceKind = 'harmony' | 'progression';

// Persisted state mirrors backend/app/v2/{harmony,progression}_state.py.
export type ShapeFocus = { kind: 'shape'; positions: PhysicalPosition[]; interpretation: ChordRef | null };
export type HarmonyFocus =
  | { kind: 'scale' }
  | { kind: 'degree'; degree: number }
  | { kind: 'chord'; chord: ChordRef }
  | { kind: 'voicing'; chord: ChordRef; voicing: VoicingValue }
  | ShapeFocus;
export type ScratchChord = ChordRef & { id: string };
export type PinnedVoicing = { chord: ChordRef; voicing: VoicingValue };
export type Provenance =
  | { kind: 'concept-seed'; concept: string; prompt?: string | null }
  | { kind: 'harmony-develop'; scratch: ScratchChord[]; tonal_center: TonalCenter | null }
  | { kind: 'song-idea'; song: Record<string, unknown> };

export interface HarmonyExploration {
  tonal_center: TonalCenter | null;
  tuning: number[];
  scratch: ScratchChord[];
  focus: HarmonyFocus;
  pinned_voicings: PinnedVoicing[];
  kept_note_groups: NoteGroup[];
  provenance: Provenance | null;
}

export type ProgressionStep = ChordRef & { id: string; duration_beats: number; voicing: VoicingValue | null };
export type ProgressionFocus = { kind: 'step'; step_id: string } | { kind: 'transition'; from_step_id: string; to_step_id: string };
export interface ProgressionIdea {
  id: string;
  label: string;
  tonal_center: TonalCenter | null;
  tuning: number[];
  chords: ProgressionStep[];
  kept_note_groups: NoteGroup[];
  artifact_id: string | null;
  base_revision_id: string | null;
  dirty: boolean;
  provenance: Provenance | null;
}

export interface ProgressionWorkspaceState {
  ideas: ProgressionIdea[];
  active_idea_id: string | null;
  focus: ProgressionFocus | null;
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

// --- SongStudy artifact ---

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
  positions: PhysicalPosition[];
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
  video_alignment?: SongVideoAlignment | null;
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

// --- Tutor turns and background jobs ---

export interface BranchFocusGroup {
  branch_id: string;
  branch_title: string;
  label: string;
  notes: PhysicalPosition[];
  tuning: number[];
}

export interface TutorAttention {
  role: string;
  notes: PhysicalPosition[];
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
  payload: { title: string } & Pick<ProgressionIdea, 'tonal_center' | 'tuning' | 'chords' | 'provenance'>;
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

export interface SongTutorContext { artifact_id: string; selection: SongSelection }

export interface TutorTurnRequest {
  web_search?: boolean;
  song_context?: SongTutorContext;
  request_id?: string;
  session_id: string;
  branch_id: string;
  message: string;
  learning_preferences?: LearningPreferences;
}

export type LearningPreferences = { level: 'beginner' | 'intermediate'; style: 'balanced' | 'explain' | 'practice'; minutes: 5 | 10 | 20 };

export type TutorMessageRole = 'user' | 'assistant' | 'tool';

export interface TutorMessage {
  id: string;
  tutor_thread_id: string;
  role: TutorMessageRole;
  content: {
    text?: string;
    song_context?: SongTutorContext & { title: string; track: { name: string }; web_search_error?: string; web_sources?: { title: string; url: string; content: string }[] };
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
  positions: PhysicalPosition[];
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
  payload: ExerciseDraft & { created_from: { artifact_id: string; title: string; kind: ArtifactKind; selection: Record<string, unknown> | null } | { kind: 'progression'; idea: ProgressionIdea } };
};

// Song view navigation is local to the artifact viewer, never Branch focus.
export type SongSelection = { [key: string]: unknown } & (
  | { type: 'beat'; measureIndex: number; beatIndex: number }
  | { type: 'range'; startMeasureIndex: number; endMeasureIndex: number }
);
export interface SongFocus { measureIndex: number; windowSize: number }

export interface TutorJob {
  web_search?: boolean;
  song_context?: SongTutorContext | null;
  id: string;
  message: string;
  status: 'running' | 'completed' | 'failed';
  result: TutorResponse | null;
  error: string | null;
}
