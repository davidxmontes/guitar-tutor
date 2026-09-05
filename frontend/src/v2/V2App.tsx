import { useEffect, useState } from 'react';
import { SignInButton } from '@clerk/clerk-react';
import { apiClient } from '../api/client';
import { useAppAuth } from '../lib/authBypass';
import type { V2Session } from '../types/v2';

const pageStyle = { padding: 24, fontFamily: 'sans-serif' };

// V2 foundation screen — proves Session/Branch create → leave → resume works
// end to end. The real artifact-first workspace (Home entry points, branch
// tabs, SongStudy/Progression/ConceptStudy/Exercise UIs) lands in tickets
// #12+; this only has to prove the persistence contract.
export function V2App() {
  const { getToken, isSignedIn, isLoaded } = useAppAuth();
  const [sessions, setSessions] = useState<V2Session[] | null>(null);
  const [activeSession, setActiveSession] = useState<V2Session | null>(null);
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

  const handleStart = async () => {
    try {
      const session = await apiClient.createV2Session();
      setActiveSession(session);
      setSessions((prev) => [session, ...(prev ?? [])]);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleContinue = async (sessionId: string) => {
    try {
      const session = await apiClient.getV2Session(sessionId);
      setActiveSession(session);
    } catch (err) {
      setError(String(err));
    }
  };

  if (activeSession) {
    const branch = activeSession.branches[0];
    return (
      <div style={pageStyle}>
        <h1>Guitar Tutor V2</h1>
        <p data-testid="v2-active-session">Session {activeSession.id}</p>
        <p data-testid="v2-active-branch">Branch {branch?.id}</p>
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
      <button data-testid="v2-start-session" onClick={handleStart}>
        Start something new
      </button>
    </div>
  );
}
