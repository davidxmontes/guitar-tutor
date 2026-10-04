import type { SongSelection } from '../types/v2';
import type { SongVideoPassage } from '../types/songVideo';
import type { PlayAlongPosition } from './PlayAlong';
import type { YouTubeState } from './YouTubePlayer';
import type { ScoreBeat } from './songVideoTiming';
import { videoScorePosition } from './songVideoTiming';

export interface VideoClockSample {
  seconds: number | null;
  at: number;
  rate: number;
  state: YouTubeState;
  engaged: boolean;
  passages: readonly SongVideoPassage[];
}

export const unavailablePosition: PlayAlongPosition = { segment: -1, offset: 0, start: 0, end: 0, state: 'unavailable' };

export function selectedPlayAlongPosition(timeline: readonly ScoreBeat[], selection: SongSelection): PlayAlongPosition {
  const startMeasure = selection.type === 'beat' ? selection.measureIndex : selection.startMeasureIndex;
  const endMeasure = selection.type === 'beat' ? selection.measureIndex : selection.endMeasureIndex;
  const selected = timeline.filter(beat => beat.measureIndex >= startMeasure && beat.measureIndex <= endMeasure);
  const first = selected[0];
  const last = selected.at(-1);
  const current = selection.type === 'beat' ? selected.find(beat => beat.beatIndex === selection.beatIndex) : first;
  if (!first || !last || !current || selected.some(beat => beat.segment !== first.segment || beat.endSegment !== first.segment)) return unavailablePosition;
  return { segment: first.segment, start: first.start, end: last.end, offset: current.start, state: 'ready' };
}

export function practicePlayAlongPosition(range: PlayAlongPosition, elapsed: number, countIn: number, loop: boolean, running: boolean): PlayAlongPosition {
  if (range.state === 'unavailable') return range;
  const total = range.end - range.start;
  if (total <= 0) return unavailablePosition;
  const played = elapsed - countIn;
  if (played < 0) return { ...range, offset: range.start + played, count: Math.ceil(-played), state: 'count-in' };
  if (!loop && played >= total) return { ...range, offset: range.end, state: 'ended' };
  return { ...range, offset: range.start + played % total, state: running ? 'playing' : 'paused' };
}

export function recordingPlayAlongPosition(timeline: readonly ScoreBeat[], sample: VideoClockSample, now: number): PlayAlongPosition {
  if (sample.seconds === null) return unavailablePosition;
  // YouTube polls at 200ms. A lost/stale delivery may advance at most two samples,
  // and mapping still refuses extrapolation past a calibrated occurrence.
  const elapsed = sample.state === 'playing' ? Math.min(400, Math.max(0, now - sample.at)) / 1000 * sample.rate : 0;
  const position = videoScorePosition(timeline, sample.passages, sample.seconds + elapsed);
  if (!position) return unavailablePosition;
  return { ...position, state: sample.state === 'playing' ? 'playing' : sample.state === 'ended' ? 'ended' : 'paused' };
}
