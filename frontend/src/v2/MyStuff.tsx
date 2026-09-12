import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { Artifact, ArtifactRevision, LibraryItem } from '../types/v2';

const button = 'music-button';
const names = { song_study: 'Song', progression: 'Progression', exercise: 'Exercise' };

export function SaveToLibrary({ artifact, onSaved }: { artifact: Pick<Artifact, 'id' | 'updated_at' | 'saved_at'>; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" className={button} disabled={busy || Boolean(artifact.saved_at)} onClick={async () => {
      setBusy(true); setError(false);
      try { await apiClient.saveArtifact(artifact.id, artifact.updated_at); await onSaved(); } catch { setError(true); } finally { setBusy(false); }
    }}>{artifact.saved_at ? 'Saved to My Stuff' : busy ? 'Saving…' : 'Save to My Stuff'}</button>
    {error && <p role="alert" className="text-sm">Could not save. Reopen this workspace to refresh it and try again.</p>}
  </div>;
}

export function MyStuff({ onOpen }: { onOpen: (item: LibraryItem) => Promise<void> }) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [histories, setHistories] = useState<Record<string, ArtifactRevision[]>>({});
  const [filter, setFilter] = useState('all');
  useEffect(() => { let live = true; apiClient.listLibrary().then(value => { if (live) setItems(value); }).catch(() => { if (live) setError('Could not load My Stuff. Try again from Home.'); }); return () => { live = false; }; }, []);
  const act = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch { setError('Could not complete that action. Reopen My Stuff to refresh it and try again.'); } finally { setBusy(false); } };
  return <section className="learning-library my-5 space-y-3" aria-labelledby="my-stuff-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="my-stuff-heading" className="text-lg font-bold">My Stuff</h2><p className="text-sm text-[var(--text-secondary)]">Saved songs, progressions and practice drills.</p></div>
    <label className="learning-library-filter">Show <select aria-label="Filter saved work" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All work</option>{Object.entries(names).map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}</select></label></div>
    {error && <p role="alert">{error}</p>}
    {items === null && !error && <p role="status">Loading saved work…</p>}
    {items?.length === 0 && <p className="text-sm text-[var(--text-secondary)]">Save a song, progression or exercise to find it here.</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items?.filter(item => filter === 'all' || item.kind === filter).map(item => {
      const provenance = item.provenance;
      const source = provenance?.title ?? provenance?.artifact_title ?? provenance?.study;
      return <article key={item.id} data-testid="library-item" className="min-w-0 rounded-xl border border-[var(--border-primary)] bg-[var(--card-bg)] p-4 space-y-3">
        <div><span className="text-xs font-semibold text-[var(--accent-700)]">{names[item.kind]}</span><h3 className="font-bold break-words">{item.title}</h3><p className="text-xs text-[var(--text-secondary)]">Saved {new Date(item.saved_at ?? item.created_at).toLocaleDateString()}</p>
        {provenance && <p className="mt-1 text-xs text-[var(--text-secondary)]">From {typeof source === 'string' ? source : 'earlier musical work'} · historical reference</p>}</div>
        <div className="flex flex-wrap gap-2"><button type="button" aria-label={`Open ${item.title}`} className={button} disabled={busy} onClick={() => act(async () => onOpen(item))}>Open</button>
        <button type="button" className={button} disabled={busy} aria-expanded={Boolean(histories[item.id])} onClick={() => act(async () => {
          if (histories[item.id]) { setHistories(current => { const next = { ...current }; delete next[item.id]; return next; }); }
          else { const history = await apiClient.artifactRevisions(item.id); setHistories(current => ({ ...current, [item.id]: history })); }
        })}>History</button></div>
        {histories[item.id] && <ol className="space-y-2 border-t border-[var(--border-primary)] pt-3">{histories[item.id].map((revision, i) => <li key={revision.revision} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>Version {i + 1}{revision.current ? ' · Current' : ''}<time className="block text-xs text-[var(--text-secondary)]">{new Date(revision.revision).toLocaleString()}</time></span>
          {!revision.current && <button type="button" aria-label={`Restore version ${i + 1}`} className={button} disabled={busy} onClick={() => act(async () => {
            const updated = await apiClient.restoreArtifact(item.id, revision.revision, histories[item.id].find(r => r.current)!.revision);
            setItems(current => current?.map(a => a.id === item.id ? { ...a, updated_at: updated.updated_at } : a) ?? null);
            const history = await apiClient.artifactRevisions(item.id); setHistories(current => ({ ...current, [item.id]: history }));
          })}>Restore</button>}
        </li>)}</ol>}
      </article>;
    })}</div>
  </section>;
}
