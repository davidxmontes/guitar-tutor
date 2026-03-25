import type { FretboardResponse, TuningsResponse, ScalesListResponse, ScaleResponse, ChordResponse, ChordQualitiesResponse } from '../types';
import type { AgentRequest, AgentResponse, ChatMessage, ResumeRequest, SseEvent } from '../types/chat';

// Read base URL from Vite env at build-time (VITE_API_BASE_URL).
// Use a relative URL by default so the browser calls the same origin (/api) and
// nginx can proxy requests to the backend service in docker-compose.
const API_BASE_URL = (import.meta.env as any).VITE_API_BASE_URL ?? '/api';

// Human-readable labels for LangGraph node names emitted by the backend.
export function nodeLabel(node: string): string {
  const labels: Record<string, string> = {
    prepare_question: 'Preparing...',
    clarify:          'Thinking...',
    generate_answer:  'Generating answer...',
  };
  return labels[node] ?? 'Thinking...';
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Parses an SSE ReadableStream into typed SseEvent objects.
  private async *_parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!; // keep the incomplete trailing line

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            yield { event: currentEvent, data } as SseEvent;
            currentEvent = '';
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Sends a POST request to an SSE endpoint and resolves with the final AgentResponse.
  // Calls onStatus for intermediate status events and onToken for streamed text tokens.
  private async _runStream(
    endpoint: string,
    body: object,
    onStatus?: (node: string) => void,
    onToken?: (text: string) => void,
  ): Promise<AgentResponse> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    if (!response.body) {
      throw new Error('No response body from stream endpoint');
    }

    for await (const event of this._parseSseStream(response.body)) {
      if (event.event === 'status') {
        onStatus?.(event.data.node);
      } else if (event.event === 'token') {
        onToken?.(event.data.text);
      } else if (event.event === 'interrupt') {
        return {
          answer: '',
          scale: null,
          chord_choices: [],
          visualizations: false,
          out_of_scope: false,
          interrupted: true,
          interrupt_data: event.data,
        };
      } else if (event.event === 'answer') {
        return event.data;
      } else if (event.event === 'error') {
        throw new Error(event.data.detail);
      }
      // 'done' — stream finished normally after 'answer', nothing to do
    }

    throw new Error('Stream ended without an answer event');
  }

  async getFretboard(tuning: string = 'standard'): Promise<FretboardResponse> {
    return this.fetch<FretboardResponse>(`/fretboard?tuning=${tuning}`);
  }

  async getTunings(): Promise<TuningsResponse> {
    return this.fetch<TuningsResponse>('/tunings');
  }

  async getScalesList(): Promise<ScalesListResponse> {
    return this.fetch<ScalesListResponse>('/scales');
  }

  async getScale(root: string, mode: string, tuning: string = 'standard'): Promise<ScaleResponse> {
    return this.fetch<ScaleResponse>(`/scales/${encodeURIComponent(root)}/${encodeURIComponent(mode)}?tuning=${tuning}`);
  }

  async getChordQualities(): Promise<ChordQualitiesResponse> {
    return this.fetch<ChordQualitiesResponse>('/chords/qualities');
  }

  async getChord(root: string, quality: string): Promise<ChordResponse> {
    return this.fetch<ChordResponse>(`/chords/${encodeURIComponent(root)}/${encodeURIComponent(quality)}`);
  }

  async streamChat(
    message: string,
    conversationHistory: ChatMessage[] = [],
    threadId: string = 'default',
    onStatus?: (node: string) => void,
    onToken?: (text: string) => void,
  ): Promise<AgentResponse> {
    const request: AgentRequest = {
      message,
      conversation_history: conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      thread_id: threadId,
    };
    return this._runStream('/agent/chat/stream', request, onStatus, onToken);
  }

  async streamResume(
    response: string,
    threadId: string = 'default',
    onStatus?: (node: string) => void,
    onToken?: (text: string) => void,
  ): Promise<AgentResponse> {
    const request: ResumeRequest = { response, thread_id: threadId };
    return this._runStream('/agent/resume/stream', request, onStatus, onToken);
  }
}

export const apiClient = new ApiClient();
