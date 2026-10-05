import { expect, it } from 'vitest';
import type { SongStudyPayload } from '../types/v2';
import { songPracticeMaterial } from './exerciseMaterial';

const tuning = [64, 59, 55, 50, 45, 38];
const payload: SongStudyPayload = {
  song_id: 1, artist: '', title: '', chordpro: null, enrichment: null, shape_events: [],
  track: { index: 0, name: '', instrument: 'guitar', tuning },
  tab_data: { tuning: [64, 59, 55, 50, 45, 40], measures: [
    { voices: [{ beats: [{ duration: [1, 4], notes: [{ string: 0, fret: 3 }] }] }] },
    { voices: [
      { beats: [{ duration: [1, 1], rest: true, notes: [] }] },
      { beats: [
        { duration: [1, 4], notes: [{ string: 5, fret: 0 }] },
        { duration: [1, 8], rest: true, notes: [{ string: -1, fret: -1 }] },
        { duration: [1, 8], notes: [{ string: -1, fret: -1, dead: true }, { string: -1, fret: -1, rest: true }] },
      ] },
    ] },
    { voices: [{ beats: [{ duration: [3, 8], notes: [{ string: 0, fret: 36 }] }] }] },
  ] },
};
const focus = { measureIndex: 1, windowSize: 4 };

it('shares whole-measure selection, chosen voice, and score indices across practice and exercises', () => {
  const before = structuredClone(payload);
  const material = songPracticeMaterial(payload, { type: 'beat', measureIndex: 1, beatIndex: 2 }, focus);
  expect(material).toEqual(songPracticeMaterial(payload, null, focus));
  expect(material.sequence.map(entry => [entry.measureIndex, entry.beatIndex])).toEqual([[0, 0], [1, 0], [1, 1], [1, 2], [2, 0]]);
  expect(material.selectedBeats.map(entry => entry.sequenceIndex)).toEqual([1, 2, 3]);
  expect(material.durations).toEqual([1, 0.5, 0.5]);
  expect(material.steps).toEqual([
    { label: 'M2 · beat 1', beats: 1, tuning, positions: [{ string: 6, fret: 0 }] },
    { label: 'M2 · beat 2', beats: 0.5, tuning, positions: [] },
    { label: 'M2 · beat 3', beats: 0.5, tuning, positions: [] },
  ]);
  expect(payload).toEqual(before);
  const range = songPracticeMaterial(payload, { type: 'range', startMeasureIndex: 1, endMeasureIndex: 2 }, focus);
  expect(range.selectedBeats.map(entry => entry.sequenceIndex)).toEqual([1, 2, 3, 4]);
  expect(range.durations).toEqual([1, 0.5, 0.5, 1.5]);
  expect(range.steps.at(-1)).toMatchObject({ label: 'M3 · beat 1', beats: 1.5, positions: [{ string: 1, fret: 36 }] });
});

it('keeps metronome timing when tuning or sounding notes prevent a guide or exercise', () => {
  for (const missing of [null, []]) {
    const source = { ...payload, track: { ...payload.track, tuning: missing } };
    const before = structuredClone(source);
    const fallback = songPracticeMaterial(source, null, focus);
    expect(fallback.steps[0].tuning).toEqual(payload.tab_data.tuning);
    expect(source).toEqual(before);
  }
  for (const invalid of [null, [], [64, 59, 55, 50], [64, 59, 55, 50, 45, 128], [64, 59, 55, 50, 45, 38.5]]) {
    const material = songPracticeMaterial({ ...payload, track: { ...payload.track, tuning: invalid }, tab_data: { measures: payload.tab_data.measures } }, null, focus);
    expect(material.durations).toEqual([1, 0.5, 0.5]);
    expect(material.steps).toEqual([]);
  }
  for (const note of [{ string: 6, fret: 0 }, { string: 0, fret: 37 }, { string: 0.5, fret: 0 }, { string: 0, fret: NaN }]) {
    const material = songPracticeMaterial({ ...payload, tab_data: { measures: [{ voices: [{ beats: [{ duration: [1, 4], notes: [note] }] }] }] } }, null, { ...focus, measureIndex: 0 });
    expect(material.durations).toEqual([1]);
    expect(material.steps).toEqual([]);
  }
});

it('disables timing and guide together for missing rhythm, and handles empty measures', () => {
  for (const duration of [undefined, [0, 4], [1, 0], [-1, 4], [Infinity, 4]] as const) {
    const material = songPracticeMaterial({ ...payload, tab_data: { measures: [{ voices: [{ beats: [{ duration: duration && [...duration], notes: [] }] }] }] } }, null, { ...focus, measureIndex: 0 });
    expect(material.selectedBeats).toHaveLength(1);
    expect(material.durations).toEqual([]);
    expect(material.steps).toEqual([]);
  }
  const empty = songPracticeMaterial({ ...payload, tab_data: { measures: [{ voices: [] }] } }, null, { ...focus, measureIndex: 0 });
  expect(empty).toEqual({ sequence: [], selectedBeats: [], durations: [], steps: [] });
});
