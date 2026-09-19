import { createContext, useContext } from 'react';
import type { ChordRef } from './harmony';
import type { VoicingValue } from './Fretboard';
export type MusicalIntent =
  | { type: 'tonal-center'; root: string; scale: string }
  | { type: 'degree'; degree: number }
  | { type: 'chord'; chord: ChordRef }
  | { type: 'voicing'; chord: ChordRef; voicing: VoicingValue }
  | { type: 'step'; step_id: string }
  | { type: 'transition'; from_step_id: string; to_step_id: string };
export type MusicalPreview = { label: string; voicing: VoicingValue } | null;
export const Interaction = createContext<{
  select: (intent: MusicalIntent) => void;
  preview: MusicalPreview;
  showPreview: (preview: MusicalPreview) => void;
} | null>(null);

export function useMusicalInteraction() { return useContext(Interaction); }

export function intentFields(intent: MusicalIntent): Record<string, unknown> {
  const { type, ...target } = intent;
  return type === 'tonal-center' ? { tonal_center: target } : { focus: { kind: type, ...target } };
}
