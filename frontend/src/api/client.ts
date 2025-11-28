import type { FretboardResponse, TuningsResponse, ScalesListResponse, ScaleResponse, ChordResponse, ChordQualitiesResponse } from '../types';
import type { AgentRequest, AgentResponse, ChatMessage } from '../types/chat';

const API_BASE_URL = 'http://localhost:8000/api';

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

  async chat(message: string, conversationHistory: ChatMessage[] = []): Promise<AgentResponse> {
    const request: AgentRequest = {
      message,
      conversation_history: conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    };

    return this.fetch<AgentResponse>('/agent/chat', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }
}

export const apiClient = new ApiClient();
