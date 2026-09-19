import type { TabBeat, TabMeasure } from '../types/song';

export function getBeatsFromMeasure(measure?: TabMeasure): TabBeat[] {
  if (!measure) return [];
  const voices = measure.voices ?? [];
  if (voices.length === 0) return [];
  if (voices.length === 1) return voices[0]?.beats ?? [];

  // A rest-only voice must not hide another voice's playable notes.
  let bestBeats: TabBeat[] = voices[0]?.beats ?? [];
  let bestScore = -1;
  for (const voice of voices) {
    const beats = voice?.beats ?? [];
    const score = beats.reduce((acc, beat) => {
      const noteCount = (beat.notes ?? []).filter((n) => !n.rest && !n.dead).length;
      return acc + noteCount;
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestBeats = beats;
    }
  }
  return bestBeats;
}
