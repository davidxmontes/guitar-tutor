import { expect, test } from 'vitest';
import { intentFields } from './musicalInteraction';

test('semantic gestures map to existing Focus and tonal-center edits without layout or playback writes', () => {
  expect(intentFields({ type: 'tonal-center', root: 'E', scale: 'dorian' })).toEqual({ tonal_center: { root: 'E', scale: 'dorian' } });
  expect(intentFields({ type: 'degree', degree: 6 })).toEqual({ focus: { kind: 'degree', degree: 6 } });
  expect(intentFields({ type: 'transition', from_step_id: 'a', to_step_id: 'b' })).toEqual({ focus: { kind: 'transition', from_step_id: 'a', to_step_id: 'b' } });
  const voicing = { positions: [{ string: 1, fret: 0 }], tuning: [64, 59, 55, 50, 45, 40] };
  expect(intentFields({ type: 'voicing', chord: { root: 'C', quality: 'major' }, voicing })).toEqual({ focus: { kind: 'voicing', chord: { root: 'C', quality: 'major' }, voicing } });
});
