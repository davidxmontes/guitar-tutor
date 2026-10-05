import { expect, test, vi } from 'vitest';
import { startTimedPlayback } from './audio';

test('audio clock schedules unequal note/rest durations and loop boundaries; abort cancels future notes and suspended starts', async () => {
  vi.useFakeTimers();
  const starts: number[] = [], stops: number[] = [];
  let release: (() => void) | undefined;
  const ctx = { currentTime: 0, state: 'running', sampleRate: 100,
    resume: () => new Promise<void>(resolve => { release = resolve; }),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => ({ connect() {}, start(at: number) { starts.push(at); }, stop() { stops.push(1); } }), destination: {},
  };
  vi.stubGlobal('AudioContext', class { constructor() { return ctx; } });
  const controller = new AbortController();
  const transport = await startTimedPlayback([
    { positions: [{ string: 6, fret: 0 }], tuning: [64, 59, 55, 50, 45, 38], beats: .5 },
    { positions: [], tuning: [64, 59, 55, 50, 45, 38], beats: 1 },
    { positions: [{ string: 1, fret: 3 }], tuning: [64, 59, 55, 50, 45, 38], beats: .5 },
  ], 120, { loop: true, signal: controller.signal });
  expect(starts).toEqual([.03]);
  ctx.currentTime = .7; vi.advanceTimersByTime(25);
  expect(starts).toEqual([.03, .78]);
  ctx.currentTime = .9; vi.advanceTimersByTime(25);
  expect(starts).toEqual([.03, .78, 1.03]);
  expect(transport!.elapsedBeats()).toBeCloseTo(1.74);
  ctx.currentTime = 20.9; vi.advanceTimersByTime(25);
  // A visible main-thread stall skips elapsed cycles, never bursts all missed notes.
  expect(starts.slice(3)).toEqual([20.9, 21.03]);
  transport!.stop(); controller.abort();
  ctx.currentTime = 25; vi.advanceTimersByTime(1000);
  expect(starts).toHaveLength(5); expect(stops).toHaveLength(5);
  ctx.state = 'suspended';
  const stale = new AbortController();
  const pending = startTimedPlayback([{ positions: [{ string: 1, fret: 0 }], tuning: [64, 59, 55, 50, 45, 40], beats: 1 }], 90, { loop: false, signal: stale.signal });
  stale.abort(); release?.();
  expect(await pending).toBeNull(); expect(starts).toHaveLength(5);
  vi.useRealTimers(); vi.unstubAllGlobals();
});
