import type { ConceptStudyPayload, ExerciseStep, ProgressionPayload, SongStudyPayload, SongSelection, SongFocus } from '../types/v2';
import { getBeatsFromMeasure } from '../components/TabViewer/TabViewer';
import { beatDuration } from './practiceTiming';
import { voicingTuning } from './voicingAudio';

export function progressionDrill(payload: ProgressionPayload, beats = 4): ExerciseStep[] {
  if (payload.chords.some(chord => !chord.voicing?.length || !voicingTuning(chord))) return [];
  return payload.chords.map(chord => ({ label: `${chord.root} ${chord.quality}`, beats, positions: chord.voicing!, tuning: voicingTuning(chord)! }));
}

export function songDrill(payload: SongStudyPayload, selection: SongSelection | null, focus: SongFocus): ExerciseStep[] {
  const tuning = payload.track.tuning ?? payload.tab_data.tuning;
  if (!tuning || tuning.length !== 6) return [];
  const start = selection?.type === 'range' ? selection.startMeasureIndex : selection?.type === 'beat' ? selection.measureIndex : focus.measureIndex;
  const end = selection?.type === 'range' ? selection.endMeasureIndex : start;
  const events = payload.tab_data.measures.slice(start, end + 1).flatMap((measure, offset) => getBeatsFromMeasure(measure).map((beat, index) => ({ beat, label: `M${start + offset + 1} · beat ${index + 1}` })));
  if (events.some(({ beat }) => beatDuration(beat) === null)) return [];
  return events.map(({ beat, label }) => ({ label, beats: beatDuration(beat)!, tuning, positions: beat.rest ? [] : (beat.notes ?? []).filter(note => !note.rest && !note.dead).map(note => ({ string: note.string + 1, fret: note.fret })) }));
}

export function conceptDrill(payload: ConceptStudyPayload): ExerciseStep[] {
  // These validated Study builders use standard tuning. Refuse an unfamiliar tuning.
  if (payload.tuning.join(',') !== 'E,B,G,D,A,E') return [];
  const tuning = [64,59,55,50,45,40];
  const positions = payload.visualization === 'chord' ? payload.voicings[payload.selected_voicing].positions : payload.positions;
  if (payload.visualization === 'chord') return [{ label: payload.voicings[payload.selected_voicing].label, beats: 4, positions, tuning }];
  return [...positions].sort((a, b) => tuning[a.string - 1] + a.fret - tuning[b.string - 1] - b.fret)
    .map(position => ({ label: `${position.note} · ${position.interval}`, beats: 1, positions: [position], tuning }));
}
