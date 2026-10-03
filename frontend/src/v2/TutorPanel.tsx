import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiClient } from '../api/client';
import type { ExerciseStep, LearningPreferences, TutorMessage, V2Branch, SongTutorContext } from '../types/v2';
import type { VoicingValue } from '../types/music';
import { playChord, playTimedChords } from '../utils/audio';

function selectionLabel(context: SongTutorContext): string {
  const selection = context.selection;
  return selection.type === 'beat' ? `Selected passage: M${selection.measureIndex + 1} · beat ${selection.beatIndex + 1}`
    : `Selected passage: M${selection.startMeasureIndex + 1}–${selection.endMeasureIndex + 1}`;
}

export function TutorPanel({ branch, busy, context, preferences, onBusy, onRefresh, songContext }: {
  branch: V2Branch; busy: boolean; onBusy: (value: boolean) => void;
  context: string;
  preferences: LearningPreferences;
  onRefresh: (updated: V2Branch) => Promise<void>;
  songContext?: SongTutorContext;
}) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const draftKey = `guitar-tutor-draft:${branch.tutor_thread_id}`;
  const [question, setQuestion] = useState(() => { try { return sessionStorage.getItem(draftKey) ?? ''; } catch { return ''; } });
  const [webSearch, setWebSearch] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [failedSelection, setFailedSelection] = useState<SongTutorContext | null>(null);
  const [pendingSelection, setPendingSelection] = useState<SongTutorContext | null>(null);
  const [watch, setWatch] = useState(0);
  const submissionError = useRef<string | null>(null);
  const submissionDetail = useRef<string | null>(null);
  const current = useRef({ branch, onBusy, onRefresh });
  useEffect(() => { current.current = { branch, onBusy, onRefresh }; });
  const [notice, setNotice] = useState('');
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ id: string; revision: string } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const questionField = useRef<HTMLTextAreaElement>(null);
  const suggestions = useRef<HTMLDivElement>(null);
  const suggestionsId = `tutor-suggestions-${branch.id}`;
  function updateQuestion(value: string) {
    setQuestion(value); setFailedSelection(null);
    try { if (value) sessionStorage.setItem(draftKey, value); else sessionStorage.removeItem(draftKey); } catch { /* Keep the in-memory draft. */ }
  }
  useEffect(() => () => stop.current?.(), []);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function reconnect() {
      try {
        const job = await apiClient.latestTutorJob(branch.session_id, branch.id);
        if (!live) return;
        const accepted = job?.status === 'running' || job?.id === submissionError.current;
        setError(submissionError.current && submissionError.current !== job?.id ? submissionDetail.current ?? 'Your question is still here. Please try again.' : '');
        submissionError.current = null; submissionDetail.current = null;
        const running = job?.status === 'running';
        setSending(running);
        if (running) current.current.onBusy(true);
        setPendingQuestion(running ? job.message : '');
        setPendingSelection(running ? job.song_context ?? null : null);
        if (running) {
          setError('');
        } else if (job?.status === 'failed') {
          setError(job.error ?? 'The Tutor could not finish this turn. Please try again.');
          setQuestion(value => value || job.message);
          setFailedSelection(job.song_context ?? null);
          setWebSearch(job.web_search ?? false);
        } else if (job?.result?.branch) {
          // Read today's branch, not the possibly older snapshot returned by the job.
          const session = await apiClient.getV2Session(branch.session_id);
          const updated = session.branches.find(value => value.id === branch.id);
          if (!live) return;
          if (updated && updated.updated_at !== current.current.branch.updated_at) {
            await current.current.onRefresh(updated);
          }
          setUndo(updated && updated.updated_at === job.result.branch.updated_at && job.result.mutation && job.result.mutation.kind !== 'noop'
            ? { id: updated.live_presentation_turn_id!, revision: updated.updated_at } : null);
        }
        const history = await apiClient.listTutorMessages(branch.tutor_thread_id);
        if (live) {
          setMessages(history); setLoading(false);
          current.current.onBusy(running);
          if (running) timer = setTimeout(() => void reconnect(), 2000);
          if (job && accepted && job.status !== 'failed') {
            setQuestion(value => value === job.message ? '' : value);
            try { if (sessionStorage.getItem(draftKey) === job.message) sessionStorage.removeItem(draftKey); } catch { /* Draft stays available in memory. */ }
          }
        }
      } catch {
        if (live) {
          setError('Connection lost. Reconnecting to your Tutor…');
          timer = setTimeout(() => void reconnect(), 5000);
        }
      }
    }
    void reconnect();
    return () => { live = false; clearTimeout(timer); };
  }, [branch.id, branch.session_id, branch.tutor_thread_id, draftKey, watch]);
  useEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [messages, sending]);
  async function ask() {
    if (busy || loading || !question.trim()) return;
    const requestContext = failedSelection ?? songContext;
    onBusy(true); setSending(true); setPendingSelection(requestContext ?? null); setError(''); setNotice(''); stop.current?.();
    const requestId = crypto.randomUUID();
    try {
      const job = await apiClient.startTutorJob({ request_id: requestId, session_id: branch.session_id, branch_id: branch.id, message: question, learning_preferences: preferences, web_search: Boolean(requestContext && webSearch), ...(requestContext ? { song_context: requestContext } : {}) });
      setPendingQuestion(job.message);
      updateQuestion('');
    } catch (error) {
      if (requestContext) { setFailedSelection(requestContext); submissionDetail.current = error instanceof Error ? error.message : 'Could not send this song question. Please try again.'; }
      // An interrupted acknowledgement can still mean the server accepted it.
      // Reconnect before enabling another submission.
      submissionError.current = requestId;
      setError('Checking whether your question reached the Tutor…');
    }
    setWatch(value => value + 1);
  }

  async function restore(turnId: string, musical = false) {
    onBusy(true); setError(''); stop.current?.();
    try {
      const result = await apiClient.restoreTutorTurn(branch, turnId, musical);
      await onRefresh(result.branch); setUndo(null);
      setNotice(musical ? 'Musical change undone. Your conversation is kept.' : 'Teaching view restored. Your current music is kept.');
    } catch { setError('Could not restore this turn. The music may have changed; reopen the session and try again.'); }
    finally { onBusy(false); }
  }
  const liveTurn = messages.find(message => message.id === branch.live_presentation_turn_id);
  const candidates = liveTurn?.content.candidates;
  const visible = candidates?.candidates.filter(value => !dismissed.includes(`${liveTurn!.id}:${value.id}`)) ?? [];
  async function keep(candidate: Record<string, unknown>, develop = false) {
    if (!liveTurn) return;
    onBusy(true); setError(''); stop.current?.();
    try {
      const updated = candidates?.candidate_kind === 'voicing'
        ? (await apiClient.editHarmony(branch.session_id, branch.id, { pin: { chord: candidate.chord, voicing: candidate.voicing } })).branch
        : await apiClient.keepCandidate(branch, liveTurn.id, String(candidate.id), develop);
      await onRefresh(updated); setUndo(null);
      setNotice(candidates?.candidate_kind === 'voicing' ? 'Shape pinned in this Harmony exploration.' : develop ? 'Idea opened for editing.' : 'Applied to your working music. Use Save idea to add it to My Stuff.');
    } catch { setError('Could not apply this suggestion. Refresh the session and try again.'); }
    finally { onBusy(false); }
  }
  const prompts = songContext ? ['Explain this passage', 'How should I practise this?', 'Explain the techniques', `Give me a ${preferences.minutes}-minute drill`] : branch.active_workspace === 'harmony'
    ? ['Explain this', 'Show me an easier shape', 'Compare two useful views', `Give me a ${preferences.minutes}-minute drill`]
    : ['Why do these chords work?', 'Suggest a smoother transition', 'Show the voice leading', `Give me a ${preferences.minutes}-minute drill`];
  function insertPrompt(prompt: string, closeSuggestions = false) {
    updateQuestion(prompt);
    if (closeSuggestions) suggestions.current?.hidePopover();
    requestAnimationFrame(() => questionField.current?.focus());
  }
  const starters = songContext
    ? [{ label: 'Explain this passage', prompt: prompts[0] }, { label: 'Help me practise', prompt: prompts[1] }]
    : [{ label: prompts[0], prompt: prompts[0] }, { label: 'Help me practise', prompt: prompts[3] }];
  return <div className="tutor-panel">
    <div className="tutor-scroll" aria-label="Tutor conversation" ref={conversation} tabIndex={0}>
    {!songContext && <a className="learning-return-link" href="#workspace-music">Back to the music ↑</a>}
    <div className="tutor-conversation">
      {loading && !sending && <p role="status">Loading your conversation…</p>}
      {!loading && !sending && messages.length === 0 && <div className="tutor-welcome"><p>Ask about what you’re working on, or choose a place to begin.</p><div className="tutor-starters">{starters.map(starter => <button key={starter.label} type="button" disabled={busy} onClick={() => insertPrompt(starter.prompt)}>{starter.label}</button>)}</div></div>}
      {messages.filter(message => message.role !== 'tool').map(message => <article key={message.id} className={`tutor-message tutor-message--${message.role}`}>
        <span className="tutor-speaker">{message.role === 'user' ? 'You' : 'Tutor'}</span>
        {songContext && message.content.song_context && <small>{message.content.song_context.title} · {message.content.song_context.track.name} · {selectionLabel(message.content.song_context)}</small>}
        {songContext && message.content.song_context?.web_search_error && <p className="learning-error">{message.content.song_context.web_search_error}</p>}
        {songContext && message.content.song_context?.web_sources && <details><summary>Online sources ({message.content.song_context.web_sources.length})</summary><ul>{message.content.song_context.web_sources.map((source, index) => <li key={`${source.url}:${index}`}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>{message.content.song_context.web_sources.length === 0 && <p>No online sources found.</p>}</details>}
        <div className="chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content.text ?? ''}</ReactMarkdown></div>
        {!songContext && message.role === 'assistant' && message.content.presentation && message.id !== branch.live_presentation_turn_id && <button className="learning-text-button" disabled={busy} onClick={() => void restore(message.id)}>Show this teaching view</button>}
      </article>)}
      {sending && <><article className="tutor-message tutor-message--user"><span className="tutor-speaker">You</span><p>{pendingQuestion || question}</p>{pendingSelection && <small>{selectionLabel(pendingSelection)}</small>}</article><p className="tutor-thinking" role="status">{pendingQuestion ? 'Working on your answer. You can leave and return to this session.' : 'Sending your question…'}</p></>}
    </div>
    {!songContext && visible.length > 0 && <section className="tutor-candidates" aria-label="Candidates"><h3>Try an alternative</h3><p>Hear it first. Keep the one you like.</p>{visible.map(candidate => <div key={String(candidate.id)} role="group" aria-label={`Candidate: ${candidate.label}`}>
      <h4>{String(candidate.label)}</h4>
      {Array.isArray(candidate.preview) && <p>{(candidate.preview as ExerciseStep[]).map(step => step.label).join(' → ')}</p>}
      <div className="music-controls"><button className="music-button" disabled={busy} onClick={() => {
        stop.current?.();
        try { if (candidate.voicing) { const voicing = candidate.voicing as VoicingValue; stop.current = playChord(voicing.positions, .03, 1.2, voicing.tuning); }
          else if (Array.isArray(candidate.preview)) stop.current = playTimedChords(candidate.preview as ExerciseStep[], 80);
        } catch { setError('Audio is unavailable. You can still inspect and keep the suggestion.'); }
      }}>Play</button><button className="music-button" disabled={busy} onClick={() => void keep(candidate)}>Keep</button>
      {candidates?.candidate_kind === 'progression-idea' && <button className="music-button" disabled={busy} onClick={() => void keep(candidate, true)}>Develop</button>}
      <button className="learning-text-button" disabled={busy} onClick={() => { stop.current?.(); setDismissed(previous => [...previous, `${liveTurn!.id}:${candidate.id}`]); }}>Dismiss</button></div>
    </div>)}</section>}
    {!songContext && undo && <div className="tutor-undo"><button className="music-button" disabled={busy || branch.updated_at !== undo.revision} onClick={() => void restore(undo.id, true)}>Undo musical change</button><p>{branch.updated_at === undo.revision ? 'Returns to the music before your last question.' : 'You edited the music after this turn. Undo is disabled to protect those edits.'}</p></div>}
    {notice && <p className="learning-notice" role="status">{notice}</p>}
    {error && <p className="learning-error" role="alert">{error}</p>}
    {songContext && failedSelection && <p className="learning-notice">Retry uses {selectionLabel(failedSelection)}. <button type="button" className="learning-text-button" onClick={() => setFailedSelection(null)}>Use current selection instead</button></p>}
    </div>
    <form className="tutor-compose" onSubmit={event => { event.preventDefault(); void ask(); }}>
      <p className="tutor-compose__context"><span>Asking about</span><strong title={context}>{context}</strong></p>
      <div className="tutor-compose__field"><label htmlFor={`question-${branch.id}`}>Ask the Tutor</label>
        <textarea ref={questionField} id={`question-${branch.id}`} placeholder="What would you like to understand or try?" rows={2} maxLength={12000} value={question} disabled={sending} onChange={event => updateQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} />
      </div>
      <div className="tutor-send"><div className="tutor-compose__tools">
        <button type="button" className="tutor-quiet tutor-suggestions-trigger" popoverTarget={suggestionsId}>Suggestions</button>
        {songContext && <label className="tutor-online-search" title="Allow Tutor to search online when useful"><input type="checkbox" checked={webSearch} disabled={busy} onChange={event => setWebSearch(event.target.checked)} /> Search online</label>}
      </div>
        <button className="tutor-send__button" aria-label="Ask" title="Enter to send · Shift + Enter for a new line" disabled={busy || loading || !question.trim()}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 14-7-4 14-3-6-7-1Z"/><path d="m12 13 7-8"/></svg></button>
      </div>
      <div ref={suggestions} id={suggestionsId} className="tutor-popover tutor-suggestions" popover="auto" aria-label="Suggested questions"><strong>Suggested questions</strong>{prompts.map(prompt => <button key={prompt} type="button" disabled={busy} onClick={() => insertPrompt(prompt, true)}>{prompt}</button>)}</div>
    </form>
  </div>;
}
