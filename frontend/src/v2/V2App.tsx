import './Learning.css';
import type { HarmonyView } from './harmony';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { SignInButton } from '@clerk/clerk-react';
import { apiClient } from '../api/client';
import { useAppAuth } from '../lib/authBypass';
import { BranchNavigation } from './BranchNavigation';
import { HarmonyWorkspace } from './HarmonyWorkspace';
import { ProgressionWorkspace } from './ProgressionWorkspace';
import { SongStudySearch, SongStudyWorkspace, type SongSearchState } from './SongStudy';
import { MyStuff } from './MyStuff';
import { ExerciseWorkspace } from './ExerciseWorkspace';
import type { ExerciseArtifact, LibraryItem, SongStudyArtifact, V2Branch, V2Session } from '../types/v2';
import './Controls.css';
import { AppShell } from './AppShell';
import { ThemeToggle } from './ThemeToggle';

export function V2App() {
  const { getToken, isSignedIn, isLoaded, userId } = useAppAuth();
  // Bind auth before descendant effects load account-owned work.
  useLayoutEffect(() => {
    apiClient.setTokenGetter(isLoaded && isSignedIn ? () => getToken() : null);
    return () => apiClient.setTokenGetter(null);
  }, [getToken, isLoaded, isSignedIn, userId]);

  if (!isLoaded) return <main className="v2-app sign-in-page"><p role="status">Opening Guitar Tutor…</p></main>;
  if (!isSignedIn) return <main className="v2-app sign-in-page">
    <div className="sign-in-theme"><ThemeToggle /></div>
    <div className="sign-in-card">
      <div className="sign-in-story"><span className="learning-brand">Guitar Tutor<span aria-hidden="true">.</span></span>
        <div><span className="learning-eyebrow">A little curiosity. A little practice.</span><h1>Make the neck<br />feel like home.</h1><p>Explore a sound. Find its shape.<br />Make it part of your playing.</p></div>
        <div className="sign-in-notes" aria-label="C major triad: C, E, G"><span>C<small>Root</small></span><i aria-hidden="true" /><span>E<small>Third</small></span><i aria-hidden="true" /><span>G<small>Fifth</small></span></div>
      </div>
      <section className="sign-in-action"><span className="learning-eyebrow">Your practice space</span><h2>Welcome back.</h2><p>Sign in to explore the fretboard, work on a song, or pick up where you left off.</p><SignInButton mode="modal"><button className="music-button learning-primary">Sign in to Guitar Tutor <span aria-hidden="true">→</span></button></SignInButton><span className="sign-in-caption">New here? You can create an account when you sign in.</span></section>
    </div>
  </main>;

  return <SignedInV2App key={userId} />;
}

function SignedInV2App() {
  const { userId } = useAppAuth();
  const [page, setPage] = useState<'explore' | 'sessions' | 'library' | 'workspace'>('explore');
  const [sessions, setSessions] = useState<V2Session[] | null>(null);
  const [activeSession, setActiveSession] = useState<V2Session | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [artifactView, setArtifactView] = useState<SongStudyArtifact | ExerciseArtifact | 'search' | null>(null);
  const [songTarget, setSongTarget] = useState(() => new URL(window.location.href).searchParams.get('song'));
  const [songSearch, setSongSearch] = useState<SongSearchState>(() => ({ query: new URL(window.location.href).searchParams.get('songQuery') ?? '', results: [], searched: false }));
  const [loadingSong, setLoadingSong] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const songRequest = useRef(0);
  const [search, setSearch] = useState('');
  const [entryView, setEntryView] = useState<HarmonyView>('tutor');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const writeSongLocation = useCallback((target: string | null, destination?: typeof page, query?: string, replace = false) => {
    songRequest.current++;
    setLoadingSong(false);
    setLoadingWorkspace(false);
    setSongTarget(target);
    const url = new URL(window.location.href);
    url.searchParams.delete('session'); url.searchParams.delete('branch');
    if (target) url.searchParams.set('song', target); else url.searchParams.delete('song');
    if (query !== undefined) {
      if (query) url.searchParams.set('songQuery', query); else url.searchParams.delete('songQuery');
    }
    window.history[replace ? 'replaceState' : 'pushState']({ ...window.history.state, songReturnPage: destination ?? 'explore' }, '', url);
  }, []);

  useEffect(() => {
    const requests = songRequest;
    const restoreSongLocation = (initial = false) => {
      const request = ++songRequest.current;
      const url = new URL(window.location.href);
      const target = url.searchParams.get('song');
      const query = url.searchParams.get('songQuery') ?? '';
      setSongTarget(target); setError(null); setArtifactView(target === 'search' ? 'search' : null);
      setSongSearch(previous => previous.resultsQuery === query ? { ...previous, query } : { query, results: [], searched: false });
      setLoadingSong(Boolean(target && target !== 'search'));
      setLoadingWorkspace(false);
      if (!target) {
        const sessionId = url.searchParams.get('session');
        if (sessionId) {
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
            setPage('explore'); setError('This session link is invalid. Open a session from your saved sessions.'); return;
          }
          setLoadingWorkspace(true);
          void apiClient.getV2Session(sessionId).then(session => {
            if (request !== songRequest.current) return;
            const branch = session.branches.find(b => b.id === url.searchParams.get('branch') && !b.closed) ?? session.branches.find(b => !b.closed);
            setActiveSession(session); setActiveBranchId(branch?.id ?? null);
            setEntryView(branch?.harmony_exploration?.focus.kind === 'shape' ? 'discover' : 'tutor');
            setPage('workspace');
          }).catch(() => { if (request === songRequest.current) { setPage('explore'); setError('This session is unavailable. Open an existing session or start a new exploration.'); } })
            .finally(() => { if (request === songRequest.current) setLoadingWorkspace(false); });
          return;
        }
        setPage(initial ? 'explore' : window.history.state?.songReturnPage ?? 'explore');
      } else if (target !== 'search') {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(target)) {
          setLoadingSong(false); setError('This song link is invalid. Return to song search.'); return;
        }
        void apiClient.getSongStudy(target).then(artifact => {
          if (songRequest.current === request) setArtifactView(artifact);
        }).catch(() => {
          if (songRequest.current === request) setError('This song is no longer available. Return to song search or open a saved song from My Stuff.');
        }).finally(() => { if (songRequest.current === request) setLoadingSong(false); });
      }
    };
    restoreSongLocation(true);
    const onPopState = () => restoreSongLocation();
    window.addEventListener('popstate', onPopState);
    return () => { requests.current++; window.removeEventListener('popstate', onPopState); };
  }, []);

  useEffect(() => {
    if (page !== 'workspace' || !activeSession || !activeBranchId || songTarget || loadingWorkspace) return;
    const url = new URL(window.location.href);
    const branch = activeSession.branches.find(b => b.id === activeBranchId);
    if (branch?.active_workspace === 'harmony' && branch.harmony_exploration?.focus.kind === 'shape') {
      url.searchParams.set('session', activeSession.id); url.searchParams.set('branch', activeBranchId);
    } else {
      url.searchParams.delete('session'); url.searchParams.delete('branch');
    }
    window.history.replaceState(window.history.state, '', url);
  }, [page, activeSession, activeBranchId, songTarget, loadingWorkspace]);

  const sessionsRequest = useRef(0);
  const loadSessions = useCallback(async () => {
    const request = ++sessionsRequest.current;
    try {
      const next = await apiClient.listV2Sessions();
      if (request === sessionsRequest.current) setSessions(next);
    } catch (err) {
      if (request === sessionsRequest.current) setError(String(err));
    }
  }, []);
  useEffect(() => {
    const requests = sessionsRequest;
    void loadSessions();
    return () => { requests.current++; };
  }, [loadSessions]);

  const openSession = useCallback((session: V2Session, view: HarmonyView = 'tutor') => {
    sessionsRequest.current++;
    writeSongLocation(null, 'workspace');
    setPage('workspace');
    setEntryView(view);
    setArtifactView(null);
    setActiveSession(session);
    setActiveBranchId(session.branches.find((branch) => !branch.closed)?.id ?? null);
  }, [writeSongLocation]);

  const studySong = () => {
    writeSongLocation('search', page, songSearch.query);
    setArtifactView('search'); setError(null);
  };

  const ensureSongSession = async () => {
    if (activeSession && activeBranchId) return { sessionId: activeSession.id, branchId: activeBranchId };
    const session = await apiClient.createV2Session();
    setActiveSession(session);
    const branchId = session.branches.find(branch => !branch.closed)!.id;
    setActiveBranchId(branchId);
    setSessions(previous => [session, ...(previous ?? [])]);
    return { sessionId: session.id, branchId };
  };

  const ensureSongTutor = async (song: SongStudyArtifact) => {
    const key = `guitar-song-tutor:${userId}:${song.id}`;
    let cached: { sessionId?: string; branchId?: string } | null = null;
    try { cached = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { /* Ignore an invalid local association. */ }
    if (cached?.sessionId && cached.branchId) {
      // Only account-owned sessions returned by the server can restore a chat.
      const owned = await apiClient.listV2Sessions();
      const branch = owned.find(session => session.id === cached.sessionId)?.branches.find(branch => branch.id === cached.branchId && !branch.closed);
      if (branch) return branch;
    }
    const hadSession = Boolean(activeSession && activeBranchId);
    const { sessionId, branchId } = await ensureSongSession();
    const title = `${song.payload.title} · ${song.payload.track.name}`;
    const branch = hadSession ? await apiClient.createV2Branch(sessionId, { title }) : await apiClient.updateV2Branch(sessionId, branchId, { title });
    try { localStorage.setItem(key, JSON.stringify({ sessionId, branchId: branch.id })); } catch { /* Chat still works for this visit. */ }
    return branch;
  };

  const showSong = (artifact: SongStudyArtifact) => {
    writeSongLocation(artifact.id, page, songSearch.query);
    setArtifactView(artifact); setError(null);
  };

  const leaveSong = (destination: typeof page) => {
    writeSongLocation(null, destination);
    setArtifactView(null); setPage(destination); setError(null);
  };

  const openSaved = async (item: LibraryItem) => {
    if (item.kind === 'song_study') {
      writeSongLocation(item.id, page, songSearch.query);
      const request = songRequest.current;
      setArtifactView(null); setLoadingSong(true); setError(null);
      try { const song = await apiClient.getSongStudy(item.id); if (request === songRequest.current) setArtifactView(song); }
      catch { if (request === songRequest.current) setError('This song is no longer available. Return to song search.'); }
      finally { if (request === songRequest.current) setLoadingSong(false); }
    }
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
      const session = view === 'discover' ? await apiClient.createV2Session() : await apiClient.openHarmony('C', 'major', chord);
      if (view === 'discover') {
        const branch = session.branches[0];
        const result = await apiClient.editHarmony(session.id, branch.id, { focus: { kind: 'shape', positions: [], interpretation: null } });
        session.branches[0] = result.branch;
      }
      openSession(session, view); setSessions(previous => [session, ...(previous ?? [])]);
    } catch (err) { setError(String(err)); } finally { setOpening(false); }
  };

  const handleStart = async (kind: 'harmony' | 'progression' = 'harmony') => {
    if (opening) return;
    setOpening(true); setError(null);
    try {
      const session = kind === 'progression' ? await apiClient.openProgression() : await apiClient.createV2Session();
      openSession(session);
      setSessions((prev) => [session, ...(prev ?? [])]);
      document.getElementById('new-session-options')?.hidePopover();
    } catch (err) {
      setError(String(err));
    } finally { setOpening(false); }
  };

  const sessionStarter = <>
    <button className="music-button" popoverTarget="new-session-options" aria-haspopup="dialog">+ New session</button>
    <div id="new-session-options" className="session-start-options" popover="auto" role="dialog" aria-label="Choose a session type">
      <button disabled={opening} onClick={() => void handleStart('harmony')}><strong>Harmony</strong><span>Explore scales, chords and voicings.</span></button>
      <button disabled={opening} onClick={() => void handleStart('progression')}><strong>Chord progression</strong><span>Arrange chords and practise transitions.</span></button>
      <small>Starts a separate session. Your current work stays here.</small>
      {opening && <p role="status">Opening your session…</p>}
      {error && <p className="learning-error" role="alert">{error}</p>}
    </div>
  </>;

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
      sessionsRequest.current++;
      setSessions(previous => previous?.filter(value => value.id !== session.id) ?? []);
      if (activeSession?.id === session.id) { setActiveSession(null); setActiveBranchId(null); }
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

  const shell = (content: ReactNode) => <AppShell active={artifactView || songTarget ? 'song' : page} hasWorkspace={Boolean(activeSession)} onNavigate={destination => {
    if (destination === 'song') { void studySong(); return; }
    leaveSong(destination);
    if (destination === 'explore' || destination === 'sessions') void loadSessions();
  }}>{content}</AppShell>;

  if (artifactView || songTarget) return shell(<main className="v2-app mx-auto max-w-7xl p-4 sm:p-6">
    <div className="music-controls mb-4"><h1 className="learning-brand">Study & practice</h1>{sessionStarter}
      {activeSession && <button className="music-button" onClick={() => leaveSong('workspace')}>Back to workspace</button>}
      {!activeSession && artifactView && artifactView !== 'search' && artifactView.kind === 'exercise' && <button className="music-button" onClick={() => leaveSong('explore')}>Explore</button>}
    </div>
    {(songTarget || artifactView === 'search' || artifactView?.kind === 'song_study') && <nav aria-label="Song navigation" className="song-breadcrumbs">
      <button className="learning-text-button" onClick={() => leaveSong('explore')}>Explore</button><span aria-hidden="true">›</span>
      {artifactView === 'search' ? <span aria-current="page">Song search</span> : <button className="learning-text-button" onClick={studySong}>Song search</button>}
      {artifactView && artifactView !== 'search' && artifactView.kind === 'song_study' && <><span aria-hidden="true">›</span><span className="song-breadcrumb-current" aria-current="page" title={artifactView.payload.title}>{artifactView.payload.title}</span></>}
    </nav>}
    {error && <p role="alert">{error}</p>}
    {loadingSong && <p role="status">Opening your song…</p>}
    {artifactView === 'search' ? <SongStudySearch state={songSearch} onStateChange={setSongSearch} ensureSession={ensureSongSession} onSearch={query => writeSongLocation('search', page, query, true)} onCreated={showSong} />
      : artifactView?.kind === 'song_study' ? <SongStudyWorkspace key={artifactView.id} songStudy={artifactView} ensureTutor={() => ensureSongTutor(artifactView)} onSongStudyChange={updated => setArtifactView(current => current && current !== 'search' && current.id === updated.id ? updated : current)} />
      : artifactView?.kind === 'exercise' ? <ExerciseWorkspace key={artifactView.id} artifact={artifactView} /> : null}
  </main>);

  if (loadingWorkspace) return shell(<main className="v2-app learning-app"><p role="status">Opening your workspace…</p></main>);
  if (activeSession && page === 'workspace') {
    const branch = activeSession.branches.find((candidate) => candidate.id === activeBranchId && !candidate.closed) ?? null;
    return shell(
      <main className="v2-app learning-app">
        <div className="learning-app-header">
          <div className="session-heading"><h1 className="learning-brand">{branch?.active_workspace === 'progression' ? 'Chord progression' : 'Harmony'}</h1><span className="learning-eyebrow">{branch?.active_workspace === 'progression' ? 'Arrange · Play · Practise' : 'Scales · Chords · Voicings'}</span></div>
          <div className="music-controls">
          <button className="learning-text-button" data-testid="v2-new-branch" onClick={handleNewBranch}>New Harmony branch</button>
          {sessionStarter}
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

  return shell(
    <main className="v2-app learning-app learning-home">
      <header className="learning-app-header"><h1 className="learning-brand">{page === 'sessions' ? 'Sessions' : page === 'library' ? 'My Stuff' : 'Explore'}</h1>{sessionStarter}</header>
      {error && <p className="learning-error" role="alert">{error}</p>}
      {page === 'explore' && <>
      <section className="learning-intro" aria-labelledby="learning-start"><span className="learning-eyebrow">A little curiosity. A little practice.</span><h2 id="learning-start">What would you like<br /> to play today?</h2><p>Find a sound, understand how it works, and take it under your fingers.<br /> Start anywhere. Your Tutor will help you take the next step.</p></section>
      <section aria-label="Choose a learning activity" className="learning-activities">
        <button aria-label="Learn the fretboard" disabled={opening} onClick={() => void startActivity('fretboard')}><span className="learning-activity-number">01 / SCALES</span><strong>Learn the fretboard</strong><p>Find the roots. Hear a scale. Make a phrase from a few notes.</p><span className="learning-activity-action">Explore scales →</span></button>
        <button disabled={opening} onClick={() => void startActivity('triads')}><span className="learning-activity-number">02 / TRIADS</span><strong>Three notes. More of the neck.</strong><p>Follow a chord through inversions, one string set at a time.</p><span className="learning-activity-action">Explore triads →</span></button>
        <button disabled={opening} onClick={() => void startActivity('shapes')}><span className="learning-activity-number">03 / CHORD SHAPES</span><strong>Find your next shape</strong><p>See playable voicings, compare their sound, and connect CAGED shapes.</p><span className="learning-activity-action">Explore shapes →</span></button>
        <button disabled={opening} aria-label="Build a four-chord progression" onClick={() => void handleStart('progression')}><span className="learning-activity-number">04 / PROGRESSIONS</span><strong>Make the chords connect</strong><p>Hear an idea, change a chord, and practise the transitions.</p><span className="learning-activity-action">Build a progression →</span></button>
      </section>
      <div className="learning-home-tools"><button className="music-button" disabled={opening} onClick={() => void startActivity('discover')}>Find a chord on the fretboard</button><button className="music-button" disabled={opening} onClick={() => void startActivity('circle')}>Explore the circle of fifths</button><button className="music-button" disabled={opening} onClick={() => void startActivity('caged')}>Connect the CAGED shapes</button><button className="learning-text-button" type="button" data-testid="v2-start-session" disabled={opening} onClick={() => void handleStart('harmony')}>Start a blank Harmony session</button></div>
      {opening && <p role="status">Opening your music…</p>}
      <form onSubmit={event => { event.preventDefault(); void handleConcept(search); }} className="learning-search">
        <div><label htmlFor="explore-scale">Explore a scale, key or chord</label><p>Have something in mind? Try C major, A minor pentatonic, or Dm7.</p></div>
        <div className="music-controls"><input id="explore-scale" placeholder="A Dorian" value={search} onChange={event => setSearch(event.target.value)} /><button className="music-button learning-primary" type="submit">Explore music</button></div>
        <button className="learning-text-button" type="button" onClick={() => void handleConcept('A Dorian')}>What makes A Dorian different?</button>
      </form>
      </>}
      {page !== 'library' && <>
      {sessions === null && <p role="status">Loading your work…</p>}
      {sessions !== null && sessions.length > 0 && <section className="learning-recent" aria-labelledby="continue-heading"><h2 id="continue-heading">Continue where you left off</h2><div className="learning-recent-list">{sessions.map(session => { const open = session.branches.find(branch => !branch.closed); return <div className="learning-session-row" key={session.id}><button type="button" data-testid="v2-continue-session" data-session-id={session.id} onClick={() => handleContinue(session.id)}><span className="learning-eyebrow">{open?.active_workspace === 'progression' ? 'Chord progression' : open ? 'Harmony' : 'Session'}</span><strong>{open?.title ?? 'Saved work'}</strong><span>Continue →</span></button><button className="session-delete" aria-label={`Delete session: ${open?.title ?? 'Saved work'}`} title="Delete session" disabled={deleting !== null} onClick={() => void deleteSession(session)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v8m4-8v8" /></svg></button></div>; })}</div></section>}
      {page === 'sessions' && sessions?.length === 0 && <div className="shell-empty"><h2>A fresh start.</h2><p>Your sessions will appear here once you explore some music.</p><button className="music-button" onClick={() => setPage('explore')}>Explore music</button></div>}
      </>}
      {page !== 'sessions' && <MyStuff onOpen={openSaved} />}
    </main>
  );
}
