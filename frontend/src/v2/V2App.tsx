import { useEffect, useState } from 'react';
import { SignInButton } from '@clerk/clerk-react';
import { apiClient } from '../api/client';
import { useAppAuth } from '../lib/authBypass';
import { SongStudyPanel } from './SongStudy';
import { ConceptStudyPanel, ConceptStudyPicker } from './ConceptStudy';
import type { ConceptSuggestion, OpenConceptStudyResponse, V2Branch, V2Session } from '../types/v2';

const pageStyle = { padding: 24, fontFamily: 'sans-serif' };

// V2 foundation screen — proves Session/Branch create → leave → resume works
// end to end. The real artifact-first workspace (Home entry points, branch
// tabs, SongStudy/Progression/ConceptStudy/Exercise UIs) lands in tickets
// #12+; this only has to prove the persistence contract.
export function V2App() {
  const { getToken, isSignedIn, isLoaded } = useAppAuth();
  const [sessions, setSessions] = useState<V2Session[] | null>(null);
  const [activeSession, setActiveSession] = useState<V2Session | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [showConceptPicker, setShowConceptPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      apiClient.setTokenGetter(null);
      return;
    }
    apiClient.setTokenGetter(() => getToken());
    apiClient.listV2Sessions().then(setSessions).catch((err) => setError(String(err)));
  }, [isSignedIn, getToken]);

  if (!isLoaded) return null;
  if (!isSignedIn) {
    return (
      <div style={pageStyle}>
        <h1>Guitar Tutor V2</h1>
        <p>Sign in to start or resume a session.</p>
        <SignInButton mode="modal" />
      </div>
    );
  }

  const handleStart = async (startConcept = false) => {
    try {
      const session = await apiClient.createV2Session();
      setActiveSession(session);
      setActiveBranchId(session.branches[0]?.id ?? null);
      setShowConceptPicker(startConcept);
      setSessions((prev) => [session, ...(prev ?? [])]);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleContinue = async (sessionId: string) => {
    try {
      const session = await apiClient.getV2Session(sessionId);
      setActiveSession(session);
      setActiveBranchId(session.branches[0]?.id ?? null);
      setShowConceptPicker(false);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleBranchChange = (updatedBranch: V2Branch) => {
    setActiveSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        branches: prev.branches.map((b) => (b.id === updatedBranch.id ? updatedBranch : b)),
      };
    });
  };

  const handleConceptOpened = (opened: OpenConceptStudyResponse) => {
    setActiveSession((previous) => {
      if (!previous) return previous;
      const exists = previous.branches.some((branch) => branch.id === opened.branch.id);
      return {
        ...previous,
        branches: exists
          ? previous.branches.map((branch) => branch.id === opened.branch.id ? opened.branch : branch)
          : [...previous.branches, opened.branch],
      };
    });
    setActiveBranchId(opened.branch.id);
    setShowConceptPicker(false);
  };

  const handleWorkOnConcept = async (suggestion: ConceptSuggestion) => {
    if (!activeSession || !activeBranchId) return;
    try {
      const opened = await apiClient.createConceptStudy({
        session_id: activeSession.id,
        branch_id: activeBranchId,
        root: suggestion.root,
        concept_id: suggestion.concept_id,
        promotion: 'work_on_this',
      });
      handleConceptOpened(opened);
    } catch (err) {
      setError(String(err));
    }
  };

  if (activeSession) {
    const branch = activeSession.branches.find((candidate) => candidate.id === activeBranchId) ?? activeSession.branches[0];
    return (
      <div style={{ ...pageStyle, maxWidth: 1280, margin: '0 auto' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h1 className="text-2xl font-black">Guitar Tutor V2</h1>
          <button type="button" onClick={() => setShowConceptPicker(true)} className="rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}>Study a concept</button>
        </div>
        <p hidden data-testid="v2-active-session">Session {activeSession.id}</p>
        <p hidden data-testid="v2-active-branch">Branch {branch?.id}</p>
        {error && <p role="alert">{error}</p>}
        {activeSession.branches.length > 0 && <nav aria-label="Workspace branches" className="flex gap-2 overflow-x-auto border-b my-4" style={{ borderColor: 'var(--border-primary)' }}>
          {activeSession.branches.map((candidate, index) => <button key={candidate.id} type="button" data-testid="v2-branch-tab" aria-current={candidate.id === branch?.id ? 'page' : undefined} onClick={() => { setActiveBranchId(candidate.id); setShowConceptPicker(false); }} className="whitespace-nowrap rounded-t-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border-primary)', background: candidate.id === branch?.id ? 'var(--card-bg)' : 'var(--bg-secondary)' }}>{candidate.current_artifact_kind === 'concept_study' ? `Concept ${index + 1}` : candidate.current_artifact_kind === 'song_study' ? `Song ${index + 1}` : `Workspace ${index + 1}`}</button>)}
        </nav>}
        {branch && (
          showConceptPicker ? (
            <ConceptStudyPicker
              sessionId={activeSession.id}
              branch={branch}
              onOpened={handleConceptOpened}
              onCancel={() => setShowConceptPicker(false)}
              onWorkOnConcept={handleWorkOnConcept}
            />
          ) : branch.current_artifact_kind === 'concept_study' ? (
            <ConceptStudyPanel key={branch.id} sessionId={activeSession.id} branch={branch} onBranchChange={handleBranchChange} onWorkOnConcept={handleWorkOnConcept} />
          ) : (
            <SongStudyPanel key={branch.id} sessionId={activeSession.id} branch={branch} onBranchChange={handleBranchChange} onWorkOnConcept={handleWorkOnConcept} />
          )
        )}
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1>Guitar Tutor V2</h1>
      {error && <p role="alert">{error}</p>}
      {sessions === null && <p>Loading...</p>}
      {sessions !== null && sessions.length > 0 && (
        <div>
          <p>Continue where you left off:</p>
          {sessions.map((session) => (
            <button
              key={session.id}
              data-testid="v2-continue-session"
              data-session-id={session.id}
              onClick={() => handleContinue(session.id)}
            >
              Continue session {session.id.slice(0, 8)}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-3 flex-wrap">
      <button data-testid="v2-start-session" onClick={() => handleStart(false)}>
        Start something new
      </button>
      <button data-testid="v2-start-concept" onClick={() => handleStart(true)}>
        Study a concept
      </button>
      </div>
    </div>
  );
}
