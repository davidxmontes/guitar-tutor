// --- Song search ---

export interface TrackSummary {
  index: number;
  name: string;
  instrument: string;
  is_vocal: boolean;
  is_empty: boolean;
  tuning: number[] | null;
}

export interface SongSearchResult {
  song_id: number;
  artist: string;
  title: string;
  has_chords: boolean;
  tracks: TrackSummary[];
}

export interface SongSearchResponse {
  results: SongSearchResult[];
}

// --- Song tracks ---

export interface SongTracksResponse {
  song_id: number;
  artist: string;
  title: string;
  tracks: TrackSummary[];
}

// --- Tab data ---

export interface TabNote {
  string: number;
  fret: number;
  rest?: boolean;
  dead?: boolean;
  ghost?: boolean;
  slide?: boolean;
  bend?: boolean;
  hp?: boolean;
  vibrato?: boolean;
  harmonic?: boolean;
  staccato?: boolean;
  accentuated?: boolean;
}

export interface TabBeat {
  notes: TabNote[];
  chord?: { text: string };
  pickStroke?: 'up' | 'down';
  letRing?: boolean;
  palmMute?: boolean;
  downStroke?: boolean;
  upStroke?: boolean;
}

export interface TabMeasure {
  voices: Array<{ beats: TabBeat[] }>;
  marker?: { text: string };
  header?: {
    timeSignature?: {
      numerator?: number;
      denominator?: number;
    };
  };
}

export interface TabData {
  measures: TabMeasure[];
  tuning?: number[];
  name?: string;
  automations?: { tempo?: Array<{ bpm: number }> };
  newLyrics?: Array<{ text: string }>;
}

export interface TabDataResponse {
  song_id: number;
  artist: string;
  title: string;
  track_name: string;
  tab_data: TabData;
}

// --- ChordPro ---

export interface ChordProResponse {
  song_id: number;
  artist: string;
  title: string;
  chordpro: string;
}

// --- Highlighted notes for fretboard bridge ---

export interface HighlightedNote {
  string: number;
  fret: number;
}
