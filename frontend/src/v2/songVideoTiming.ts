import type { TabMeasure } from '../types';
import type { SongSelection } from '../types/v2';
import type { SongVideoAnchor, SongVideoPassage } from '../types/songVideo';
import { getBeatsFromMeasure } from '../utils/tab';
import { beatDuration } from './practiceTiming';

export type ScoreBoundary = Pick<SongVideoAnchor, 'measure_index' | 'beat_index' | 'edge'>;
export interface ScoreBeat {
  measureIndex: number;
  beatIndex: number;
  segment: number;
  start: number;
  end: number;
  endSegment: number;
}
export interface VideoPosition { passageId: string; measureIndex: number; beatIndex: number }
export interface VideoScorePosition extends VideoPosition { segment: number; offset: number; start: number; end: number }
export interface VideoRange { id: string; label: string; start: number; end: number | null }
const EPSILON = 1e-9;

export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  const valid = (id: string | null) => id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  if (valid(value)) return value;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (url.hostname === 'youtu.be') return valid(url.pathname.slice(1));
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) return null;
    if (url.pathname === '/watch') return valid(url.searchParams.get('v'));
    const match = /^\/(?:embed|shorts|live)\/([^/]+)\/?$/.exec(url.pathname);
    return valid(match?.[1] ?? null);
  } catch { return null; }
}

export function buildScoreTimeline(measures: readonly TabMeasure[]): ScoreBeat[] {
  const timeline: ScoreBeat[] = [];
  let segment = 0;
  let offset = 0;
  measures.forEach((measure, measureIndex) => {
    const beats = getBeatsFromMeasure(measure);
    if (!beats.length) { segment += 1; offset = 0; }
    beats.forEach((beat, beatIndex) => {
      const duration = beatDuration(beat);
      const start = offset;
      const startSegment = segment;
      if (duration === null) { segment += 1; offset = 0; }
      else offset += duration;
      timeline.push({ measureIndex, beatIndex, segment: startSegment, start, end: offset, endSegment: segment });
    });
  });
  return timeline;
}

function boundary(timeline: readonly ScoreBeat[], point: ScoreBoundary) {
  const beat = timeline.find(b => b.measureIndex === point.measure_index && b.beatIndex === point.beat_index);
  return beat ? { segment: point.edge === 'start' ? beat.segment : beat.endSegment, offset: beat[point.edge] } : null;
}

export function selectionBoundaries(timeline: readonly ScoreBeat[], selection: SongSelection): [ScoreBoundary, ScoreBoundary] | null {
  const first = timeline.find(b => b.measureIndex === (selection.type === 'beat' ? selection.measureIndex : selection.startMeasureIndex)
    && (selection.type !== 'beat' || b.beatIndex === selection.beatIndex));
  const last = selection.type === 'beat' ? first : [...timeline].reverse().find(b => b.measureIndex === selection.endMeasureIndex);
  return first && last ? [
    { measure_index: first.measureIndex, beat_index: first.beatIndex, edge: 'start' },
    { measure_index: last.measureIndex, beat_index: last.beatIndex, edge: 'end' },
  ] : null;
}

export function validatePassages(timeline: readonly ScoreBeat[], passages: readonly SongVideoPassage[]): string | null {
  for (const passage of passages) {
    let previous: { segment: number; offset: number; seconds: number } | null = null;
    for (const anchor of passage.anchors) {
      const point = boundary(timeline, anchor);
      if (!point) return 'Choose an existing score beat.';
      if (!Number.isFinite(anchor.video_seconds) || anchor.video_seconds < 0 || anchor.video_seconds > 86400) return 'Choose a valid video time.';
      if (previous) {
        if (point.segment !== previous.segment) return 'Rhythm is missing in this interval. Use separate passages on either side of the gap.';
        if (point.offset <= previous.offset + EPSILON || anchor.video_seconds <= previous.seconds) return 'Score positions and video times must increase. Correct an anchor or use another occurrence.';
      }
      previous = { ...point, seconds: anchor.video_seconds };
    }
  }
  const intervals = passages.filter(p => p.anchors.length).map(p => [p.anchors[0].video_seconds, p.anchors.at(-1)!.video_seconds]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (let i = 1; i < intervals.length; i++) {
    const [start, end] = intervals[i];
    const [beforeStart, beforeEnd] = intervals[i - 1];
    if (start < beforeEnd || start === end && start === beforeStart && beforeStart === beforeEnd) return 'Video occurrences cannot overlap. Correct their anchors or remove the duplicate occurrence.';
  }
  return null;
}

function scoreTime(timeline: readonly ScoreBeat[], passage: SongVideoPassage, point: ScoreBoundary): number | null {
  const target = boundary(timeline, point);
  if (!target) return null;
  for (let i = 0; i < passage.anchors.length; i++) {
    const anchor = passage.anchors[i];
    const start = boundary(timeline, anchor);
    if (!start || target.segment !== start.segment) continue;
    if (Math.abs(target.offset - start.offset) < EPSILON) return anchor.video_seconds;
    const next = passage.anchors[i + 1];
    const end = next && boundary(timeline, next);
    if (end && end.segment === start.segment && target.offset > start.offset && target.offset < end.offset) {
      return anchor.video_seconds + (next.video_seconds - anchor.video_seconds) * (target.offset - start.offset) / (end.offset - start.offset);
    }
  }
  return null;
}

export function selectionVideoRanges(timeline: readonly ScoreBeat[], passages: readonly SongVideoPassage[], selection: SongSelection, offsetSeconds = 0): VideoRange[] {
  if (!Number.isFinite(offsetSeconds)) return [];
  const points = selectionBoundaries(timeline, selection);
  if (!points) return [];
  const continuous = boundary(timeline, points[0])!.segment === boundary(timeline, points[1])!.segment;
  return passages.flatMap(passage => {
    const rawStart = scoreTime(timeline, passage, points[0]);
    const rawEnd = continuous ? scoreTime(timeline, passage, points[1]) : null;
    if (rawStart === null) return [];
    const start = rawStart + offsetSeconds;
    const end = rawEnd === null ? null : rawEnd + offsetSeconds;
    if (end !== null && end <= 0 || start < 0 && end === null) return [];
    return [{ id: passage.id, label: passage.label, start: Math.max(0, start), end: end !== null && end > start ? end : null }];
  });
}

export function videoPosition(timeline: readonly ScoreBeat[], passages: readonly SongVideoPassage[], seconds: number, offsetSeconds = 0): VideoPosition | null {
  seconds -= offsetSeconds;
  if (!Number.isFinite(seconds)) return null;
  // A new occurrence wins at a shared endpoint; no repeated-score inference.
  const ordered = [...passages].sort((a, b) => (b.anchors[0]?.video_seconds ?? 0) - (a.anchors[0]?.video_seconds ?? 0));
  for (const passage of ordered) {
    for (let i = 0; i < passage.anchors.length; i++) {
      const anchor = passage.anchors[i];
      if (seconds === anchor.video_seconds) return { passageId: passage.id, measureIndex: anchor.measure_index, beatIndex: anchor.beat_index };
      const next = passage.anchors[i + 1];
      if (!next || seconds <= anchor.video_seconds || seconds >= next.video_seconds) continue;
      const start = boundary(timeline, anchor);
      const end = boundary(timeline, next);
      if (!start || !end || start.segment !== end.segment) continue;
      const offset = start.offset + (end.offset - start.offset) * (seconds - anchor.video_seconds) / (next.video_seconds - anchor.video_seconds);
      const beat = timeline.find(b => b.segment === start.segment && b.endSegment === start.segment && offset >= b.start - EPSILON && offset < b.end - EPSILON);
      if (beat) return { passageId: passage.id, measureIndex: beat.measureIndex, beatIndex: beat.beatIndex };
    }
  }
  return null;
}

/** Continuous position only inside a calibrated interval of an explicit occurrence. */
export function videoScorePosition(timeline: readonly ScoreBeat[], passages: readonly SongVideoPassage[], seconds: number, offsetSeconds = 0): VideoScorePosition | null {
  seconds -= offsetSeconds;
  if (!Number.isFinite(seconds)) return null;
  const ordered = [...passages].sort((a, b) => (b.anchors[0]?.video_seconds ?? 0) - (a.anchors[0]?.video_seconds ?? 0));
  for (const passage of ordered) {
    for (let i = 0; i < passage.anchors.length - 1; i++) {
      const anchor = passage.anchors[i];
      const next = passage.anchors[i + 1];
      if (seconds < anchor.video_seconds || seconds > next.video_seconds) continue;
      const from = boundary(timeline, anchor);
      const to = boundary(timeline, next);
      if (!from || !to || from.segment !== to.segment || to.offset <= from.offset || next.video_seconds <= anchor.video_seconds) continue;
      const offset = from.offset + (to.offset - from.offset) * (seconds - anchor.video_seconds) / (next.video_seconds - anchor.video_seconds);
      const beat = timeline.find(b => b.segment === from.segment && b.endSegment === from.segment && offset >= b.start - EPSILON && offset < b.end - EPSILON)
        ?? timeline.find(b => b.measureIndex === next.measure_index && b.beatIndex === next.beat_index);
      if (!beat) continue;
      // Limit lookahead to the contiguous timed part of this occurrence, including
      // when reading an older draft containing a gap that validation now rejects.
      let first = i;
      let last = i + 1;
      while (first > 0 && boundary(timeline, passage.anchors[first - 1])?.segment === from.segment) first--;
      while (last + 1 < passage.anchors.length && boundary(timeline, passage.anchors[last + 1])?.segment === from.segment) last++;
      return { passageId: passage.id, measureIndex: beat.measureIndex, beatIndex: beat.beatIndex,
        segment: from.segment, offset, start: boundary(timeline, passage.anchors[first])!.offset, end: boundary(timeline, passage.anchors[last])!.offset };
    }
  }
  return null;
}
