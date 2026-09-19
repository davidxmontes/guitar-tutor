import type { Composition } from './Composition';
import type { V2Branch } from '../types/v2';
import type { ResolvedNote, NoteLayer, VoicingValue, ChordRef } from '../types/music';

export type HarmonyView = 'tutor' | 'fretboard' | 'shapes' | 'triads' | 'caged' | 'circle' | 'scratch';
export const harmonyViews: [HarmonyView, string][] = [['tutor', "Tutor’s view"], ['fretboard', 'Fretboard'], ['shapes', 'Chord shapes'], ['triads', 'Triads'], ['caged', 'CAGED'], ['circle', 'Circle of fifths'], ['scratch', 'Scratch sequence']];
export type HarmonyResolved = {
  function: string | null;
  palette: (ChordRef & { numeral: string; display: string })[];
  degrees: { note: string; degree: string; pitch_class: number }[];
  circle: { home: string; home_key: string; keys: string[]; neighbours: string[] } | null;
  scale_positions: ResolvedNote[];
  chord_positions: ResolvedNote[];
  voicing_positions: ResolvedNote[];
  chord_notes: { note: string; degree: string }[];
  caged_regions: { shape: string; label: string; positions: ResolvedNote[] }[];
  voicings: (VoicingValue & { label: string })[];
  triads: (VoicingValue & { strings: number[]; inversion: number; bass: string; positions: ResolvedNote[] })[];
  scratch: (ChordRef & { id: string; voicing: VoicingValue | null })[];
  note_groups: NoteLayer[];
};
export type HarmonySurface = { branch: V2Branch; resolved: HarmonyResolved; composition: Composition;
  catalog: { roots: string[]; scales: Record<string, string>; circle_keys: string[]; qualities: string[] } };

export const harmonyModule = (kind: unknown) => kind === 'chord' || kind === 'voicing' ? 'chord' : 'scale';
export const physicalVoicing = (value: VoicingValue): VoicingValue => ({
  positions: value.positions.map(({ string, fret }) => ({ string, fret })), tuning: [...value.tuning],
});

// A physical shape has one position per string; array order is not musical identity.
export function samePositions(left: VoicingValue['positions'], right: VoicingValue['positions']): boolean {
  return left.length === right.length && left.every(note => right.some(other => note.string === other.string && note.fret === other.fret));
}

export function sameVoicing(left: VoicingValue, right: VoicingValue | null): boolean {
  return right !== null && left.tuning.length === right.tuning.length
    && left.tuning.every((note, index) => note === right.tuning[index])
    && samePositions(left.positions, right.positions);
}
