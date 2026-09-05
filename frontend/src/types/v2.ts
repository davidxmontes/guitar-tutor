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
  selection?: Record<string, unknown>;
  focus?: Record<string, unknown>;
  recent_ideas?: Record<string, unknown>[];
}
