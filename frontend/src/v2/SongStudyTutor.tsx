import { useEffect, useRef, useState } from 'react';
import type { SongSelection, SongStudyArtifact, V2Branch } from '../types/v2';
import { TutorPanel } from './TutorPanel';

export function SongStudyTutor({ song, selection, ensureBranch }: {
  song: SongStudyArtifact; selection: SongSelection; ensureBranch: () => Promise<V2Branch>;
}) {
  const [open, setOpen] = useState(false);
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
  return <details className="song-study-tutor" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Ask about selection</summary>
    {open && (branch ? <TutorPanel key={branch.id} branch={branch} context={`${song.payload.title} · ${song.payload.track.name} · ${span}`} songContext={{ artifact_id: song.id, selection }} busy={busy} onBusy={setBusy} onRefresh={async updated => setBranch(updated)} />
      : error ? <p role="alert">{error} <button type="button" className="music-button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Retry</button></p>
        : <p role="status">Opening your song conversation…</p>)}
  </details>;
}
