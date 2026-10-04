import { describe, expect, it } from 'vitest';
import type { TabMeasure } from '../types';
import type { SongVideoPassage } from '../types/songVideo';
import { buildScoreTimeline, videoScorePosition } from './songVideoTiming';
import { practicePlayAlongPosition, recordingPlayAlongPosition, selectedPlayAlongPosition } from './playAlongTiming';
import type { VideoClockSample } from './playAlongTiming';

const measures: TabMeasure[] = [{ voices: [{ beats: [
  { duration: [1, 8], notes: [{ string: 0, fret: 3 }, { string: 1, fret: 2 }] },
  { duration: [1, 12], rest: true, notes: [] },
  { duration: [1, 6], notes: [{ string: 5, fret: 0, dead: true }] },
] }] }, { voices: [{ beats: [{ duration: [1, 4], notes: [{ string: 0, fret: 7 }] }] }] }];
const timeline = buildScoreTimeline(measures);
const selected = selectedPlayAlongPosition(timeline, { type: 'range', startMeasureIndex: 0, endMeasureIndex: 0 });
const occurrence = (id: string, from: number, to: number): SongVideoPassage => ({ id, label: id, anchors: [
  { measure_index: 0, beat_index: 0, edge: 'start', video_seconds: from },
  { measure_index: 0, beat_index: 2, edge: 'end', video_seconds: to },
] });
const passages = [occurrence('first', 10, 13), occurrence('repeat', 20, 26)];
const sample = (overrides: Partial<VideoClockSample> = {}): VideoClockSample => ({ seconds: 10, at: 1000, rate: 1, state: 'playing', engaged: true, passages, ...overrides });

describe('Play-along score position', () => {
  it('keeps simultaneous notes on one event and uses fractional rhythm including rests', () => {
    expect(timeline.map(beat => beat.start)).toEqual([0, 0.5, 0.5 + 1 / 3, 1.5]);
    expect(selected).toMatchObject({ offset: 0, start: 0, end: 1.5, state: 'ready' });
    expect(selectedPlayAlongPosition(timeline, { type: 'beat', measureIndex: 0, beatIndex: 1 })).toMatchObject({ offset: 0.5, end: 1.5 });
  });

  it('approaches the first beat during count-in, freezes on pause, wraps only inside the selected passage and stops at its end', () => {
    expect(practicePlayAlongPosition(selected, 2.25, 4, true, true)).toMatchObject({ offset: -1.75, count: 2, state: 'count-in' });
    expect(practicePlayAlongPosition(selected, 4.75, 4, true, false)).toMatchObject({ offset: 0.75, state: 'paused' });
    expect(practicePlayAlongPosition(selected, 5.5, 4, true, true)).toMatchObject({ offset: 0, end: 1.5, state: 'playing' });
    expect(practicePlayAlongPosition(selected, 5.75, 4, true, true)).toMatchObject({ offset: 0.25 });
    expect(practicePlayAlongPosition(selected, 5.5, 4, false, false)).toMatchObject({ offset: 1.5, state: 'ended' });
  });

  it('refuses missing rhythm instead of assigning a default duration', () => {
    const broken = buildScoreTimeline([{ voices: [{ beats: [{ notes: [{ string: 0, fret: 2 }] }] }] }]);
    expect(selectedPlayAlongPosition(broken, { type: 'range', startMeasureIndex: 0, endMeasureIndex: 0 }).state).toBe('unavailable');
  });
});

describe('Play-along recording position', () => {
  it('tracks calibrated slopes and explicit repeats without previewing the next written measure', () => {
    expect(videoScorePosition(timeline, passages, 11)).toMatchObject({ offset: 0.5, passageId: 'first', start: 0, end: 1.5 });
    expect(videoScorePosition(timeline, passages, 22)).toMatchObject({ offset: 0.5, passageId: 'repeat', end: 1.5 });
    expect(videoScorePosition(timeline, passages, 15)).toBeNull();
    expect(videoScorePosition(timeline, [occurrence('point', 10, 10)], 10)).toBeNull();
    const drifting: SongVideoPassage = { id: 'drift', label: 'Drift', anchors: [
      passages[0].anchors[0], { measure_index: 0, beat_index: 1, edge: 'start', video_seconds: 11 },
      { ...passages[0].anchors[1], video_seconds: 15 },
    ] };
    expect(videoScorePosition(timeline, [drifting], 12)?.offset).toBeCloseTo(0.75);
  });

  it('reconciles samples, rate changes, native seeks, pause and buffering; bounds stale samples', () => {
    expect(recordingPlayAlongPosition(timeline, sample(), 1200).offset).toBeCloseTo(0.1);
    expect(recordingPlayAlongPosition(timeline, sample({ rate: 2 }), 1200).offset).toBeCloseTo(0.2);
    expect(recordingPlayAlongPosition(timeline, sample({ seconds: 22, state: 'paused' }), 9000)).toMatchObject({ offset: 0.5, passageId: 'repeat', state: 'paused' });
    expect(recordingPlayAlongPosition(timeline, sample({ seconds: 11, state: 'buffering' }), 9000).offset).toBe(0.5);
    expect(recordingPlayAlongPosition(timeline, sample(), 9000).offset).toBeCloseTo(0.2);
    expect(recordingPlayAlongPosition(timeline, sample({ seconds: 12.9 }), 1400).state).toBe('unavailable');
    expect(recordingPlayAlongPosition(timeline, sample({ seconds: 10, offsetSeconds: -0.1, state: 'paused' }), 9000).offset).toBeCloseTo(0.05);
    expect(recordingPlayAlongPosition(timeline, sample({ seconds: 10, offsetSeconds: 0.1, state: 'paused' }), 9000).state).toBe('unavailable');
  });

  it('does not interpolate or look ahead through a rhythm gap', () => {
    const broken = buildScoreTimeline([{ voices: [{ beats: [
      { duration: [1, 4], notes: [] }, { notes: [] }, { duration: [1, 4], notes: [] },
    ] }] }]);
    expect(videoScorePosition(broken, [occurrence('gap', 0, 10)], 5)).toBeNull();
    const later: SongVideoPassage = { id: 'later', label: 'Later', anchors: [
      { measure_index: 0, beat_index: 2, edge: 'start', video_seconds: 10 },
      { measure_index: 0, beat_index: 2, edge: 'end', video_seconds: 12 },
    ] };
    expect(videoScorePosition(broken, [later], 11)).toMatchObject({ segment: 1, offset: 0.5, start: 0, end: 1 });
  });
});
