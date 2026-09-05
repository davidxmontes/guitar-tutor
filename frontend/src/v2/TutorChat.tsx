import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { ProgressionCandidate } from './ProgressionCandidate';
import type { ConceptSuggestion, ProgressionPayload, TutorFocus, TutorMessage } from '../types/v2';

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  conceptSuggestion?: ConceptSuggestion | null;
  // Progression candidates (ticket #14) carried on an assistant turn --
  // structurally persisted on TutorMessage.content.candidates so a history
  // reload replays them exactly as a live turn would (see router.py).
  candidates: ProgressionPayload[] | null;
}

// TutorMessage.content is a plain dict (backend models.py) — `tool` role
// rows (future tool-call round-trip) are filtered out here, this chat only
// ever renders the plain conversational user/assistant turns ticket #13
// calls for (no "waiting for clarification" state — clarification is just
// an assistant message).
function toChatEntries(history: TutorMessage[]): ChatEntry[] {
  return history
    .filter((m): m is TutorMessage & { role: 'user' | 'assistant' } => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      id: m.id,
      role: m.role,
      text: typeof m.content.text === 'string' ? m.content.text : '',
      conceptSuggestion: m.content.concept_suggestion,
      candidates: m.content.candidates ?? null,
    }));
}

// --- Tutor chat panel (ticket #13). Lives beside the SongStudy workspace as
// a permanent side rail, not a separate tab — the spec's "artifacts do not
// obstruct spontaneous questions" criterion. Issue #12's mock deferred a
// right-rail Tutor panel because nothing existed yet to build; this is that
// first implementation, styled to match SongStudySearch's card/input/button
// convention (var(--card-bg)/var(--border-primary)/etc.) rather than a
// bolted-on debug panel.
//
// A TutorResponse's `focus` is cross-view attention, not navigation — it's
// reported to the parent via onFocusChange and never written into Branch
// selection/focus. The parent (SongStudyWorkspace) owns rendering it on the
// fretboard and clears/replaces it itself on the next turn.
export function TutorChat({
  sessionId,
  branchId,
  tutorThreadId,
  onFocusChange,
  onWorkOnConcept,
  onExploreProgression,
  emptyMessage = 'Ask a question about this passage.',
}: {
  sessionId: string;
  branchId: string;
  tutorThreadId: string;
  onFocusChange: (focus: TutorFocus | null) => void;
  onWorkOnConcept?: (suggestion: ConceptSuggestion) => Promise<void>;
  onExploreProgression?: (candidate: ProgressionPayload) => Promise<void>;
  emptyMessage?: string;
}) {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Load history once per thread (mount, or a different SongStudy/branch
  // opened) — and drop any ephemeral tutor focus from the previous thread,
  // it was never this thread's state to carry forward.
  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    setHistoryError(null);
    onFocusChange(null);
    apiClient
      .listTutorMessages(tutorThreadId)
      .then((history) => {
        if (!cancelled) setMessages(toChatEntries(history));
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorThreadId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { id: `local-user-${Date.now()}`, role: 'user', text, candidates: null }]);
    setInput('');
    setSending(true);
    setSendError(null);
    try {
      const response = await apiClient.sendTutorTurn({ session_id: sessionId, branch_id: branchId, message: text });
      setMessages((prev) => [...prev, {
        id: `local-assistant-${Date.now()}`,
        role: 'assistant',
        text: response.message,
        conceptSuggestion: response.concept_suggestion,
        candidates: response.candidates ?? null,
      }]);
      onFocusChange(response.focus ?? null);
    } catch (err) {
      setSendError(String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      data-testid="tutor-chat"
      className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 w-full xl:w-[300px] xl:flex-none"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        Tutor
      </p>

      {historyError && (
        <p role="alert" data-testid="tutor-chat-history-error" className="text-xs" style={{ color: '#ef4444' }}>
          {historyError}
        </p>
      )}

      <div
        data-testid="tutor-chat-messages"
        className="flex flex-col gap-2 overflow-y-auto"
        style={{ flex: '1 1 auto', minHeight: 160, maxHeight: 420 }}
      >
        {loadingHistory && (
          <p role="status" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Loading conversation...
          </p>
        )}
        {!loadingHistory && messages.length === 0 && !historyError && (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {emptyMessage}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-2" style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
            {m.text && (
              <div
                data-testid={`tutor-chat-message-${m.role}`}
                className="text-xs rounded-md px-2.5 py-1.5"
                style={{
                  backgroundColor: m.role === 'user' ? 'var(--accent-500)' : 'var(--bg-secondary)',
                  color: m.role === 'user' ? 'white' : 'var(--text-primary)',
                }}
              >
                {m.text}
              </div>
            )}
            {m.role === 'assistant' && m.conceptSuggestion && onWorkOnConcept && (
              <button
                type="button"
                onClick={() => onWorkOnConcept(m.conceptSuggestion!)}
                className="rounded-md border px-2 py-1 text-xs font-semibold"
                style={{ borderColor: 'var(--accent-500)', color: 'var(--accent-700)' }}
              >
                Work on {m.conceptSuggestion.label}
              </button>
            )}
            {/* Progression candidates (ticket #14): the whole chord sequence
                rendered as a distinct card alongside the plain-text reply,
                never replacing it -- same for a live turn or a reconstructed
                history message. */}
            {m.role === 'assistant' && m.candidates && m.candidates.length > 0 && (
              <div data-testid="tutor-chat-candidates" className="flex flex-col gap-2">
                {m.candidates.map((candidate, i) => (
                  <ProgressionCandidate key={i} candidate={candidate} onExplore={onExploreProgression} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {sendError && (
        <p role="alert" data-testid="tutor-chat-send-error" className="text-xs" style={{ color: '#ef4444' }}>
          {sendError}
        </p>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={emptyMessage}
          data-testid="tutor-chat-input"
          className="min-w-0 flex-1 px-3 py-2 rounded-lg border text-xs outline-none transition-colors"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          data-testid="tutor-chat-send"
          className="px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 hover:bg-[var(--accent-600)]"
          style={{ backgroundColor: 'var(--accent-500)', color: 'white' }}
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
