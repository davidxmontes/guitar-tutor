import { describe, expect, it } from 'vitest';
import type { TabMeasure } from '../types';
import type { SongVideoAnchor, SongVideoPassage } from '../types/songVideo';
import { buildScoreTimeline, parseYouTubeId, selectionVideoRanges, validatePassages, videoPosition } from './songVideoTiming';

const anchor = (measure_index: number, beat_index: number, edge: 'start' | 'end', video_seconds: number): SongVideoAnchor => ({ measure_index, beat_index, edge, video_seconds });
const passage = (anchors: SongVideoAnchor[], id = 'verse'): SongVideoPassage => ({ id, label: id, anchors });
const measures: TabMeasure[] = [
  { voices: [{ beats: [{ duration: [1, 8], notes: [{ string: 0, fret: 1 }] }] }] }, // Pickup, not a filled 4/4 bar.
  { header: { timeSignature: { numerator: 3, denominator: 4 } }, voices: [{ beats: [{ duration: [1, 4], notes: [{ string: 0, fret: 2 }] }, { duration: [1, 8], rest: true, notes: [] }, { duration: [3, 8], notes: [{ string: 0, fret: 3 }] }] }] },
  { header: { timeSignature: { numerator: 5, denominator: 8 } }, voices: [{ beats: [{ duration: [1, 12], notes: [{ string: 0, fret: 4 }] }, { duration: [1, 6], notes: [{ string: 0, fret: 5 }] }] }] },
];
const timeline = buildScoreTimeline(measures);

describe('YouTube input', () => {
  it.each(['M7lc1UVf-VE', 'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=14', 'https://youtu.be/M7lc1UVf-VE?si=share', 'https://m.youtube.com/shorts/M7lc1UVf-VE', 'https://www.youtube.com/embed/M7lc1UVf-VE', 'https://youtube.com/live/M7lc1UVf-VE'])('accepts a supported ID or URL: %s', input => {
    expect(parseYouTubeId(input)).toBe('M7lc1UVf-VE');
  });
  it.each(['', 'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE', 'https://youtube.com@evil.test/watch?v=M7lc1UVf-VE', 'javascript:M7lc1UVf-VE', 'https://youtube.com/playlist?list=M7lc1UVf-VE', 'https://youtu.be/short', 'https://youtube.com:444/watch?v=M7lc1UVf-VE'])('rejects unsupported input: %s', input => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});

describe('score and video alignment', () => {
  it('uses selected-voice durations including pickups, rests, meter changes and fractions', () => {
    expect(timeline.map(beat => beat.start)).toEqual([0, 0.5, 1.5, 2, 3.5, 3.5 + 1 / 3]);
    expect(timeline.at(-1)?.end).toBeCloseTo(4.5);
    const voices = buildScoreTimeline([{ voices: [{ beats: [{ duration: [1, 1], rest: true, notes: [] }] }, { beats: [{ duration: [1, 8], notes: [{ string: 0, fret: 2 }] }] }] }]);
    expect(voices[0].end).toBe(0.5);
  });
  it('maps differing anchor slopes from actual time without BPM or extrapolation', () => {
    const passages = [passage([anchor(0, 0, 'start', 10), anchor(1, 1, 'start', 13), anchor(2, 1, 'end', 25)])];
    expect(videoPosition(timeline, passages, 9)).toBeNull();
    expect(videoPosition(timeline, passages, 12)).toMatchObject({ measureIndex: 1, beatIndex: 0 });
    expect(videoPosition(timeline, passages, 14)).toMatchObject({ measureIndex: 1, beatIndex: 1 }); // Rest is retained.
    expect(videoPosition(timeline, passages, 16)).toMatchObject({ measureIndex: 1, beatIndex: 2 });
    expect(videoPosition(timeline, passages, 25)).toMatchObject({ measureIndex: 2, beatIndex: 1 });
    expect(videoPosition(timeline, passages, 25.01)).toBeNull();
  });
  it('one anchor identifies only its exact boundary and never a following span', () => {
    const passages = [passage([anchor(1, 1, 'start', 20)])];
    expect(videoPosition(timeline, passages, 20)).toMatchObject({ measureIndex: 1, beatIndex: 1 });
    expect(videoPosition(timeline, passages, 20.1)).toBeNull();
    expect(selectionVideoRanges(timeline, passages, { type: 'beat', measureIndex: 1, beatIndex: 1 })[0]).toMatchObject({ start: 20, end: null });
  });
  it('does not interpolate across missing rhythm or empty measures', () => {
    const broken = buildScoreTimeline([{ voices: [{ beats: [{ duration: [1, 4], notes: [] }, { notes: [] }, { duration: [1, 4], notes: [] }] }] }, { voices: [] }, { voices: [{ beats: [{ duration: [1, 4], notes: [] }] }] }]);
    const passages = [passage([anchor(0, 0, 'start', 0), anchor(2, 0, 'end', 10)])];
    expect(videoPosition(broken, passages, 5)).toBeNull();
    expect(validatePassages(broken, passages)).toMatch(/rhythm/i);
    expect(videoPosition(broken, [passage([anchor(0, 1, 'end', 3)])], 3)).toMatchObject({ measureIndex: 0, beatIndex: 1 });
  });
  it('returns explicit occurrences and complete bounded loop ranges', () => {
    const passages = [passage([anchor(1, 0, 'start', 10), anchor(1, 2, 'end', 16)], 'first'), passage([anchor(1, 0, 'start', 40), anchor(1, 2, 'end', 49)], 'second')];
    expect(selectionVideoRanges(timeline, passages, { type: 'range', startMeasureIndex: 1, endMeasureIndex: 1 })).toEqual([
      { id: 'first', label: 'first', start: 10, end: 16 }, { id: 'second', label: 'second', start: 40, end: 49 },
    ]);
    expect(videoPosition(timeline, passages, 30)).toBeNull();
    expect(videoPosition(timeline, passages, 43)).toMatchObject({ passageId: 'second', measureIndex: 1, beatIndex: 1 });
    expect(selectionVideoRanges(timeline, passages, { type: 'range', startMeasureIndex: 0, endMeasureIndex: 1 })).toEqual([]);
  });
  it('prefers the new occurrence at touching video intervals', () => {
    const passages = [passage([anchor(0, 0, 'start', 0), anchor(1, 0, 'end', 3)], 'first'), passage([anchor(2, 0, 'start', 3), anchor(2, 1, 'end', 6)], 'second')];
    expect(validatePassages(timeline, passages)).toBeNull();
    expect(videoPosition(timeline, passages, 3)).toMatchObject({ passageId: 'second', measureIndex: 2, beatIndex: 0 });
  });
  it('rejects duplicate score boundaries, reversed times, overlap, and invalid positions', () => {
    expect(validatePassages(timeline, [passage([anchor(0, 0, 'end', 1), anchor(1, 0, 'start', 2)])])).toMatch(/increase/i);
    expect(validatePassages(timeline, [passage([anchor(0, 0, 'start', 2), anchor(1, 0, 'end', 1)])])).toMatch(/increase/i);
    expect(validatePassages(timeline, [passage([anchor(9, 0, 'start', 1)])])).toMatch(/score/i);
    expect(validatePassages(timeline, [passage([anchor(0, 0, 'start', 0), anchor(1, 0, 'end', 3)]), passage([anchor(2, 0, 'start', 2)], 'point')])).toMatch(/overlap/i);
  });
});
