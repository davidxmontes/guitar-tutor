import { ExploreHome } from './ExploreHome';
import type { ScaleMode } from '../types/conceptWorkspace';
import { ConceptWorkspacePanel } from './ConceptWorkspace';
import { MyStuff } from './MyStuff';
import { ExerciseWorkspace } from './ExerciseWorkspace';
import { useCallback, useEffect, useState } from 'react';
import { SignInButton } from '@clerk/clerk-react';
import { apiClient } from '../api/client';
import { useAppAuth } from '../lib/authBypass';
import { SongStudyPanel } from './SongStudy';
import { ProgressionWorkspace } from './ProgressionWorkspace';
import { BranchNavigation } from './BranchNavigation';
import type { ConceptSuggestion, ProgressionPayload, V2Branch, V2Session } from '../types/v2';

export function V2App() {
  const { getToken, isSignedIn, isLoaded } = useAppAuth();
  const [sessions, setSessions] = useState<V2Session[] | null>(null);
  const [activeSession, setActiveSession] = useState<V2Session | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [draftPending, setDraftPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      apiClient.setTokenGetter(null);
      return;
    }
    apiClient.setTokenGetter(() => getToken());
    apiClient.listV2Sessions().then(setSessions).catch((err) => setError(String(err)));
  }, [isSignedIn, getToken]);

  const handleStart = async () => {
    try {
      const session = await apiClient.createV2Session();
      setActiveSession(session);
      setActiveBranchId(session.branches.find((branch) => !branch.closed)?.id ?? null);
      setSessions((prev) => [session, ...(prev ?? [])]);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleComparison = async (recipe: 'scale-comparison' | 'physical-resolution' | 'four-chord-progression' | 'caged-exploration' = 'scale-comparison', mode?: ScaleMode) => {
    try {
      const session = activeSession ?? await apiClient.createV2Session();
      const branch = await apiClient.openConceptWorkspace(session.id, recipe, mode);
      setActiveSession({ ...session, branches: [...session.branches, branch] });
      setActiveBranchId(branch.id);
    } catch (err) { setError(String(err)); }
  };

  const handleContinue = async (sessionId: string) => {
    try {
      const session = await apiClient.getV2Session(sessionId);
      setActiveSession(session);
      const resumed = session.branches.find((branch) => !branch.closed);
      setActiveBranchId(resumed?.id ?? null);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleBranchChange = useCallback((updatedBranch: V2Branch) => {
    setActiveSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        branches: prev.branches.map((b) => (b.id === updatedBranch.id ? updatedBranch : b)),
      };
    });
  }, []);

  const handleBranchOpened = (opened: { branch: V2Branch; source_branch?: V2Branch | null }) => {
    setActiveSession((previous) => {
      if (!previous) return previous;
      const branches = previous.branches.map(branch => branch.id === opened.source_branch?.id ? opened.source_branch : branch);
      const exists = branches.some((branch) => branch.id === opened.branch.id);
      return {
        ...previous,
        branches: exists
          ? branches.map((branch) => branch.id === opened.branch.id ? opened.branch : branch)
          : [...branches, opened.branch],
      };
    });
    setActiveBranchId(opened.branch.id);

  };

  const handleWorkOnConcept = async (suggestion: ConceptSuggestion) => {
    if (!activeSession || !activeBranchId) return;
    try {
      const branch = await apiClient.openConceptSuggestion(activeSession.id, suggestion);
      handleBranchOpened({branch});
    } catch (err) {
      setError(String(err));
    }
  };

  const handleExploreProgression = async (candidate: ProgressionPayload) => {
    if (!activeSession || !activeBranchId) return;
    const opened = await apiClient.exploreProgression(activeSession.id, activeBranchId, candidate);
    handleBranchOpened(opened);
  };

  const handleSelectBranch = (branchId: string) => {
    setActiveBranchId(branchId);
  };

  const handleCloseBranch = async (branchId: string) => {
    if (!activeSession) return;
    try {
      const updated = await apiClient.updateV2Branch(activeSession.id, branchId, { closed: true });
      handleBranchChange(updated);
      if (activeBranchId === branchId) {
        setActiveBranchId(activeSession.branches.find((branch) => branch.id !== branchId && !branch.closed)?.id ?? null);
      }

    } catch (err) {
      setError(String(err));
    }
  };

  const handleReopenBranch = async (branchId: string) => {
    if (!activeSession) return;
    try {
      const updated = await apiClient.updateV2Branch(activeSession.id, branchId, { closed: false });
      handleBranchChange(updated);
      if (!activeBranchId) setActiveBranchId(branchId);
    } catch (err) {
      setError(String(err));
    }
  };

  if (!isLoaded) return null;
  if (!isSignedIn) {
    return (
      <div className="p-4 sm:p-6">
        <h1>Guitar Tutor</h1>
        <p>Sign in to start or resume a session.</p>
        <SignInButton mode="modal" />
      </div>
    );
  }

  if (activeSession) {
    const branch = activeSession.branches.find((candidate) => candidate.id === activeBranchId && !candidate.closed) ?? null;
    return (
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <fieldset disabled={draftPending} className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h1 className="text-2xl font-black">Guitar Tutor</h1>
          <button type="button" className="min-h-11 rounded-lg border border-[var(--border-primary)] px-3 py-2 text-sm font-semibold" onClick={() => { setActiveSession(null); apiClient.listV2Sessions().then(setSessions).catch(err => setError(String(err))); }}>My Stuff</button>
        </fieldset>
        <button disabled={draftPending} type="button" className="mb-3 min-h-11 rounded-lg border px-3 py-2 focus-visible:outline-2 focus-visible:outline-[var(--accent-700)]" onClick={() => { setActiveSession(null); }}>Explore</button>
        <p hidden data-testid="v2-active-session">Session {activeSession.id}</p>
        <p hidden data-testid="v2-active-branch">Branch {branch?.id}</p>
        {error && <p role="alert">{error}</p>}
        <fieldset disabled={draftPending}><BranchNavigation
          branches={activeSession.branches}
          activeBranchId={branch?.id ?? null}
          onSelect={handleSelectBranch}
          onClose={handleCloseBranch}
          onReopen={handleReopenBranch}
        /></fieldset>
        {branch && (
          <section
            id={`workspace-panel-${branch.id}`}
            role="tabpanel"
            aria-labelledby={`workspace-tab-${branch.id}`}
          >
            {branch.working_draft ? (
              <ConceptWorkspacePanel onPendingChange={setDraftPending} key={branch.id} sessionId={activeSession.id} branch={branch} onBranchChange={handleBranchChange} />
            ) : branch.current_artifact_kind === 'exercise' ? (
              <ExerciseWorkspace key={branch.id} sessionId={activeSession.id} branch={branch} />
            ) : branch.current_artifact_kind === 'concept_study' ? (
              <section className="space-y-3" role="alert"><h2 className="text-xl font-bold">This older study is unsupported</h2><p>Start a new exploration to work with editable music. Your saved work has not been changed.</p><button className="min-h-11 rounded-lg border px-3 py-2" onClick={() => setActiveSession(null)}>Open Explore</button></section>
            ) : branch.current_artifact_kind === 'progression' ? (
              <ProgressionWorkspace key={branch.id} sessionId={activeSession.id} branch={branch} onBranchChange={handleBranchChange} />
            ) : (
              <SongStudyPanel key={branch.id} sessionId={activeSession.id} branch={branch} onBranchChange={handleBranchChange} onWorkOnConcept={handleWorkOnConcept} onExploreProgression={handleExploreProgression} />
            )}
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <h1 className="text-2xl font-black">Guitar Tutor</h1>
      <ExploreHome onStart={request => handleComparison(request.recipe, request.mode)} onOpen={session => { setActiveSession(session); setActiveBranchId(session.branches[0].id); setSessions(prev => [session, ...(prev ?? [])]); }} />
      {error && <p role="alert">{error}</p>}
      {sessions === null && <p role="status">Loading your work…</p>}
      {sessions !== null && sessions.length > 0 && (
        <section className="my-5" aria-labelledby="continue-heading">
          <h2 id="continue-heading" className="text-lg font-bold">Continue where you left off</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => {
            const workspace = session.branches.find((branch) => !branch.closed);
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
              <strong className="block">{workspace?.title ?? 'Saved work'}</strong>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Continue workspace</span>
            </button>
          )})}
          </div>
        </section>
      )}

      <MyStuff onOpen={session => { setActiveSession(session); setActiveBranchId(session.branches[0].id); setSessions(prev => [session, ...(prev ?? [])]); }} />
      <div className="flex gap-3 flex-wrap">
      <button type="button" data-testid="v2-start-session" onClick={handleStart}>
        Start something new
      </button>

      </div>
    </main>
  );
}
