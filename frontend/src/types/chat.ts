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
  api_requests?: ApiRequests;
}
