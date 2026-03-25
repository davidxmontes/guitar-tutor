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
}

// API request/response types (matches backend schemas)
export interface AgentMessageRequest {
  role: string;
  content: string;
}

export interface AgentRequest {
  message: string;
  conversation_history: AgentMessageRequest[];
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
}

export interface ResumeRequest {
  response: string;  // User's answer to clarifying question
  thread_id: string;
}

// SSE wire-format event types (matches backend stream endpoints)
export type SseEvent =
  | { event: 'status';    data: { node: string } }
  | { event: 'token';     data: { text: string } }
  | { event: 'interrupt'; data: { clarifying_question?: string; action?: string } }
  | { event: 'answer';    data: AgentResponse }
  | { event: 'error';     data: { detail: string } }
  | { event: 'done';      data: Record<string, never> };
