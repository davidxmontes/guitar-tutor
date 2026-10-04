import { describe, expect, it } from 'vitest';
import type { TabBeat, TabNote } from '../types';
import { beatTechniqueCues, noteTechniqueCues } from './songTechniques';

const decoratedNote: TabNote = {
  string: 0, fret: 12, slide: true, bend: true, hp: true, vibrato: true,
  harmonic: true, ghost: true, staccato: true, accentuated: true,
};

describe('song technique cues', () => {
  it('ignores unmodelled amounts, directions and technique aliases from raw song data', () => {
    const raw: TabNote = JSON.parse('{"string":0,"fret":12,"slide":true,"slideDirection":"up","bend":true,"bendAmount":2,"hammerOn":true}');
    expect(noteTechniqueCues(raw).map(cue => cue.label)).toEqual(['slide', 'bend']);
    expect(noteTechniqueCues({ string: 1, fret: 0, bend: false, hp: true })).toEqual([
      { mark: 'H/P', label: 'hammer-on / pull-off' },
    ]);
  });

  it('gives rests and dead notes precedence over conflicting note techniques', () => {
    expect(noteTechniqueCues({ ...decoratedNote, rest: true })).toEqual([]);
    expect(noteTechniqueCues({ ...decoratedNote, dead: true })).toEqual([]);
    expect(noteTechniqueCues({ string: 0, fret: 0 })).toEqual([]);
  });

  it('keeps beat cues independent of note cues but suppresses them on a rest', () => {
    const beat: TabBeat = { notes: [], palmMute: true, letRing: true, pickStroke: 'up' };
    expect(beatTechniqueCues(beat)).toEqual([
      { mark: 'P.M.', label: 'Palm mute' },
      { mark: 'ring', label: 'Let ring' },
      { mark: '↑', label: 'Pick up' },
    ]);
    expect(beatTechniqueCues({ ...beat, rest: true })).toEqual([]);
    expect(beatTechniqueCues({ notes: [decoratedNote] })).toEqual([]);
  });

  it.each<Partial<TabBeat>>([
    { downStroke: true, upStroke: true },
    { downStroke: true, pickStroke: 'up' },
    { upStroke: true, pickStroke: 'down' },
    { pickStroke: 'down' },
  ])('uses the ordinary tab downstroke precedence for %j', (direction) => {
    expect(beatTechniqueCues({ notes: [], ...direction })).toEqual([{ mark: '↓', label: 'Pick down' }]);
  });

  it('accepts the explicit upstroke flag without assuming a stroke on other beats', () => {
    expect(beatTechniqueCues({ notes: [], upStroke: true })).toEqual([{ mark: '↑', label: 'Pick up' }]);
  });
});
