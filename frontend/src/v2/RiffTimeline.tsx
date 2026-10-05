import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { RiffEvent, RiffPayload } from '../types/v2';
import type { TimedPlayback } from '../utils/audio';
import { midiToNoteName } from '../utils/tuning';
import { riffTimeline, describeRiffEvent } from './riff';
import { PlayAlongLanes } from './PlayAlongLanes';
import { usePlayAlongBoard } from './usePlayAlongBoard';

export function RiffTimeline({ payload, selectedId, onSelect, preview }: {
  payload: RiffPayload; selectedId: string | null; onSelect: (id: string) => void; preview: RiffEvent[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320), [browsed, setBrowsed] = useState<{ events: RiffEvent[]; page: number } | null>(null);
  const timeline = riffTimeline(payload);
  const previewTimeline = riffTimeline({ ...payload, events: [...payload.events, ...preview] }).slice(payload.events.length);
  const span = width >= 800 ? 8 : width >= 480 ? 4 : 2;
  const total = timeline.at(-1)?.end ?? 0;
  const extent = previewTimeline.at(-1)?.end ?? total;
  const selected = timeline.find(event => event.id === selectedId);
  const automatic = Math.floor((selected?.start ?? Math.max(0, (preview.length ? total : total - .001))) / span) * span;
  const page = Math.min((browsed?.events === payload.events ? browsed.page : automatic), Math.floor(Math.max(extent - .001, 0) / span) * span);
  const x = (beat: number) => 40 + (beat - page) * (width - 64) / span;
  const y = (event: RiffEvent) => event.position ? 40 + (event.position.string - 1) * 34 : 125;
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  return <section aria-label="Your riff timeline" className="riff-timeline">
    <div className="riff-section-heading"><div><h2>Your riff</h2><span>{total} beats</span></div>
      <div className="music-controls"><button className="music-button" aria-label="Earlier beats" disabled={page === 0} onClick={() => setBrowsed({ events: payload.events, page: Math.max(0, page - span) })}>←</button><span>Bar {Math.floor(page / 4) + 1} · beat {page % 4 + 1}</span><button className="music-button" aria-label="Later beats" disabled={page + span >= extent} onClick={() => setBrowsed({ events: payload.events, page: page + span })}>→</button></div>
    </div>
    <div ref={container} className="riff-timeline-board" tabIndex={0} aria-label="Six-string riff timeline">
      <svg width="100%" height="244" role="group" aria-label="Editable riff events">
        {payload.tuning.map((open, i) => <g key={i} aria-hidden="true"><text className="riff-string-name" x={12} y={44 + i * 34}>{midiToNoteName(open)}</text><line className="riff-string-line" x1={32} x2={width - 16} y1={40 + i * 34} y2={40 + i * 34} /></g>)}
        {Array.from({ length: span * 2 + 1 }, (_, i) => <g key={i} aria-hidden="true"><line className="riff-grid-line" x1={x(page + i / 2)} x2={x(page + i / 2)} y1={20} y2={224} /><text className="riff-beat-label" x={x(page + i / 2)} y={240} textAnchor="middle">{i % 2 === 0 ? (page + i / 2) % 4 + 1 : '·'}</text></g>)}
        {[...timeline.map(event => ({ ...event, preview: false })), ...previewTimeline.map(event => ({ ...event, preview: true }))].filter(event => event.end > page && event.start < page + span).map(event => <g key={`${event.preview ? 'preview' : 'event'}-${event.id}`}
          className={`riff-timeline-event${event.preview ? ' riff-preview-event' : ''}`} role={event.preview ? undefined : 'button'} tabIndex={event.preview ? undefined : 0}
          aria-label={event.preview ? `Preview: ${describeRiffEvent(event, payload.tuning)}` : `Edit event ${payload.events.findIndex(e => e.id === event.id) + 1}: ${describeRiffEvent(event, payload.tuning)}`}
          aria-pressed={event.preview ? undefined : selectedId === event.id} transform={`translate(${Math.max(40, x(event.start))},${y(event)})`}
          onClick={event.preview ? undefined : () => { setBrowsed(null); onSelect(event.id); }}
          onKeyDown={event.preview ? undefined : e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBrowsed(null); onSelect(event.id); } }}>
          <rect className="riff-duration" x={0} y={-6} width={Math.max(0, Math.min(width - 16 - Math.max(40, x(event.start)), x(event.end) - Math.max(40, x(event.start)) - 4))} height={12} rx={4} />
          <rect className="riff-event-hit" x={-22} y={-22} width={44} height={44} />
          <rect className="riff-fret-badge" x={-16} y={-16} width={32} height={32} rx={6} /><text textAnchor="middle" dominantBaseline="central">{event.position?.fret ?? '–'}</text>
        </g>)}
      </svg>
      {!timeline.length && !preview.length && <p className="riff-empty">Tap a fret to start your riff</p>}
    </div>
  </section>;
}

export function RiffPlayAlong({ payload, transport, previewAt }: { payload: RiffPayload; transport: TimedPlayback; previewAt?: number }) {
  const timeline = useMemo(() => riffTimeline(payload), [payload]);
  const total = timeline.at(-1)?.end ?? 0;
  const readPosition = useCallback(() => ({ segment: 0, offset: total ? transport.elapsedBeats() % total : 0,
    start: 0, end: total, state: 'playing' as const }), [transport, total]);
  const { svgRef, clipId, width, offset, reducedMotion } = usePlayAlongBoard(readPosition, true, timeline);
  const current = timeline.find(event => event.start <= offset && event.end > offset);
  const pixels = Math.max(96, (width - 88) / 4), x = (beat: number) => 72 + (beat - offset) * pixels;
  const visible = timeline.filter(event => event === current || (event.start > offset && x(event.start) >= 108 && x(event.start) <= width - 16));
  return <section className="play-along" data-testid="riff-play-along" data-offset={offset} data-motion={reducedMotion ? 'stepped' : 'smooth'}>
    <div className="play-along-context"><strong>{previewAt === undefined ? 'Play-along' : offset < previewAt ? 'Preview · your ending' : 'Preview · suggestion'}</strong><span>{current && describeRiffEvent(current, payload.tuning)}</span></div>
    <PlayAlongLanes svgRef={svgRef} clipId={clipId} width={width} tuningNotes={payload.tuning.map(note => midiToNoteName(note))} label="Six-string riff Play-along" description={visible.map(e => describeRiffEvent(e, payload.tuning)).join('. ')}>
      <g clipPath={`url(#${clipId})`}>{visible.map(event => <g key={event.id} className={`play-along-note ${previewAt !== undefined && event.start >= previewAt ? 'riff-preview-event' : ''}`} data-current={event === current}
        transform={`translate(${event === current ? 72 : x(event.start)}, ${event.position ? 64 + (event.position.string - 1) * 36 : 154})`}>
        <rect className="riff-duration" x={0} y={-4} width={Math.min(width - 16 - (event === current ? 72 : x(event.start)), Math.max(0, x(event.end) - (event === current ? 72 : x(event.start)) - 4))} height={8} rx={3} />
        <rect x={-14} y={-14} width={28} height={28} rx={6} /><text className="play-along-fret" textAnchor="middle" dominantBaseline="central">{event.position?.fret ?? '–'}</text>
      </g>)}</g>
    </PlayAlongLanes>
  </section>;
}
