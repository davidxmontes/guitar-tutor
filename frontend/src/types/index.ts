// Note position on the fretboard
export interface NotePosition {
  string: number;  // 1-6 (1 = high E, 6 = low E)
  fret: number;    // 0-22 (0 = open string)
  note: string;    // Note name, e.g., "C", "F#", "Bb"
}

// Response from /api/fretboard
export interface FretboardResponse {
  tuning: string;
  tuning_notes: string[];
  strings: NotePosition[][];  // 6 strings, each with 23 positions
  fret_count: number;
}

// Tuning information
export interface TuningInfo {
  id: string;
  name: string;
  notes: string[];
}

// Response from /api/tunings
export interface TuningsResponse {
  tunings: TuningInfo[];
}

// Scale information
export interface ScaleInfo {
  id: string;
  name: string;
}

export interface ScaleCategory {
  category: string;
  scales: ScaleInfo[];
}

export interface ScalesListResponse {
  scales: ScaleCategory[];
}

// Diatonic chord
export interface DiatonicChord {
  numeral: string;    // e.g., "I", "ii", "IV"
  root: string;       // Root note, e.g., "C"
  quality: string;    // "major", "minor", "diminished"
  display: string;    // Display name, e.g., "C", "Dm"
}

// Scale note position with scale info
export interface ScaleNotePosition {
  string: number;
  fret: number;
  note: string;
  is_root: boolean;
  degree: number;       // 1-7
  degree_label: string; // "1", "b3", etc.
}

// Response from /api/scales/{root}/{mode}
export interface ScaleResponse {
  root: string;
  mode: string;
  scale_notes: string[];
  positions: ScaleNotePosition[];
  diatonic_chords: DiatonicChord[];
}

// Position within a chord voicing
export interface ChordVoicingPosition {
  string: number;
  fret: number;
  note: string;
  interval: string;  // "1", "3", "5", "b3", etc.
  is_root: boolean;
}

// A single chord voicing
export interface ChordVoicing {
  label: string;
  name: string;
  color: string;
  base_fret: number;
  min_fret: number;
  max_fret: number;
  positions: ChordVoicingPosition[];
}

// Response from /api/chords/{root}/{quality}
export interface ChordResponse {
  root: string;
  quality: string;
  display_name: string;
  chord_notes: string[];
  voicings: ChordVoicing[];
}

// Chord quality info
export interface ChordQualityInfo {
  id: string;
  name: string;
}

export interface ChordQualitiesResponse {
  qualities: ChordQualityInfo[];
}

// App modes
export type AppMode = 'scale' | 'chord' | 'song';

// Display mode for notes
export type DisplayMode = 'notes' | 'intervals';

// Song types
export * from './song';
