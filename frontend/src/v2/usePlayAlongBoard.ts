import { useEffect, useId, useRef, useState } from 'react';
import type { PlayAlongPosition } from './PlayAlong';

type Interval = { start: number; end: number; segment?: number; endSegment?: number };
function shownOffset(position: PlayAlongPosition, timeline: readonly Interval[], reduced: boolean) {
  if (!reduced) return position.offset;
  if (position.state === 'count-in') return position.start + Math.floor(position.offset - position.start);
  return timeline.find(beat => (beat.segment ?? 0) === position.segment && (beat.endSegment ?? 0) === position.segment
    && beat.start <= position.offset && beat.end > position.offset)?.start ?? position.offset;
}

export function usePlayAlongBoard(readPosition: () => PlayAlongPosition, running: boolean, timeline: readonly Interval[]) {
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();
  const [width, setWidth] = useState(320);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [, redraw] = useState(0);
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
  return { svgRef, clipId, width, reducedMotion, position, offset: shownOffset(position, timeline, reducedMotion) };
}

