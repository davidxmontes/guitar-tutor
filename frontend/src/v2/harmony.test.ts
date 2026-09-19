import { expect, it } from 'vitest';
import { samePositions, sameVoicing } from './harmony';

it('identifies the same physical shape regardless of position order, while preserving tuning and frets', () => {
  const positions = [{ string: 2, fret: 1 }, { string: 1, fret: 0 }];
  const reversed = [...positions].reverse();
  const tuning = [64, 59, 55, 50, 45, 40];
  expect(samePositions(positions, reversed)).toBe(true);
  expect(samePositions(positions, [{ string: 2, fret: 2 }, { string: 1, fret: 0 }])).toBe(false);
  expect(samePositions(positions, positions.slice(1))).toBe(false);
  expect(sameVoicing({ positions, tuning }, { positions: reversed, tuning })).toBe(true);
  expect(sameVoicing({ positions, tuning }, { positions, tuning: [64, 59, 55, 50, 45, 38] })).toBe(false);
  expect(sameVoicing({ positions, tuning }, null)).toBe(false);
  expect(positions[0]).toEqual({ string: 2, fret: 1 });
});
