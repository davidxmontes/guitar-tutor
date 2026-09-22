export interface SongVideoAnchor {
  measure_index: number;
  beat_index: number;
  edge: 'start' | 'end';
  video_seconds: number;
}

export interface SongVideoPassage {
  id: string;
  label: string;
  anchors: SongVideoAnchor[];
}

export interface SongVideoAlignment {
  video_id: string;
  recording_confirmed: boolean;
  timing_source?: 'songsterr' | 'estimated' | null;
  passages: SongVideoPassage[];
}

export interface SongVideoSuggestions {
  candidates: Array<{
    video_id: string;
    title: string;
    channel: string | null;
    kind: 'musicvideo' | 'alternative' | 'backing' | 'solo' | 'other';
    match_note: string;
    timing?: { source: 'songsterr' | 'estimated'; passages: SongVideoPassage[]; note: string } | null;
  }>;
  estimated_timing?: { source: 'estimated'; passages: SongVideoPassage[]; note: string } | null;
  score_duration_seconds: number | null;
  duration_note: string;
}
