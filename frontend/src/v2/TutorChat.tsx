import type { ConceptWorkspace, TypedInspection } from '../types/conceptWorkspace';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import { ExerciseComposer } from './ExerciseComposer';
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { ProgressionCandidate } from './ProgressionCandidate';
import type { BranchFocusGroup, WorkspaceChange, WorkspaceTurnResult, ExerciseProposal, ConceptSuggestion, VoicingProposal, ProgressionPayload, TutorFocus, TutorMessage } from '../types/v2';

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  focus?: TutorFocus | null;
  comparisonGroups?: BranchFocusGroup[];
  workspaceChange?: WorkspaceChange;
  snapshot?: ConceptWorkspace | null;
  exerciseSuggestion?: ExerciseProposal | null;
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
      focus: m.content.focus,
      comparisonGroups: m.content.comparison_groups ?? (m.content.focus as (TutorFocus & { groups?: BranchFocusGroup[] }) | null)?.groups,
      workspaceChange: m.content.workspace_change,
      snapshot: m.content.workspace_after,
      exerciseSuggestion: m.content.exercise_suggestion,
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
  beforeSend, onPreview, historyVersion = 0,
  inspection, workspaceVersion, onWorkspaceResult, onSendingChange, disabled = false, wide = false,
  sessionId,
  branchId,
  tutorThreadId,
  onFocusChange,
  onWorkOnConcept,
  onExploreProgression,
  onVoicingCandidates,
  emptyMessage = 'Ask a question about this passage.',
}: {
  beforeSend?: () => Promise<void>;
  historyVersion?: number;
  onPreview?: (messageId: string, snapshot: ConceptWorkspace, focus: TutorFocus | null) => Promise<void>;
  inspection?: TypedInspection | null;
  workspaceVersion?: number;
  onWorkspaceResult?: (result: WorkspaceTurnResult) => Promise<void>;
  onSendingChange?: (sending: boolean) => void;
  disabled?: boolean;
  wide?: boolean;
  sessionId: string;
  branchId: string;
  tutorThreadId: string;
  onFocusChange: (focus: TutorFocus | null) => void;
  onWorkOnConcept?: (suggestion: ConceptSuggestion) => Promise<void>;
  onExploreProgression?: (candidate: ProgressionPayload) => Promise<void>;
  onVoicingCandidates?: (candidates: VoicingProposal[]) => void;
  emptyMessage?: string;
}) {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Local UI preference, not persisted — Tutor stays visible by default
  // (spec #10: "artifacts do not obstruct spontaneous questions"), but a
  // manual collapse lets the user reclaim its width temporarily.
  const [collapsed, setCollapsed] = useState(false);

  // Load history once per thread (mount, or a different SongStudy/branch
  // opened) — and drop any ephemeral tutor focus from the previous thread,
  // it was never this thread's state to carry forward.
  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    setHistoryError(null);
    // Workspace preview/return keeps attention in its parent; other consumers reset on thread changes.
    if (!onPreview) onFocusChange(null);
    apiClient
      .listTutorMessages(tutorThreadId)
      .then((history) => {
        if (!cancelled) {
          setMessages(toChatEntries(history));
          onVoicingCandidates?.(history.filter(m => m.content.voicing_candidates?.length).at(-1)?.content.voicing_candidates ?? []);
        }
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
  }, [tutorThreadId, historyVersion]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || disabled) return;

    setMessages((prev) => [...prev, { id: `local-user-${Date.now()}`, role: 'user', text, candidates: null }]);
    setInput('');
    setSending(true); onSendingChange?.(true);
    onFocusChange(null);
    setSendError(null);
    try {
      await beforeSend?.();
      const response = await apiClient.sendTutorTurn({ session_id: sessionId, branch_id: branchId, message: text, ...(inspection ? { inspection } : {}) });
      setMessages((prev) => [...prev, {
        id: response.workspace_result?.message_id ?? `local-assistant-${Date.now()}`,
        workspaceChange: response.workspace_result ?? undefined,
        snapshot: response.workspace_result?.branch.working_draft,
        role: 'assistant',
        text: response.message,
        focus: response.focus,
        comparisonGroups: response.comparison_groups,
        exerciseSuggestion: response.exercise_suggestion,
        conceptSuggestion: response.concept_suggestion,
        candidates: response.candidates ?? null,
      }]);
      if (response.workspace_result) await onWorkspaceResult?.(response.workspace_result);
      onFocusChange(response.focus ?? null);
      if (response.voicing_candidates?.length) onVoicingCandidates?.(response.voicing_candidates);
    } catch (err) {
      setSendError(String(err));
    } finally {
      setSending(false); onSendingChange?.(false);
    }
  };

  const latestChange = [...messages].reverse().find(message => ['applied', 'undone', 'restored'].includes(message.workspaceChange?.status ?? ''));
  const undoChange = async (messageId: string) => {
    if (workspaceVersion === undefined || sending || disabled) return;
    setSending(true); onSendingChange?.(true); setSendError(null);
    try {
      const result = await apiClient.undoWorkspaceChange(sessionId, branchId, messageId, workspaceVersion);
      setMessages(previous => [...previous, { id: result.message_id, role: 'assistant', text: 'Restored the exact workspace from before the Tutor change. Conversation and saved studies are unchanged.', workspaceChange: result, snapshot: result.branch.working_draft, candidates: null }]);
      await onWorkspaceResult?.(result); onFocusChange(null);
    } catch (error) { setSendError(`${String(error)}. Your workspace is unchanged. Reload before trying Undo again.`); }
    finally { setSending(false); onSendingChange?.(false); }
  };

  if (collapsed) {
    return (
      <div
        data-testid="tutor-chat"
        data-collapsed="true"
        className="flex flex-col items-center gap-2 rounded-lg border p-2 xl:flex-none xl:sticky xl:top-3"
        style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
      >
        <button
          type="button"
          data-testid="tutor-chat-expand"
          aria-expanded={false}
          onClick={() => setCollapsed(false)}
          className="text-xs font-bold"
          style={{ color: 'var(--text-secondary)' }}
          title="Expand Tutor"
        >
          ◂
        </button>
        <p
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)', writingMode: 'vertical-rl' }}
        >
          Tutor
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="tutor-chat"
      className={`flex min-w-0 flex-col gap-3 rounded-lg border p-3 w-full ${wide ? "min-h-0 flex-1" : "xl:w-[300px] xl:flex-none xl:sticky xl:top-3 xl:max-h-[calc(100vh-24px)]"}`}
      style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
    >
      {!wide && <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Tutor
        </p>
        <button
          type="button"
          data-testid="tutor-chat-collapse"
          aria-expanded={true}
          onClick={() => setCollapsed(true)}
          className="text-xs font-bold"
          style={{ color: 'var(--text-secondary)' }}
          title="Collapse Tutor"
        >
          ▸
        </button>
      </div>}

      {historyError && (
        <p role="alert" data-testid="tutor-chat-history-error" className="text-xs" style={{ color: '#ef4444' }}>
          {historyError}
        </p>
      )}

      <div
        data-testid="tutor-chat-messages"
        className="flex flex-col gap-2 overflow-y-auto"
        style={{ flex: '1 1 auto', minHeight: 160 }}
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
            {m.snapshot && onPreview && <button type="button" className="min-h-11 self-start rounded-lg border border-[var(--border-primary)] px-3 py-2 text-sm" disabled={sending || disabled} onClick={() => onPreview(m.id, m.snapshot!, m.focus ?? null)}>Preview turn workspace</button>}
            {m.workspaceChange && m.workspaceChange.status !== 'unchanged' && <div className="space-y-2 text-sm" role={m.workspaceChange.status === 'rejected' ? 'alert' : 'status'}>
              <p>{m.workspaceChange.status === 'applied' ? 'Tutor change applied' : m.workspaceChange.status === 'undone' ? 'Tutor change undone' : m.workspaceChange.status === 'restored' ? 'Earlier state restored' : m.workspaceChange.reason ?? 'No change was applied.'}</p>
              {m.id === latestChange?.id && m.workspaceChange.status === 'applied' && onWorkspaceResult && <button type="button" className="min-h-11 rounded-lg border border-[var(--border-primary)] px-3 py-2" disabled={sending || disabled} onClick={() => undoChange(m.id)} title="Restore the whole pre-turn workspace, including any subsequent manual edits">Undo Tutor change</button>}
            </div>}
            {m.role === 'assistant' && Boolean(m.comparisonGroups?.length) && <section aria-label="Workspace comparison" className="flex flex-wrap gap-2">
              {m.comparisonGroups!.map((group, index) => <figure key={index} data-testid="branch-comparison-shape" className="rounded-lg border border-[var(--border-primary)] bg-[var(--card-bg)] p-2">
                <figcaption className="max-w-48 text-xs"><strong className="block">{group.branch_title}</strong><span className="text-[var(--text-secondary)]">{group.label}</span></figcaption>
                <PhysicalChordDiagram positions={group.notes} tuning={group.tuning} />
              </figure>)}
            </section>}
            {m.role === 'assistant' && m.exerciseSuggestion && <ExerciseComposer sourceId={m.exerciseSuggestion.source_artifact_id} revision={m.exerciseSuggestion.expected_updated_at} selection={m.exerciseSuggestion.source_selection} steps={m.exerciseSuggestion.steps} suggestion={m.exerciseSuggestion} />}
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
          aria-label="Ask the Tutor"
          disabled={sending || disabled}
          placeholder={emptyMessage}
          data-testid="tutor-chat-input"
          className="min-w-0 flex-1 px-3 py-2 rounded-lg border text-xs focus-visible:outline-2 focus-visible:outline-[var(--accent-700)] transition-colors"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        />
        <button
          type="submit"
          disabled={sending || disabled || !input.trim()}
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
