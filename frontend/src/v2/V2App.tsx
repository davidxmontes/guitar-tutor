import { useCallback, useEffect, useState } from 'react';
import { SignInButton } from '@clerk/clerk-react';
import { apiClient } from '../api/client';
import { useAppAuth } from '../lib/authBypass';
import { BranchNavigation } from './BranchNavigation';
import { HarmonyWorkspace } from './HarmonyWorkspace';
import { ProgressionWorkspace } from './ProgressionWorkspace';
import { SongStudySearch, SongStudyWorkspace } from './SongStudy';
import { MyStuff } from './MyStuff';
import { ExerciseWorkspace } from './ExerciseWorkspace';
import type { ExerciseArtifact, LibraryItem, SongStudyArtifact, V2Branch, V2Session } from '../types/v2';

export function V2App() {
  const { getToken, isSignedIn, isLoaded } = useAppAuth();
  const [sessions, setSessions] = useState<V2Session[] | null>(null);
  const [activeSession, setActiveSession] = useState<V2Session | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [artifactView, setArtifactView] = useState<SongStudyArtifact | ExerciseArtifact | 'search' | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      apiClient.setTokenGetter(null);
      return;
    }
    apiClient.setTokenGetter(() => getToken());
    apiClient.listV2Sessions().then(setSessions).catch((err) => setError(String(err)));
  }, [isSignedIn, getToken]);

  const openSession = useCallback((session: V2Session) => {
    setArtifactView(null);
    setActiveSession(session);
    setActiveBranchId(session.branches.find((branch) => !branch.closed)?.id ?? null);
  }, []);

  const studySong = async () => {
    try {
      if (!activeSession || !activeBranchId) {
        const session = await apiClient.createV2Session();
        openSession(session);
        setSessions(previous => [session, ...(previous ?? [])]);
      }
      setArtifactView('search');
    } catch (err) { setError(String(err)); }
  };

  const openSaved = async (item: LibraryItem) => {
    if (item.kind === 'song_study') setArtifactView(await apiClient.getSongStudy(item.id));
    else if (item.kind === 'exercise') setArtifactView(await apiClient.getExercise(item.id));
    else {
      const session = await apiClient.openLibraryArtifact(item.id);
      openSession(session);
      setSessions(previous => [session, ...(previous ?? [])]);
    }
  };

  const handleConcept = async (value: string) => {
    const match = /^([A-G](?:#|b)?)\s*(.*)$/i.exec(value.trim());
    if (!match) { setError('Enter a root and scale, such as A Dorian.'); return; }
    const root = match[1][0].toUpperCase() + match[1].slice(1);
    const mode = (match[2] || 'major').toLowerCase().replaceAll(' ', '_');
    try {
      const qualities: Record<string, string> = { maj7: 'major7', m7: 'minor7', '7': 'dominant7', m: 'minor', maj: 'major', dim: 'diminished', aug: 'augmented' };
      const chord = qualities[mode];
      const session = await apiClient.openHarmony(root, chord ?? (mode === 'minor' ? 'natural_minor' : mode), !!chord);
      openSession(session); setSessions(previous => [session, ...(previous ?? [])]); setError(null);
    } catch (err) { setError(String(err)); }
  };

  const handleStart = async () => {
    try {
      const session = await apiClient.createV2Session();
      openSession(session);
      setSessions((prev) => [session, ...(prev ?? [])]);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleContinue = async (sessionId: string) => {
    try {
      openSession(await apiClient.getV2Session(sessionId));
    } catch (err) {
      setError(String(err));
    }
  };

  const patchBranch = useCallback((updated: V2Branch) => {
    setActiveSession((prev) => prev && {
      ...prev,
      branches: prev.branches.map((branch) => (branch.id === updated.id ? updated : branch)),
    });
  }, []);

  const handleNewBranch = async () => {
    if (!activeSession) return;
    try {
      const branch = await apiClient.createV2Branch(activeSession.id, {});
      setActiveSession((prev) => prev && { ...prev, branches: [...prev.branches, branch] });
      setActiveBranchId(branch.id);
    } catch (err) {
      setError(String(err));
    }
  };

  const runBranchClosedState = async (branchId: string, closed: boolean) => {
    if (!activeSession) return;
    try {
      const updated = await apiClient.updateV2Branch(activeSession.id, branchId, { closed });
      patchBranch(updated);
      if (closed && activeBranchId === branchId) {
        setActiveBranchId(activeSession.branches.find((b) => b.id !== branchId && !b.closed)?.id ?? null);
      }
      if (!closed && !activeBranchId) setActiveBranchId(branchId);
    } catch (err) {
      setError(String(err));
    }
  };

  if (!isLoaded) return null;
  if (!isSignedIn) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-black">Guitar Tutor</h1>
        <p>Sign in to start or resume a session.</p>
        <SignInButton mode="modal" />
      </div>
    );
  }

  if (artifactView) return <main className="mx-auto max-w-7xl p-4 sm:p-6">
    <div className="music-controls mb-4"><h1 className="text-2xl font-black">Guitar Tutor</h1>
      <button className="music-button" onClick={() => setArtifactView(null)}>{activeSession ? 'Back to workspace' : 'Explore'}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {artifactView === 'search' ? activeSession && activeBranchId && <SongStudySearch sessionId={activeSession.id} branchId={activeBranchId} onCreated={setArtifactView} />
      : artifactView.kind === 'song_study' ? <SongStudyWorkspace key={artifactView.id} songStudy={artifactView} onSongStudyChange={setArtifactView} onSearchAgain={studySong} />
      : <ExerciseWorkspace key={artifactView.id} artifact={artifactView} />}
  </main>;

  if (activeSession) {
    const branch = activeSession.branches.find((candidate) => candidate.id === activeBranchId && !candidate.closed) ?? null;
    return (
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-black">Guitar Tutor</h1>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-[var(--border-primary)] px-3 py-2 text-sm font-semibold"
            onClick={() => { setActiveSession(null); apiClient.listV2Sessions().then(setSessions).catch((err) => setError(String(err))); }}
          >
            Explore
          </button>
        </div>
        <button className="music-button" onClick={studySong}>Study a song</button>
        <p hidden data-testid="v2-active-session">Session {activeSession.id}</p>
        <p hidden data-testid="v2-active-branch">Branch {branch?.id}</p>
        {error && <p role="alert">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            data-testid="v2-new-branch"
            onClick={handleNewBranch}
            className="min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}
          >
            New branch
          </button>
        </div>
        <BranchNavigation
          branches={activeSession.branches}
          activeBranchId={branch?.id ?? null}
          onSelect={setActiveBranchId}
          onClose={(id) => runBranchClosedState(id, true)}
          onReopen={(id) => runBranchClosedState(id, false)}
        />
        {branch?.harmony_exploration && branch.progression_workspace && <nav aria-label="Workspaces" className="music-controls">{(['harmony', 'progression'] as const).map(kind => <button key={kind} className="music-button" aria-pressed={branch.active_workspace === kind} onClick={() => { apiClient.updateV2Branch(branch.session_id, branch.id, { active_workspace: kind }).then(patchBranch).catch(err => setError(String(err))); }}>{kind === 'harmony' ? 'Harmony' : 'Progression'}</button>)}</nav>}
        {branch && (
          <section id={`workspace-panel-${branch.id}`} role="tabpanel" aria-labelledby={`workspace-tab-${branch.id}`}>
            {branch.active_workspace === 'harmony' ? <HarmonyWorkspace key={branch.id} branch={branch} onChange={patchBranch} /> : <ProgressionWorkspace key={branch.id} branch={branch} onChange={patchBranch} />}
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <h1 className="text-2xl font-black">Guitar Tutor</h1>
      {error && <p role="alert">{error}</p>}
      {sessions === null && <p role="status">Loading your work…</p>}
      {sessions !== null && sessions.length > 0 && (
        <section className="my-5" aria-labelledby="continue-heading">
          <h2 id="continue-heading" className="text-lg font-bold">Continue where you left off</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => {
              const open = session.branches.find((b) => !b.closed);
              return (
                <button
                  key={session.id}
                  type="button"
                  data-testid="v2-continue-session"
                  data-session-id={session.id}
                  onClick={() => handleContinue(session.id)}
                  className="min-h-20 rounded-xl border p-4 text-left"
                  style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}
                >
                  <strong className="block">{open?.title ?? 'Saved work'}</strong>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Continue workspace</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <button className="music-button" onClick={studySong}>Study a song</button>
      <MyStuff onOpen={openSaved} />
      <form onSubmit={event => { event.preventDefault(); void handleConcept(search); }} className="my-4">
        <label htmlFor="explore-scale">Explore a scale, key or chord</label>
        <div className="music-controls"><input id="explore-scale" placeholder="A Dorian" value={search} onChange={event => setSearch(event.target.value)} style={{ width: 'min(100%, 24rem)' }} />
          <button className="music-button" type="submit">Explore music</button></div>
      </form>
      <button type="button" className="music-button" onClick={() => void handleConcept('A Dorian')}>What makes A Dorian different?</button>
      <button type="button" className="music-button" onClick={() => { apiClient.openProgression().then(session => { openSession(session); setSessions(previous => [session, ...(previous ?? [])]); }).catch(err => setError(String(err))); }}>Build a four-chord progression</button>
      <button type="button" data-testid="v2-start-session" onClick={handleStart}>
        Start something new
      </button>
    </main>
  );
}
