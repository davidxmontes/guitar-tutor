import type { ExerciseStep, SongStudyPayload, SongSelection, SongFocus } from '../types/v2';
import { getBeatsFromMeasure } from '../utils/tab';
import { beatDuration } from './practiceTiming';
export function songPracticeMaterial(payload: SongStudyPayload, selection: SongSelection | null, focus: SongFocus) {
  const sequence = (payload.tab_data.measures ?? []).flatMap((measure, measureIndex) =>
    getBeatsFromMeasure(measure).map((beat, beatIndex) => ({ measureIndex, beatIndex, beat })));
  const start = selection?.type === 'range' ? selection.startMeasureIndex : selection?.type === 'beat' ? selection.measureIndex : focus.measureIndex;
  const end = selection?.type === 'range' ? selection.endMeasureIndex : start;
  const selectedBeats = sequence.map((entry, sequenceIndex) => ({ ...entry, sequenceIndex }))
    .filter(entry => entry.measureIndex >= start && entry.measureIndex <= end);
  const timing = selectedBeats.map(({ beat }) => beatDuration(beat));
  const durations = timing.every((duration): duration is number => duration !== null) ? timing : [];
  const tuning = payload.track.tuning ?? payload.tab_data.tuning;
  // Invalid physical notes prevent guide audio and exercises, not metronome practice.
  const playable = tuning && tuning.length === 6 && tuning.every(pitch => Number.isInteger(pitch) && pitch >= 0 && pitch <= 127)
    && durations.length === selectedBeats.length && !selectedBeats.some(({ beat }) => !beat.rest && (beat.notes ?? []).some(note =>
    !note.rest && !note.dead && (
      !Number.isInteger(note.string) || note.string < 0 || note.string > 5 ||
      !Number.isInteger(note.fret) || note.fret < 0 || note.fret > 36
    )
  ));
  const steps: ExerciseStep[] = playable ? selectedBeats.map(({ beat, measureIndex, beatIndex }, index) => ({
    label: `M${measureIndex + 1} · beat ${beatIndex + 1}`, beats: durations[index], tuning,
    positions: beat.rest ? [] : (beat.notes ?? []).filter(note => !note.rest && !note.dead).map(note => ({ string: note.string + 1, fret: note.fret })),
  })) : [];
  return { sequence, selectedBeats, durations, steps };
}
