import type { ExerciseStep } from '../types/v2';
import type { PlayAlongPosition } from './PlayAlong';
import { unavailablePosition } from './playAlongTiming';

export function buildProgressionTimeline(guide: readonly ExerciseStep[]) {
  let start = 0;
  return guide.map((chord, index) => {
    const event = { index, label: chord.label, start, end: start + chord.beats,
      notes: chord.positions.map(note => ({ string: note.string - 1, fret: note.fret })) };
    start = event.end;
    return event;
  });
}

export function selectedProgressionPosition(timeline: ReturnType<typeof buildProgressionTimeline>, selectedIndex: number): PlayAlongPosition {
  const first = timeline[0];
  const last = timeline.at(-1);
  if (!first || !last) return unavailablePosition;
  return { segment: 0, start: first.start, end: last.end, offset: (timeline[selectedIndex] ?? first).start, state: 'ready' };
}
