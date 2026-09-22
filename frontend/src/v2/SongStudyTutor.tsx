import { useEffect, useRef, useState } from 'react';
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
  const span = selection.type === 'beat' ? `M${selection.measureIndex + 1} · beat ${selection.beatIndex + 1}`
    : `M${selection.startMeasureIndex + 1}–${selection.endMeasureIndex + 1}`;
  return <div className={`song-study-tutor${open ? ' is-open' : ''}`}>
    <button ref={trigger} type="button" className="music-button song-tutor-launcher" aria-expanded={open} aria-controls="song-tutor-sidebar" onClick={() => setOpen(true)} hidden={open}>Ask about selection</button>
    <section id="song-tutor-sidebar" className="song-tutor-sidebar" style={{ '--song-tutor-height': `${height}dvh` } as import('react').CSSProperties} aria-label="Song Tutor" hidden={!open} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <header className="song-tutor-toolbar"><strong>Song Tutor · {span}</strong><button ref={closeButton} type="button" className="music-button" aria-label="Close Tutor" onClick={close}>Close</button></header>
      <details className="song-tutor-size"><summary>Resize chat</summary>
        <label className="song-tutor-width">Width<input aria-label="Chat width" type="range" min="320" max="640" step="20" value={width} onChange={event => onWidthChange(Number(event.target.value))} /></label>
        <label className="song-tutor-height">Height<input aria-label="Chat height" type="range" min="35" max="95" step="5" value={height} onChange={event => setHeight(Number(event.target.value))} /></label>
        <button type="button" className="learning-text-button" onClick={() => { onWidthChange(360); setHeight(70); }}>Reset size</button>
      </details>
      <div className="song-tutor-body">
    {branch ? <TutorPanel key={branch.id} branch={branch} context={`${song.payload.title} · ${song.payload.track.name} · ${span}`} songContext={{ artifact_id: song.id, selection }} busy={busy} onBusy={setBusy} onRefresh={async updated => setBranch(updated)} />
      : error ? <p role="alert">{error} <button type="button" className="music-button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Retry</button></p>
        : <p role="status">Opening your song conversation…</p>}
      </div>
    </section>
  </div>;
}
