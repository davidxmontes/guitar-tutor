import type { Composition } from './Composition';
import type { ChordRef } from './harmony';
import type { ResolvedNote, VoicingValue } from './Fretboard';
import type { V2Branch } from '../types/v2';
export type ProgressionStep = ChordRef & { id: string; duration_beats: number; voicing: VoicingValue | null };
export type ProgressionIdea = { id: string; label: string; tonal_center: { root: string; scale: string } | null; tuning: number[]; chords: ProgressionStep[]; artifact_id: string | null; base_revision_id: string | null; dirty: boolean; provenance: Record<string, unknown> | null };
export type ProgressionFocus = { kind: 'step'; step_id: string } | { kind: 'transition'; from_step_id: string; to_step_id: string };
export type ProgressionResolved = { steps: (ProgressionStep & { positions: ResolvedNote[]; notes: { note: string; degree: string }[]; function: string | null; function_family: string | null; voicings: (VoicingValue & { label: string })[] })[]; transitions: { from_step_id: string; to_step_id: string; shared: number[]; shared_notes: string[]; leaving_notes: string[]; entering_notes: string[]; removed: number[]; added: number[]; assigned: boolean; movement: { string: number; kind: string; semitones: number | null }[] }[]; key_status: string };
export type ProgressionSurface = { branch: V2Branch; composition: Composition; resolved: Record<string, ProgressionResolved>; catalog: { roots: string[]; qualities: string[]; scales: Record<string,string> } };
