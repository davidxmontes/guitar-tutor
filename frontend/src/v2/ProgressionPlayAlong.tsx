import { useCallback, useMemo } from 'react';
import type { ExerciseStep } from '../types/v2';
import { midiToNoteName } from '../utils/tuning';
import { PlayAlongLanes } from './PlayAlongLanes';
import { usePlayAlongBoard } from './usePlayAlongBoard';
import { practicePlayAlongPosition } from './playAlongTiming';
import { buildProgressionTimeline, selectedProgressionPosition } from './progressionPlayAlongTiming';
import type { PracticeState } from './usePractice';

export function ProgressionPlayAlong({ guide, tuning, selectedIndex, practice }: {
  guide: readonly ExerciseStep[]; tuning: readonly number[]; selectedIndex: number; practice: PracticeState;
}) {
  const timeline = useMemo(() => buildProgressionTimeline(guide), [guide]);
  const selected = useMemo(() => selectedProgressionPosition(timeline, selectedIndex), [timeline, selectedIndex]);
  const readPosition = useCallback(() => practice.active
    ? practicePlayAlongPosition(selected, practice.getElapsedBeats(), practice.countIn, practice.loop, practice.running)
    : selected, [practice, selected]);
  const { svgRef, clipId, width, reducedMotion, position, offset } = usePlayAlongBoard(readPosition, practice.running, timeline);
  const current = position.state === 'count-in' ? undefined : position.state === 'ended' ? timeline.at(-1)
    : timeline.find(chord => offset >= chord.start && offset < chord.end);
  const next = current ? timeline[current.index + 1] ?? (practice.active && practice.loop ? timeline[0] : undefined) : timeline[0];
  const right = Math.max(104, width - 16);
  const annotation = (chord: (typeof timeline)[number]) => `${chord.label} · ${chord.end - chord.start} ${chord.end - chord.start === 1 ? 'beat' : 'beats'}`;
  // Chord labels set the spacing; a short chord previews less time, never overlapping labels.
  const pixelsPerBeat = timeline.reduce((scale, chord) => Math.max(scale, (annotation(chord).length * 7 + 18) / (chord.end - chord.start)), Math.max(72, (right - 72) / 8));
  const xAt = (at: number) => 72 + (at - offset) * pixelsPerBeat;
  // Reserve the current column. Admit whole fret badges independently of labels.
  const upcoming = timeline.filter(chord => chord !== current && chord.start >= offset
    && xAt(chord.start) >= (current ? 108 : 50) && xAt(chord.start) + 14 <= width);
  const visible = [...(current ? [current] : []), ...upcoming];
  const stateLabel = !timeline.length ? 'Empty progression' : position.state === 'count-in' ? `Count in · ${position.count}`
    : position.state === 'ended' ? 'Progression finished' : position.state === 'ready' ? 'Ready'
      : position.state === 'paused' ? 'Paused' : 'Playing';
  const change = current && !reducedMotion && position.state !== 'ended' ? `${Math.max(0, current.end - offset).toFixed(1)} beats ${current.index === timeline.length - 1 && practice.active && practice.loop ? 'to loop' : next ? 'to next chord' : 'to finish'}` : '';
  const description = visible.map(chord => `${annotation(chord)}: ${chord.notes.map(note => `String ${note.string + 1}, fret ${note.fret}`).join('; ')}`).join('. ');
  return <section className="play-along progression-play-along" aria-label="Progression Play-along" data-testid="progression-play-along"
    data-state={timeline.length ? position.state : 'empty'} data-offset={offset} data-motion={reducedMotion ? 'stepped' : 'smooth'}>
    <div className="play-along-context">
      <strong>{current ? annotation(current) : stateLabel}</strong>
      {current && <span className="play-along-state">{stateLabel}{change && ` · ${change}`}</span>}
      {next && <span className="play-along-state">Next: {annotation(next)}</span>}
      {reducedMotion && <span className="play-along-state">Stepped motion</span>}
    </div>
    <PlayAlongLanes svgRef={svgRef} clipId={clipId} width={width} tuningNotes={tuning.map(note => midiToNoteName(note))}
      label={`Six string lanes with progression chord shapes. ${stateLabel}.${current ? ` ${annotation(current)}.` : ''}`} description={description}>
      {upcoming.filter(chord => xAt(chord.start) + annotation(chord).length * 7 - 14 <= width).map(chord => <g key={chord.index} data-chord-label={chord.index}>
        <text className="play-along-chord-label" x={xAt(chord.start) - 14} y={40}>{annotation(chord)}</text>
        <line className="play-along-measure-line" x1={xAt(chord.start)} x2={xAt(chord.start)} y1={48} y2={260} />
      </g>)}
      {current && position.state !== 'ended' && <line className="progression-play-along-interval" x1={72} x2={Math.min(right, xAt(current.end))} y1={270} y2={270} />}
      <g clipPath={`url(#${clipId})`}>
        {visible.flatMap(chord => chord.notes.map((note, index) => <g className="play-along-note" key={`${chord.index}:${index}`}
          transform={`translate(${chord === current ? 72 : xAt(chord.start)}, ${64 + note.string * 36})`}
          data-current={chord === current} data-chord={chord.index} data-string={note.string} data-fret={note.fret}
          aria-label={`${chord.label}, string ${note.string + 1}, fret ${note.fret}`}>
          <rect x={-14} y={-14} width={28} height={28} rx={7} />
          <text className="play-along-fret" textAnchor="middle" dominantBaseline="central">{note.fret}</text>
        </g>))}
      </g>
    </PlayAlongLanes>
    <p className="play-along-caption">{!timeline.length ? 'Add a chord in Explore chords to use Play-along.'
      : 'The current shape stays at the play line until the chord changes. Stacked frets belong to one chord.'}</p>
  </section>;
}
