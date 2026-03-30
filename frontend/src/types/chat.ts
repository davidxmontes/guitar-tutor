// Chat message structure
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  // Agent metadata (from response)
  scale?: string | null;
  chordChoices?: string[];
  visualizations?: boolean;
  outOfScope?: boolean;
  interrupted?: boolean;  // True if agent is waiting for clarification
  interruptData?: {
    clarifying_question?: string;
    action?: string;
  } | null;
  // Parsed API requests from backend
  apiRequests?: ApiRequests | null;
  // New action/memory metadata
  actions?: AgentAction[];
  memoryStatus?: MemoryStatus;
}

// API request/response types (matches backend schemas)
export interface AgentMessageRequest {
  role: string;
  content: string;
}

export interface UiScaleContext {
  root?: string | null;
  mode?: string | null;
}

export interface UiChordContext {
  root?: string | null;
  quality?: string | null;
}

export interface UiSongContext {
  song_id?: number | null;
  artist?: string | null;
  title?: string | null;
  has_chords?: boolean | null;
}

export interface UiHighlightedNote {
  string: number;
  fret: number;
}

export interface UiContext {
  app_mode?: 'scale' | 'chord' | 'song';
  display_mode?: 'notes' | 'intervals';
  selected_tuning?: string;
  custom_tuning_notes?: string[] | null;
  selected_scale?: UiScaleContext | null;
  selected_chord?: UiChordContext | null;
  selected_song?: UiSongContext | null;
  selected_track_index?: number;
  song_view_mode?: 'tab' | 'chords';
  playhead_measure_index?: number;
  selected_beat_id?: string | null;
  highlighted_notes?: UiHighlightedNote[];
}

export interface AgentRequest {
  message: string;
  conversation_history?: AgentMessageRequest[]; // Deprecated fallback
  bootstrap_history?: AgentMessageRequest[];
  require_existing_thread?: boolean;
  ui_context?: UiContext;
  thread_id?: string;  // For conversation tracking and interrupts
}

export interface ChordApiRequest {
  root: string;
  quality: string;
}

export interface ScaleApiRequest {
  root: string;
  mode: string;
}

export interface ApiRequests {
  chords: ChordApiRequest[];
  scale: ScaleApiRequest | null;
}

export type MemoryStatus = 'restored' | 'bootstrapped' | 'fresh';

export type SongSearchAction = {
  type: 'song.search';
  query: string;
};

export type SongSelectAction = {
  type: 'song.select';
  song_id: number;
};

export type SongTrackSelectAction = {
  type: 'song.track.select';
  track_index: number;
};

export type SongMeasureFocusAction = {
  type: 'song.measure.focus';
  measure_index: number;
  beat_index?: number;
};

export type TheoryShowChordAction = {
  type: 'theory.show_chord';
  root: string;
  quality: string;
};

export type TheoryShowScaleAction = {
  type: 'theory.show_scale';
  root: string;
  mode: string;
};

export type AgentAction =
  | SongSearchAction
  | SongSelectAction
  | SongTrackSelectAction
  | SongMeasureFocusAction
  | TheoryShowChordAction
  | TheoryShowScaleAction;

export interface AgentResponse {
  answer: string;
  scale: string | null;
  chord_choices: string[];
  visualizations: boolean;
  out_of_scope: boolean;
  interrupted: boolean;  // True if agent needs clarification
  interrupt_data?: {
    clarifying_question?: string;
    action?: string;
  } | null;
  api_requests?: ApiRequests;
  actions?: AgentAction[];
  memory_status?: MemoryStatus;
}

export interface ResumeRequest {
  response: string;  // User's answer to clarifying question
  thread_id: string;
  ui_context?: UiContext;
}

// SSE wire-format event types (matches backend stream endpoints)
export type SseEvent =
  | { event: 'status';    data: { node: string } }
  | { event: 'token';     data: { text: string } }
  | { event: 'interrupt'; data: { clarifying_question?: string; action?: string } }
  | { event: 'answer';    data: AgentResponse }
  | { event: 'error';     data: { detail: string; code?: string; thread_id?: string } }
  | { event: 'done';      data: Record<string, never> };
