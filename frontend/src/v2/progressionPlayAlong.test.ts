import { describe, expect, it } from 'vitest';
import type { ExerciseStep } from '../types/v2';
import { buildProgressionTimeline, selectedProgressionPosition } from './progressionPlayAlongTiming';
import { practicePlayAlongPosition } from './playAlongTiming';

const guide: ExerciseStep[] = [
  { label: 'D minor', beats: 12, tuning: [64, 59, 55, 50, 45, 38], positions: [{ string: 6, fret: 0 }, { string: 1, fret: 13 }] },
  { label: 'G major', beats: 3, tuning: [64, 59, 55, 50, 45, 38], positions: [{ string: 2, fret: 12 }] },
  { label: 'C major', beats: 1, tuning: [64, 59, 55, 50, 45, 38], positions: [{ string: 3, fret: 5 }] },
];

describe('Progression Play-along timeline', () => {
  it('uses guide order, full durations and physical voicings with high-to-low lane indices', () => {
    const timeline = buildProgressionTimeline(guide);
    expect(timeline.map(({ label, start, end }) => ({ label, start, end }))).toEqual([
      { label: 'D minor', start: 0, end: 12 }, { label: 'G major', start: 12, end: 15 }, { label: 'C major', start: 15, end: 16 },
    ]);
    expect(timeline[0].notes).toEqual([{ string: 5, fret: 0 }, { string: 0, fret: 13 }]);
    expect(guide[0].positions[0].string).toBe(6);
  });

  it('follows idle selection without changing playback range; falls back when selection disappears', () => {
    const timeline = buildProgressionTimeline(guide);
    expect(selectedProgressionPosition(timeline, 1)).toEqual({ segment: 0, start: 0, end: 16, offset: 12, state: 'ready' });
    expect(selectedProgressionPosition(timeline, -1).offset).toBe(0);
    expect(selectedProgressionPosition([], 0).state).toBe('unavailable');
  });

  it('shares count-in, pause, full-idea loop and end math rather than restarting at the selected chord', () => {
    const range = selectedProgressionPosition(buildProgressionTimeline(guide), 1);
    expect(practicePlayAlongPosition(range, 3.5, 4, true, true)).toMatchObject({ offset: -0.5, state: 'count-in' });
    expect(practicePlayAlongPosition(range, 14, 4, true, false)).toMatchObject({ offset: 10, state: 'paused' });
    expect(practicePlayAlongPosition(range, 20.25, 4, true, true)).toMatchObject({ offset: 0.25, state: 'playing' });
    expect(practicePlayAlongPosition(range, 20, 4, false, false)).toMatchObject({ offset: 16, state: 'ended' });
  });
});
