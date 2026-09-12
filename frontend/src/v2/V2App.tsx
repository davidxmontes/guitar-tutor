import './Learning.css';
import type { HarmonyView } from './harmony';
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
import './Controls.css';

export function V2App() {
  const { getToken, isSignedIn, isLoaded } = useAppAuth();
  const [sessions, setSessions] = useState<V2Session[] | null>(null);
  const [activeSession, setActiveSession] = useState<V2Session | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [artifactView, setArtifactView] = useState<SongStudyArtifact | ExerciseArtifact | 'search' | null>(null);
  const [search, setSearch] = useState('');
  const [entryView, setEntryView] = useState<HarmonyView>('tutor');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      apiClient.setTokenGetter(null);
      return;
    }
    apiClient.setTokenGetter(() => getToken());
    apiClient.listV2Sessions().then(setSessions).catch((err) => setError(String(err)));
  }, [isSignedIn, getToken]);

  const openSession = useCallback((session: V2Session, view: HarmonyView = 'tutor') => {
    setEntryView(view);
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
    const typed = (match[2] || 'major').toLowerCase().replaceAll(' ', '_');
    const mode = ({ minor_pentatonic: 'pentatonic_minor', major_pentatonic: 'pentatonic_major', blues: 'blues', minor_scale: 'natural_minor', major_scale: 'major' } as Record<string, string>)[typed] ?? typed;
    try {
      const qualities: Record<string, string> = { maj7: 'major7', m7: 'minor7', '7': 'dominant7', m: 'minor', maj: 'major', dim: 'diminished', aug: 'augmented' };
      const chord = qualities[mode];
      const session = await apiClient.openHarmony(root, chord ?? (mode === 'minor' ? 'natural_minor' : mode), !!chord);
      openSession(session); setSessions(previous => [session, ...(previous ?? [])]); setError(null);
    } catch (err) { setError(String(err)); }
  };

  const startActivity = async (view: HarmonyView) => {
    if (opening) return;
    setOpening(true); setError(null);
    try {
      const chord = ['triads', 'shapes', 'caged'].includes(view);
      const session = await apiClient.openHarmony('C', 'major', chord);
      openSession(session, view); setSessions(previous => [session, ...(previous ?? [])]);
    } catch (err) { setError(String(err)); } finally { setOpening(false); }
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

  const deleteSession = async (session: V2Session) => {
    if (!window.confirm('Delete this session and its conversations and unsaved work? Saved library items will stay.')) return;
    setDeleting(session.id); setError(null);
    try {
      await apiClient.deleteV2Session(session.id);
      setSessions(previous => previous?.filter(value => value.id !== session.id) ?? []);
    } catch (err) { setError(String(err)); } finally { setDeleting(null); }
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
      setEntryView('tutor');
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
      <div className="v2-app p-4 sm:p-6">
        <h1 className="learning-brand">Guitar Tutor<span aria-hidden="true">.</span></h1>
        <p>Sign in to start or resume a session.</p>
        <SignInButton mode="modal" />
      </div>
    );
  }

  if (artifactView) return <main className="v2-app mx-auto max-w-7xl p-4 sm:p-6">
    <div className="music-controls mb-4"><h1 className="learning-brand">Guitar Tutor<span aria-hidden="true">.</span></h1>
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
      <main className="v2-app learning-app">
        <div className="learning-app-header">
          <h1 className="learning-brand">Guitar Tutor<span aria-hidden="true">.</span></h1>
          <div className="music-controls">
          <button
            type="button"
            className="music-button"
            onClick={() => { setActiveSession(null); apiClient.listV2Sessions().then(setSessions).catch((err) => setError(String(err))); }}
          >
            Explore
          </button>
          <button className="music-button" onClick={studySong}>Study a song</button>
          <button className="music-button" data-testid="v2-new-branch" onClick={handleNewBranch}>New branch</button>
          </div>
        </div>
        <p hidden data-testid="v2-active-session">Session {activeSession.id}</p>
        <p hidden data-testid="v2-active-branch">Branch {branch?.id}</p>
        {error && <p role="alert">{error}</p>}
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
            {branch.active_workspace === 'harmony' ? <HarmonyWorkspace key={branch.id} initialView={entryView} branch={branch} onChange={patchBranch} /> : <ProgressionWorkspace key={branch.id} branch={branch} onChange={patchBranch} />}
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="v2-app learning-app learning-home">
      <header className="learning-app-header"><h1 className="learning-brand">Guitar Tutor<span aria-hidden="true">.</span></h1><button className="music-button" onClick={studySong}>Study a song</button></header>
      {error && <p className="learning-error" role="alert">{error}</p>}
      <section className="learning-intro" aria-labelledby="learning-start"><span className="learning-eyebrow">A little curiosity. A little practice.</span><h2 id="learning-start">What would you like<br />to play today?</h2><p>Find a sound, understand how it works, and take it under your fingers.<br />Start anywhere. Your Tutor will help you take the next step.</p></section>
      <section aria-label="Choose a learning activity" className="learning-activities">
        <button aria-label="Learn the fretboard" disabled={opening} onClick={() => void startActivity('fretboard')}><span className="learning-activity-number">01 / SCALES</span><strong>Learn the fretboard</strong><p>Find the roots. Hear a scale. Make a phrase from a few notes.</p><span className="learning-activity-action">Explore scales →</span></button>
        <button disabled={opening} onClick={() => void startActivity('triads')}><span className="learning-activity-number">02 / TRIADS</span><strong>Three notes. More of the neck.</strong><p>Follow a chord through inversions, one string set at a time.</p><span className="learning-activity-action">Explore triads →</span></button>
        <button disabled={opening} onClick={() => void startActivity('shapes')}><span className="learning-activity-number">03 / CHORD SHAPES</span><strong>Find your next shape</strong><p>See playable voicings, compare their sound, and connect CAGED shapes.</p><span className="learning-activity-action">Explore shapes →</span></button>
        <button disabled={opening} aria-label="Build a four-chord progression" onClick={async () => { setOpening(true); try { const session = await apiClient.openProgression(); openSession(session); setSessions(previous => [session, ...(previous ?? [])]); } catch (err) { setError(String(err)); } finally { setOpening(false); } }}><span className="learning-activity-number">04 / PROGRESSIONS</span><strong>Make the chords connect</strong><p>Hear an idea, change a chord, and practise the transitions.</p><span className="learning-activity-action">Build a progression →</span></button>
      </section>
      <div className="learning-home-tools"><button className="music-button" disabled={opening} onClick={() => void startActivity('circle')}>Explore the circle of fifths</button><button className="music-button" disabled={opening} onClick={() => void startActivity('caged')}>Connect the CAGED shapes</button><button className="learning-text-button" type="button" data-testid="v2-start-session" onClick={handleStart}>Start something new</button></div>
      {opening && <p role="status">Opening your music…</p>}
      <form onSubmit={event => { event.preventDefault(); void handleConcept(search); }} className="learning-search">
        <div><label htmlFor="explore-scale">Explore a scale, key or chord</label><p>Have something in mind? Try C major, A minor pentatonic, or Dm7.</p></div>
        <div className="music-controls"><input id="explore-scale" placeholder="A Dorian" value={search} onChange={event => setSearch(event.target.value)} /><button className="music-button learning-primary" type="submit">Explore music</button></div>
        <button className="learning-text-button" type="button" onClick={() => void handleConcept('A Dorian')}>What makes A Dorian different?</button>
      </form>
      {sessions === null && <p role="status">Loading your work…</p>}
      {sessions !== null && sessions.length > 0 && <section className="learning-recent" aria-labelledby="continue-heading"><h2 id="continue-heading">Continue where you left off</h2><div className="learning-recent-list">{sessions.map(session => { const open = session.branches.find(branch => !branch.closed); return <div className="learning-session-row" key={session.id}><button type="button" data-testid="v2-continue-session" data-session-id={session.id} onClick={() => handleContinue(session.id)}><span className="learning-eyebrow">{open?.active_workspace ?? 'Session'}</span><strong>{open?.title ?? 'Saved work'}</strong><span>Continue →</span></button><button className="session-delete" aria-label={`Delete session: ${open?.title ?? 'Saved work'}`} title="Delete session" disabled={deleting !== null} onClick={() => void deleteSession(session)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v8m4-8v8" /></svg></button></div>; })}</div></section>}
      <MyStuff onOpen={openSaved} />
    </main>
  );
}
