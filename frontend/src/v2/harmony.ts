import type { Composition } from './Composition';
import type { V2Branch } from '../types/v2';
import type { ResolvedNote, NoteLayer, VoicingValue } from './Fretboard';
export type ChordRef = { root: string; quality: string };
export type HarmonyResolved = {
  palette: (ChordRef & { numeral: string; display: string })[];
  degrees: { note: string; degree: string; pitch_class: number }[];
  circle: { home: string; keys: string[]; neighbours: string[] } | null;
  scale_positions: ResolvedNote[];
  chord_positions: ResolvedNote[];
  voicing_positions: ResolvedNote[];
  chord_notes: { note: string; degree: string }[];
  caged_regions: { shape: string; label: string; positions: ResolvedNote[] }[];
  voicings: (VoicingValue & { label: string })[];
  scratch: (ChordRef & { id: string; voicing: VoicingValue | null })[];
  note_groups: NoteLayer[];
};
export type HarmonySurface = { branch: V2Branch; resolved: HarmonyResolved; composition: Composition;
  catalog: { roots: string[]; scales: Record<string, string>; circle_keys: string[] } };
