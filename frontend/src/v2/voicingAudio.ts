import type { ProgressionChord } from '../types/v2';
import { playChord } from '../utils/audio';

export function voicingTuning(chord: ProgressionChord): number[] | null {
  if (chord.tuning === 'standard') return [64, 59, 55, 50, 45, 40];
  return Array.isArray(chord.tuning) && chord.tuning.length === 6 ? chord.tuning : null;
}

export function hearVoicing(chord: ProgressionChord) {
  const tuning = voicingTuning(chord);
  if (tuning && chord.voicing?.length) playChord(chord.voicing, 0.03, 2, tuning);
}
