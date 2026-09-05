import type { TabBeat } from '../types';

export function beatDuration(beat: TabBeat): number | null {
  const [numerator, denominator] = beat.duration ?? [0, 0];
  return Number.isFinite(numerator) && Number.isFinite(denominator) && numerator > 0 && denominator > 0
    ? 4 * numerator / denominator : null;
}

export function practicePosition(durations: readonly number[], elapsed: number, countIn: number, loop: boolean) {
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  if (!total) return { index: -1, next: null, count: 0, finished: true };
  if (elapsed < countIn) return { index: -1, next: 0, count: Math.ceil(countIn - elapsed), finished: false };
  const played = elapsed - countIn;
  if (!loop && played >= total) return { index: durations.length - 1, next: null, count: 0, finished: true };
  let remaining = played % total;
  let index = 0;
  while (index < durations.length - 1 && remaining >= durations[index]) remaining -= durations[index++];
  return { index, next: index + 1 < durations.length ? index + 1 : loop ? 0 : null, count: 0, finished: false };
}
