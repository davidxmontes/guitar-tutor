import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, KeyboardEvent } from 'react';
import type { SongSelection, SongStudyArtifact, V2Branch } from '../types/v2';
import { TutorPanel } from './TutorPanel';

export function SongStudyTutor({ song, selection, ensureBranch, width, onWidthChange }: {
  width: number; onWidthChange: (width: number) => void;
  song: SongStudyArtifact; selection: SongSelection; ensureBranch: () => Promise<V2Branch>;
}) {
  const [height, setHeight] = useState(70);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);
  const [branch, setBranch] = useState<V2Branch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<Promise<V2Branch> | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open || branch) return;
    let live = true;
    pending.current ??= ensureBranch();
    void pending.current.then(value => { if (live) { setBranch(value); setError(''); } }).catch(() => {
      pending.current = null;
      if (live) setError('Could not open this song’s conversation. Please try again.');
    });
    return () => { live = false; };
    // A selection or video tick must not restart conversation setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branch, attempt]);
  const drag = useRef<{ x: number; y: number; width: number; height: number; mobile: boolean } | null>(null);
  const resizeWidth = (value: number) => onWidthChange(Math.max(320, Math.min(640, window.innerWidth * .45, value)));
  const resizeHeight = (value: number) => setHeight(Math.max(35, Math.min(95, value)));
  const startResize = (event: PointerEvent<HTMLDivElement>, mobile: boolean) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, width: Math.min(width, window.innerWidth * .45), height, mobile };
  };
  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    if (start.mobile) resizeHeight(start.height + (start.y - event.clientY) / window.innerHeight * 100);
    else resizeWidth(start.width + start.x - event.clientX);
  };
  const keyResize = (event: KeyboardEvent<HTMLDivElement>, mobile: boolean) => {
    const grow = mobile ? 'ArrowUp' : 'ArrowLeft';
    const shrink = mobile ? 'ArrowDown' : 'ArrowRight';
    if (![grow, shrink, 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const value = event.key === 'Home' ? (mobile ? 35 : 320) : event.key === 'End' ? (mobile ? 95 : 640)
      : (mobile ? height : width) + (event.key === grow ? 1 : -1) * (mobile ? 5 : 20);
    if (mobile) resizeHeight(value); else resizeWidth(value);
  };
  const span = selection.type === 'beat' ? `M${selection.measureIndex + 1} · beat ${selection.beatIndex + 1}`
    : `M${selection.startMeasureIndex + 1}–${selection.endMeasureIndex + 1}`;
  return <div className={`song-study-tutor${open ? ' is-open' : ''}`}>
    <button ref={trigger} type="button" className="music-button song-tutor-launcher" aria-expanded={open} aria-controls="song-tutor-sidebar" onClick={() => setOpen(true)} hidden={open}>Ask about selection</button>
    <section id="song-tutor-sidebar" className="song-tutor-sidebar" style={{ '--song-tutor-height': `${height}dvh` } as import('react').CSSProperties} aria-label="Song Tutor" hidden={!open} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      {[false, true].map(mobile => <div key={String(mobile)} className={`song-tutor-resizer ${mobile ? 'song-tutor-resizer--height' : 'song-tutor-resizer--width'}`}
        role="separator" tabIndex={0} aria-label={mobile ? 'Resize chat height' : 'Resize chat width'} aria-orientation={mobile ? 'horizontal' : 'vertical'}
        aria-valuemin={mobile ? 35 : 320} aria-valuemax={mobile ? 95 : 640} aria-valuenow={Math.round(mobile ? height : width)}
        title="Drag to resize · arrow keys to adjust · double-click to reset"
        onPointerDown={event => startResize(event, mobile)} onPointerMove={moveResize}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => keyResize(event, mobile)} onDoubleClick={() => { onWidthChange(360); setHeight(70); }} />)}
      <header className="song-tutor-toolbar"><strong>Song Tutor · {span}</strong><button ref={closeButton} type="button" className="music-button" aria-label="Close Tutor" onClick={close}>Close</button></header>
      <div className="song-tutor-body">
    {branch ? <TutorPanel key={branch.id} branch={branch} context={`${song.payload.title} · ${song.payload.track.name} · ${span}`} songContext={{ artifact_id: song.id, selection }} busy={busy} onBusy={setBusy} onRefresh={async updated => setBranch(updated)} />
      : error ? <p role="alert">{error} <button type="button" className="music-button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Retry</button></p>
        : <p role="status">Opening your song conversation…</p>}
      </div>
    </section>
  </div>;
}
