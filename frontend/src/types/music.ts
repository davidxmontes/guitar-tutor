// Shared musical values. Rendering, playback and wire models use the same
// physical coordinates; the backend validates ranges and derives note spelling.
export type PhysicalPosition = { string: number; fret: number };
export type VoicingValue = { positions: PhysicalPosition[]; tuning: number[] };
export type ChordRef = { root: string; quality: string };
export type TonalCenter = { root: string; scale: string };
export type ResolvedNote = PhysicalPosition & {
  note: string;
  degree?: string;
  midi?: number;
  pitch_class?: number;
};
export type NoteLayer = { id: string; label: string; positions: ResolvedNote[]; focal?: boolean };
export type NoteGroup = {
  id: string;
  kind: 'noteGroup';
  label: string;
  notes: ({ pitch_class: number } | PhysicalPosition)[];
};
