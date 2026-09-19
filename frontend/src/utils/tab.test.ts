import { expect, it } from 'vitest';
import { getBeatsFromMeasure } from './tab';

it('chooses the most playable voice, preserving rests and the first voice on ties', () => {
  const quiet = [{ notes: [{ string: 0, fret: 0, rest: true }, { string: 1, fret: 0, dead: true }] }];
  const playable = [{ notes: [{ string: 0, fret: 3 }] }, { rest: true, notes: [] }];
  const other = [{ notes: [{ string: 1, fret: 5 }] }];
  expect(getBeatsFromMeasure({ voices: [{ beats: quiet }, { beats: playable }, { beats: other }] })).toBe(playable);
  expect(getBeatsFromMeasure({ voices: [{ beats: other }, { beats: playable }] })).toBe(other);
  expect(getBeatsFromMeasure({ voices: [{ beats: quiet }] })).toBe(quiet);
  expect(getBeatsFromMeasure({ voices: [] })).toEqual([]);
  expect(getBeatsFromMeasure()).toEqual([]);
});
