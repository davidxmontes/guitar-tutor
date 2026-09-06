import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import type { ExploreRecipe } from '../types/conceptWorkspace';
import type { LibraryItem, V2Session } from '../types/v2';

const button = 'min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-700)] disabled:opacity-50';
export function ExploreHome({onStart, onOpen}: {onStart: (request: ExploreRecipe['request']) => Promise<void>; onOpen: (session: V2Session) => void}) {
  const [catalog, setCatalog] = useState<ExploreRecipe[] | null>(null);
  const [recent, setRecent] = useState<LibraryItem[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let live = true;
    heading.current?.focus();
    Promise.allSettled([apiClient.exploreCatalog(), apiClient.listLibrary()]).then(([recipes, items]) => {
      if (!live) return;
      if (recipes.status === 'fulfilled') setCatalog(recipes.value);
      if (items.status === 'fulfilled') setRecent(items.value.filter(i => i.is_concept_workspace).sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0,4));
      setError(recipes.status === 'rejected' ? 'Could not load explorations. Try again.' : items.status === 'rejected' ? 'Could not load recent studies. You can still start an exploration.' : null);
    });
    return () => { live = false; };
  }, [attempt]);
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); } catch { setError('Could not open this exploration. Your saved work is unchanged. Try again.'); }
    finally { setBusy(false); }
  };
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = catalog?.filter(item => terms.every(term => `${item.title} ${item.question} ${item.search}`.toLowerCase().includes(term))) ?? [];
  const cards = (items: ExploreRecipe[]) => <div className="grid gap-3 sm:grid-cols-2">{items.map(item => <button key={item.id} aria-label={item.title} disabled={busy} className={`${button} min-w-0 p-4 text-left`} onClick={() => act(() => onStart(item.request))}>
    {item.question && <strong className="mb-2 block text-lg">{item.question}</strong>}<span className="block font-semibold text-[var(--accent-700)]">{item.title}</span><span className="mt-1 block text-sm text-[var(--text-secondary)]">{item.description}</span>
  </button>)}</div>;
  return <section aria-label="Explore" className="my-6 space-y-4">
    <header><p className="text-sm font-bold text-[var(--accent-700)]">Explore</p><h2 ref={heading} tabIndex={-1} className="text-2xl font-bold">What would you like to explore?</h2><p className="mt-2 text-[var(--text-secondary)]">Start with a question. Hear it on the guitar, then change something.</p></header>
    <label className="block font-semibold">Search concepts<input type="search" aria-label="Search concepts" maxLength={120} value={query} onChange={e => setQuery(e.target.value)} placeholder="Try CAGED, minor pentatonic, or chord resolution" className={`${button} mt-2 block w-full font-normal`} /></label>
    {error && <div role="alert"><p>{error}</p><button className={button} disabled={busy} onClick={() => setAttempt(n=>n+1)}>Retry Explore</button></div>}
    <p role="status">{busy ? 'Opening exploration…' : !catalog ? error ? '' : 'Loading explorations…' : terms.length ? matches.length ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'}` : 'No supported exploration matches that search. Try a shorter concept name, or clear Search and Browse All. Search opens the supported catalog; it does not generate new studies.' : ''}</p>
    {catalog && (terms.length ? cards(matches) : <>
      {cards(catalog.filter(item => item.starter))}
      <section aria-label="Recent studies" className="space-y-2"><h3 className="text-lg font-bold">Recent studies</h3><p className="text-sm text-[var(--text-secondary)]">Reopen a saved study to explore a fresh copy.</p>
        {recent.length ? <div className="flex flex-wrap gap-2">{recent.map(item => <button key={item.id} className={`${button} max-w-full break-words text-left`} disabled={busy} aria-label={`Resume ${item.title}`} onClick={() => act(async () => onOpen(await apiClient.openLibraryArtifact(item.id)))}>{item.title}</button>)}</div> : <p className="text-sm">Save a study while exploring to find it here.</p>}
      </section>
      <details><summary className="min-h-11 cursor-pointer rounded-lg py-3 font-semibold focus-visible:outline-2 focus-visible:outline-[var(--accent-700)]">Browse All</summary><p className="mb-3 text-sm">The four journeys above and these scale explorations are ready to open. Choose a scale to hear it beside a related scale.</p>{cards(catalog.filter(item => !item.starter))}</details>
    </>)}
  </section>;
}
