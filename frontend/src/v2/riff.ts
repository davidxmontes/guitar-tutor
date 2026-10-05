import { midiToNoteName } from '../utils/tuning';
import type { PhysicalPosition } from '../types/music';
import type { RiffEvent, RiffPayload } from '../types/v2';

export type RiffDraft = { payload: RiffPayload; selectedId: string | null; undo: RiffEvent[][] };
export type RiffSuggestion = { label: string; events: RiffEvent[] };
export function newRiff(payload?: RiffPayload): RiffDraft {
  return { payload: payload ?? { title: 'My first riff', tempo: 90, tuning: [64, 59, 55, 50, 45, 40], tonal_center: { root: 'A', scale: 'natural_minor' }, events: [] }, selectedId: null, undo: [] };
}
export type RiffEdit =
  | { type: 'enter'; position: PhysicalPosition | null; beats: RiffEvent['beats'] }
  | { type: 'length'; beats: RiffEvent['beats'] }
  | { type: 'delete' }
  | { type: 'undo' }
  | { type: 'keep'; events: RiffEvent[] };
export function editRiff(draft: RiffDraft, edit: RiffEdit): RiffDraft {
  if (edit.type === 'undo') {
    const events = draft.undo.at(-1);
    return events ? { payload: { ...draft.payload, events }, selectedId: null, undo: draft.undo.slice(0, -1) } : draft;
  }
  const events = draft.payload.events;
  const selected = events.find(event => event.id === draft.selectedId);
  let next: RiffEvent[];
  if (edit.type === 'enter') next = selected
    ? events.map(event => event.id === selected.id ? { ...event, position: edit.position } : event)
    : [...events, { id: crypto.randomUUID(), position: edit.position, beats: edit.beats }];
  else if (edit.type === 'length') {
    if (!selected) return draft;
    next = events.map(event => event.id === selected.id ? { ...event, beats: edit.beats } : event);
  } else if (edit.type === 'delete') {
    if (!selected) return draft;
    next = events.filter(event => event.id !== selected.id);
  } else next = [...events, ...edit.events.map(event => ({ ...event, id: crypto.randomUUID() }))];
  if (next.length > 256) return draft;
  return { payload: { ...draft.payload, events: next }, selectedId: edit.type === 'delete' || edit.type === 'keep' ? null : selected?.id ?? null,
    undo: [...draft.undo.slice(-39), draft.payload.events] };
}
export function riffTimeline(payload: RiffPayload) {
  let start = 0;
  return payload.events.map(event => {
    const value = { ...event, start, end: start + event.beats, midi: event.position ? payload.tuning[event.position.string - 1] + event.position.fret : null };
    start = value.end;
    return value;
  });
}
const roots: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function riffScale(payload: RiffPayload): Set<number> {
  if (!payload.tonal_center) return new Set();
  const root = roots[payload.tonal_center.root];
  const modes: Record<string, number[]> = { major: [0, 2, 4, 5, 7, 9, 11], natural_minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], pentatonic_minor: [0, 3, 5, 7, 10], pentatonic_major: [0, 2, 4, 7, 9] };
  const intervals = modes[payload.tonal_center.scale];
  return new Set(root === undefined || !intervals ? [] : intervals.map(interval => (root + interval) % 12));
}
export function riffSuggestions(payload: RiffPayload, beats: RiffEvent['beats']): RiffSuggestion[] {
  const positions: PhysicalPosition[] = payload.tuning.flatMap((open, i) => Array.from({ length: Math.min(24, 127 - open) + 1 }, (_, fret) => ({ string: i + 1, fret })));
  const pitch = (position: PhysicalPosition) => payload.tuning[position.string - 1] + position.fret;
  const scale = riffScale(payload);
  const last = [...payload.events].reverse().find(event => event.position)?.position ?? { string: 5, fret: 0 };
  const motif = payload.events.slice(-3);
  const closest = (target: number, from: PhysicalPosition) => [...positions].sort((a, b) =>
    (Math.abs(pitch(a) - target) * 12 + Math.abs(a.fret - from.fret) + 2 * Math.abs(a.string - from.string))
    - (Math.abs(pitch(b) - target) * 12 + Math.abs(b.fret - from.fret) + 2 * Math.abs(b.string - from.string)))[0];
  const step = (midi: number, direction: number) => {
    for (let target = midi + direction; target >= 0 && target <= 127; target += direction) if ((!scale.size || scale.has(target % 12)) && positions.some(p => pitch(p) === target)) return target;
    return midi;
  };
  const move = (targets: number[]) => {
    let from = last;
    return targets.map((target, i) => { from = closest(target, from); return { id: `suggestion-${i}`, position: from, beats: motif[i % Math.max(1, motif.length)]?.beats ?? beats }; });
  };
  const midi = pitch(last);
  const next = step(midi, 1), second = step(next, 1);
  // ponytail: three deterministic motifs, not composition scoring; add phrase analysis only when this ceiling matters.
  const initial = move([payload.tonal_center ? 36 + (roots[payload.tonal_center.root] ?? 9) : pitch(last)]);
  return [
    { label: motif.length ? 'Repeat the ending' : `Start on ${midiToNoteName(pitch(initial[0].position!))}`, events: motif.length ? motif : initial },
    { label: scale.size ? 'Step through the scale' : 'Step nearby', events: move([next, second, step(second, -1)]) },
    { label: 'Move out and return', events: move([next, step(midi, -1), midi]) },
  ];
}

export function describeRiffEvent(event: RiffEvent, tuning: number[]) {
  return `${event.position ? `${midiToNoteName(tuning[event.position.string - 1] + event.position.fret)}, string ${event.position.string}, fret ${event.position.fret}` : 'Rest'}, ${event.beats} ${event.beats === 1 ? 'beat' : 'beats'}`;
}
