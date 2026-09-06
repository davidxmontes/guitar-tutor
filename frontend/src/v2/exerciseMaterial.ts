import type { ExerciseStep, ProgressionPayload, SongStudyPayload, SongSelection, SongFocus } from '../types/v2';
import { getBeatsFromMeasure } from '../components/TabViewer/TabViewer';
import { beatDuration } from './practiceTiming';
import { voicingTuning } from './voicingAudio';

export function progressionDrill(payload: ProgressionPayload, beats = 4): ExerciseStep[] {
  if (payload.chords.some(chord => !chord.voicing?.length || !voicingTuning(chord))) return [];
  return payload.chords.map(chord => ({ label: `${chord.root} ${chord.quality}`, beats, positions: chord.voicing!, tuning: voicingTuning(chord)! }));
}

export function songDrill(payload: SongStudyPayload, selection: SongSelection | null, focus: SongFocus): ExerciseStep[] {
  const tuning = payload.track.tuning ?? payload.tab_data.tuning;
  if (!tuning || tuning.length !== 6 || tuning.some(pitch => !Number.isInteger(pitch) || pitch < 0 || pitch > 127)) return [];
  const start = selection?.type === 'range' ? selection.startMeasureIndex : selection?.type === 'beat' ? selection.measureIndex : focus.measureIndex;
  const end = selection?.type === 'range' ? selection.endMeasureIndex : start;
  const events = payload.tab_data.measures.slice(start, end + 1).flatMap((measure, offset) => getBeatsFromMeasure(measure).map((beat, index) => ({ beat, label: `M${start + offset + 1} · beat ${index + 1}` })));
  if (events.some(({ beat }) => beatDuration(beat) === null || (!beat.rest && (beat.notes ?? []).some(note =>
    !note.rest && !note.dead && (
      !Number.isInteger(note.string) || note.string < 0 || note.string > 5 ||
      !Number.isInteger(note.fret) || note.fret < 0 || note.fret > 36
    )
  )))) return [];
  return events.map(({ beat, label }) => ({ label, beats: beatDuration(beat)!, tuning, positions: beat.rest ? [] : (beat.notes ?? []).filter(note => !note.rest && !note.dead).map(note => ({ string: note.string + 1, fret: note.fret })) }));
}
