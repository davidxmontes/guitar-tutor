import type { Composition } from './Composition';
import type { ProgressionStep, V2Branch } from '../types/v2';
import type { ResolvedNote, VoicingValue } from '../types/music';
export type ProgressionResolved = { steps: (ProgressionStep & { positions: ResolvedNote[]; notes: { note: string; degree: string }[]; function: string | null; function_family: string | null; voicings: (VoicingValue & { label: string })[] })[]; transitions: { from_step_id: string; to_step_id: string; shared: number[]; shared_notes: string[]; leaving_notes: string[]; entering_notes: string[]; removed: number[]; added: number[]; assigned: boolean; movement: { string: number; kind: string; semitones: number | null }[] }[]; key_status: string };
export type ProgressionSurface = { branch: V2Branch; composition: Composition; resolved: Record<string, ProgressionResolved>; catalog: { roots: string[]; qualities: string[]; scales: Record<string,string> } };
