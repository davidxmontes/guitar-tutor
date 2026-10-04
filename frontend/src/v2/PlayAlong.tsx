import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TabMeasure } from '../types';
import { getBeatsFromMeasure } from '../utils/tab';
import { buildScoreTimeline, type ScoreBeat } from './songVideoTiming';
import './PlayAlong.css';

export interface PlayAlongPosition {
  segment: number;
  offset: number;
  start: number;
  end: number;
  state: 'ready' | 'playing' | 'paused' | 'count-in' | 'ended' | 'unavailable';
  count?: number;
  passageId?: string;
}

interface PlayAlongProps {
  measures: readonly TabMeasure[];
  tuningNotes: readonly string[] | null;
  readPosition: () => PlayAlongPosition;
  running: boolean;
}

const HEIGHT = 280;
const PLAY_LINE = 72;
const LANE_START = 36;
const EPSILON = 1e-9;

function shownOffset(position: PlayAlongPosition, timeline: readonly ScoreBeat[], reduced: boolean) {
  if (!reduced) return position.offset;
  if (position.state === 'count-in') return position.start + Math.floor(position.offset - position.start);
  return timeline.find(beat => beat.segment === position.segment && beat.endSegment === position.segment
    && beat.start <= position.offset && beat.end > position.offset)?.start ?? position.offset;
}

export function PlayAlong({ measures, tuningNotes, readPosition, running }: PlayAlongProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();
  const [width, setWidth] = useState(320);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [, redraw] = useState(0);
  const timeline = useMemo(() => buildScoreTimeline(measures), [measures]);
  const events = useMemo(() => timeline.map(beat => ({ ...beat, notes: getBeatsFromMeasure(measures[beat.measureIndex])[beat.beatIndex] })), [timeline, measures]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let previous = '';
    const tick = () => {
      const position = readPosition();
      const key = [position.segment, shownOffset(position, timeline, reducedMotion), position.start,
        position.end, position.state, position.count, position.passageId].join(':');
      // Reduced motion redraws only when the event or transport state changes.
      if (key !== previous) { previous = key; redraw(value => value + 1); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [readPosition, running, reducedMotion, timeline]);

  const position = readPosition();
  const offset = shownOffset(position, timeline, reducedMotion);
  const available = position.state !== 'unavailable';
  const range = available ? events.filter(beat => beat.segment === position.segment && beat.endSegment === position.segment
    && beat.start >= position.start - EPSILON && beat.start < position.end - EPSILON) : [];
  const current = position.state === 'ended' || position.state === 'count-in' ? undefined
    : range.find(beat => offset >= beat.start - EPSILON && offset < beat.end - EPSILON);
  const right = Math.max(PLAY_LINE + 32, width - 16);
  // Keep the scale stable for the whole bounded passage. Dense rhythms show less
  // lookahead rather than squeezing adjacent fret numbers over one another.
  const shortest = range.reduce((duration, beat) => Math.min(duration, beat.end - beat.start), Infinity);
  const pixelsPerBeat = Math.max(72, 32 / shortest, (right - PLAY_LINE) / 8);
  const xAt = (at: number) => PLAY_LINE + (at - offset) * pixelsPerBeat;
  // Remove a badge as a whole at either edge; a clipped "12" must not read as "2".
  const visible = range.filter(beat => xAt(beat.start) >= LANE_START + 14 && xAt(beat.start) <= width - 14);
  const stateLabel = position.state === 'count-in' ? `Count in${position.count ? ` · ${position.count}` : ''}`
    : position.state === 'ended' ? 'Passage finished'
      : position.state === 'unavailable' ? 'Timing unavailable'
        : position.state === 'ready' ? 'Ready' : position.state === 'paused' ? 'Paused' : 'Playing';
  const location = current ? `Measure ${current.measureIndex + 1} · beat ${current.beatIndex + 1}` : '';
  const strings = Array.from({ length: 6 }, (_, index) => tuningNotes?.[index] ?? `${index + 1}`);

  return <section className="play-along" aria-label="Play-along tablature" data-testid="play-along"
    data-state={position.state} data-offset={offset} data-segment={position.segment} data-motion={reducedMotion ? 'stepped' : 'smooth'}>
    <div className="play-along-context">
      <span>{location || stateLabel}</span>
      {location && <span className="play-along-state">{stateLabel}</span>}
      {reducedMotion && <span className="play-along-state">Stepped motion</span>}
    </div>
    <svg ref={svgRef} className="play-along-lanes" width="100%" height={HEIGHT} role="img"
      aria-label={`Six string lanes with fret numbers approaching the play line. ${stateLabel}.${location ? ` ${location}.` : ''}`}>
      <defs><clipPath id={clipId}><rect x={LANE_START} y={44} width={Math.max(0, width - LANE_START)} height={222} /></clipPath></defs>
      <text className="play-along-heading" x={PLAY_LINE} y={20} textAnchor="middle">Play here</text>
      <text className="play-along-heading play-along-muted" x={right} y={20} textAnchor="end">Coming next</text>
      {strings.map((label, string) => {
        const y = 64 + string * 36;
        return <g key={string}>
          <text className="play-along-string" x={16} y={y} dominantBaseline="central" textAnchor="middle">{label}</text>
          <line className="play-along-string-line" x1={LANE_START} x2={right} y1={y} y2={y} />
        </g>;
      })}
      {visible.filter(beat => beat.beatIndex === 0 && xAt(beat.start) > PLAY_LINE + 28).map(beat => <g key={`${beat.measureIndex}:${beat.beatIndex}`}>
        <line className="play-along-measure-line" x1={xAt(beat.start)} x2={xAt(beat.start)} y1={48} y2={260} />
        <text className="play-along-measure" x={xAt(beat.start)} y={40} textAnchor="middle">M{beat.measureIndex + 1}</text>
      </g>)}
      <rect className="play-along-cursor-wash" x={PLAY_LINE - 4} y={46} width={8} height={216} rx={4} />
      <line className="play-along-cursor" x1={PLAY_LINE} x2={PLAY_LINE} y1={46} y2={262} />
      <g clipPath={`url(#${clipId})`}>
        {visible.flatMap(beat => beat.notes.rest ? [] : (beat.notes.notes ?? []).filter(note => !note.rest
          && Number.isInteger(note.string) && note.string >= 0 && note.string < 6
          && (note.dead || Number.isInteger(note.fret) && note.fret >= 0 && note.fret <= 36)).map((note, index) => {
          const active = beat === current;
          const x = xAt(beat.start);
          const y = 64 + note.string * 36;
          return <g className="play-along-note" key={`${beat.measureIndex}:${beat.beatIndex}:${index}`}
            transform={`translate(${x}, ${y})`} data-current={active} data-past={!active && beat.start < offset}
            data-measure={beat.measureIndex} data-beat={beat.beatIndex} data-string={note.string} data-fret={note.dead ? 'x' : note.fret}>
            <rect x={-14} y={-14} width={28} height={28} rx={7} />
            <text textAnchor="middle" dominantBaseline="central">{note.dead ? 'x' : note.fret}</text>
          </g>;
        }))}
      </g>
    </svg>
    <p className="play-along-caption">{!available ? 'This section has no usable timing. Choose a timed passage or use Tab.'
      : position.state === 'ended' ? 'Replay this passage or choose another measure.'
        : 'Read from right to left. Stacked notes are played together.'}</p>
  </section>;
}
