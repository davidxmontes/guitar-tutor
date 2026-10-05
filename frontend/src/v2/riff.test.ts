import { expect, test } from 'vitest';
import { newRiff, editRiff, riffSuggestions, riffTimeline, riffScale } from './riff';

test('stable selection survives replacement and length; Keep is one undoable append and deletion clears its target', () => {
  let draft = newRiff();
  draft = editRiff(draft, { type: 'enter', position: { string: 5, fret: 0 }, beats: .5 });
  draft = editRiff(draft, { type: 'enter', position: null, beats: 1 });
  const selectedId = draft.payload.events[0].id;
  draft = { ...draft, selectedId };
  draft = editRiff(draft, { type: 'enter', position: { string: 5, fret: 3 }, beats: 2 });
  expect(draft.payload.events[0]).toMatchObject({ id: selectedId, beats: .5, position: { string: 5, fret: 3 } });
  draft = editRiff(draft, { type: 'length', beats: 2 });
  expect(draft.selectedId).toBe(selectedId);
  const snapshot = riffSuggestions(draft.payload, .5)[0].events;
  const before = draft.payload.events;
  draft = editRiff(draft, { type: 'keep', events: snapshot });
  expect(draft.payload.events.slice(before.length).map(e => ({ beats: e.beats, position: e.position }))).toEqual(snapshot.map(e => ({ beats: e.beats, position: e.position })));
  expect(new Set(draft.payload.events.map(e => e.id)).size).toBe(draft.payload.events.length);
  draft = { ...draft, payload: { ...draft.payload, title: 'Named after the note edit' } };
  draft = editRiff(draft, { type: 'undo' });
  expect(draft.payload.events).toEqual(before);
  expect(draft.payload.title).toBe('Named after the note edit');
  draft = { ...draft, selectedId };
  draft = editRiff(draft, { type: 'delete' });
  expect(draft.selectedId).toBeNull();
  draft = editRiff(draft, { type: 'enter', position: { string: 4, fret: 2 }, beats: 1 });
  expect(draft.payload.events[0].position).toBeNull();
  expect(draft.payload.events).toHaveLength(2);
});

test('repeat preserves rests and rhythm; other continuations use nearby physical positions under actual tuning', () => {
  const payload = { ...newRiff().payload, tuning: [62, 57, 53, 48, 43, 38], events: [
    { id: 'a', beats: .5 as const, position: { string: 5, fret: 2 } },
    { id: 'b', beats: 1 as const, position: null },
    { id: 'c', beats: 2 as const, position: { string: 5, fret: 5 } },
  ] };
  const suggestions = riffSuggestions(payload, 1);
  expect(suggestions).toHaveLength(3);
  expect(suggestions[0].events).toEqual(payload.events);
  for (const idea of suggestions.slice(1)) for (const event of idea.events) {
    expect(event.position).not.toBeNull();
    const p = event.position!;
    expect(p.string).toBeGreaterThanOrEqual(1); expect(p.string).toBeLessThanOrEqual(6);
    expect(p.fret).toBeGreaterThanOrEqual(0); expect(p.fret).toBeLessThanOrEqual(24);
    expect(payload.tuning[p.string - 1] + p.fret).toBeLessThanOrEqual(127);
    expect(Math.abs(p.fret - 5) + Math.abs(p.string - 5)).toBeLessThanOrEqual(8);
  }
});

test('playback projection preserves silence, tuning and unequal durations without persisting computed pitches', () => {
  const payload = { ...newRiff().payload, tuning: [64, 59, 55, 50, 45, 38], events: [
    { id: 'a', beats: .5 as const, position: { string: 6, fret: 0 } },
    { id: 'b', beats: 2 as const, position: null },
    { id: 'c', beats: 1 as const, position: { string: 1, fret: 3 } },
  ] };
  expect(riffTimeline(payload)).toEqual([
    { ...payload.events[0], start: 0, end: .5, midi: 38 },
    { ...payload.events[1], start: .5, end: 2.5, midi: null },
    { ...payload.events[2], start: 2.5, end: 3.5, midi: 67 },
  ]);
  expect(payload.events[0]).not.toHaveProperty('midi');
});

test('saved tonal context is respected without inventing A minor for absent or unsupported context', () => {
  const payload = newRiff().payload;
  expect(riffScale({ ...payload, tonal_center: null }).size).toBe(0);
  expect(riffScale({ ...payload, tonal_center: { root: 'C', scale: 'unknown' } }).size).toBe(0);
  expect([...riffScale({ ...payload, tonal_center: { root: 'D', scale: 'dorian' } })]).toEqual([2, 4, 5, 7, 9, 11, 0]);
  const suggestion = riffSuggestions({ ...payload, tonal_center: null, tuning: [62, 57, 53, 48, 43, 38] }, 1)[0];
  expect(suggestion.label).toBe('Start on G');
});
