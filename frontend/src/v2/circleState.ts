import type { CircleState, V2Branch } from '../types/v2';
import { apiClient } from '../api/client';

export function circleContext(branch: V2Branch): CircleState | undefined {
  const item = branch.recent_ideas.find(idea => idea.type === 'circle_study');
  return item as (CircleState & { type: string }) | undefined;
}

export async function rememberCircle(sessionId: string, branch: V2Branch, state: CircleState) {
  return apiClient.updateV2Branch(sessionId, branch.id, { recent_ideas: [...branch.recent_ideas.filter(idea => idea.type !== 'circle_study'), { type: 'circle_study', ...state }] });
}

