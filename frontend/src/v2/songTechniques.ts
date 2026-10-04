import type { TabBeat, TabNote } from '../types';

export interface TechniqueCue {
  mark: string;
  label: string;
}

const NOTE_TECHNIQUES: Array<{ key: keyof TabNote } & TechniqueCue> = [
  { key: 'slide', mark: 'S', label: 'slide' },
  { key: 'bend', mark: 'B', label: 'bend' },
  { key: 'hp', mark: 'H/P', label: 'hammer-on / pull-off' },
  { key: 'vibrato', mark: '~', label: 'vibrato' },
  { key: 'harmonic', mark: '◇', label: 'harmonic' },
  { key: 'ghost', mark: '( )', label: 'ghost note' },
  { key: 'staccato', mark: '·', label: 'staccato' },
  { key: 'accentuated', mark: '>', label: 'accent' },
];

export function noteTechniqueCues(note: TabNote): TechniqueCue[] {
  if (note.rest || note.dead) return [];
  return NOTE_TECHNIQUES.filter(({ key }) => note[key]).map(({ mark, label }) => ({ mark, label }));
}

export function beatTechniqueCues(beat: TabBeat): TechniqueCue[] {
  if (beat.rest) return [];
  const cues: TechniqueCue[] = [];
  if (beat.palmMute) cues.push({ mark: 'P.M.', label: 'Palm mute' });
  if (beat.letRing) cues.push({ mark: 'ring', label: 'Let ring' });
  if (beat.downStroke || beat.pickStroke === 'down') {
    cues.push({ mark: '↓', label: 'Pick down' });
  } else if (beat.upStroke || beat.pickStroke === 'up') {
    cues.push({ mark: '↑', label: 'Pick up' });
  }
  return cues;
}
