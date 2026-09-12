import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiClient } from '../api/client';
import type { ExerciseStep, LearningPreferences, TutorMessage, V2Branch } from '../types/v2';
import type { VoicingValue } from './Fretboard';
import { playChord, playTimedChords } from '../utils/audio';

function readPreferences(): LearningPreferences {
  try {
    const value = JSON.parse(localStorage.getItem('guitar-learning-preferences') ?? '{}');
    return { level: value.level === 'intermediate' ? 'intermediate' : 'beginner',
      style: ['balanced', 'explain', 'practice'].includes(value.style) ? value.style : 'balanced',
      minutes: [5, 10, 20].includes(value.minutes) ? value.minutes : 5 };
  } catch { return { level: 'beginner', style: 'balanced', minutes: 5 }; }
}

export function TutorPanel({ branch, context, busy, onBusy, onRefresh }: {
  branch: V2Branch; context: string; busy: boolean; onBusy: (value: boolean) => void;
  onRefresh: (updated: V2Branch) => Promise<void>;
}) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const draftKey = `guitar-tutor-draft:${branch.tutor_thread_id}`;
  const [question, setQuestion] = useState(() => { try { return sessionStorage.getItem(draftKey) ?? ''; } catch { return ''; } });
  const [preferences, setPreferences] = useState(readPreferences);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ id: string; revision: string } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const conversation = useRef<HTMLDivElement>(null);
  function updateQuestion(value: string) {
    setQuestion(value);
    try { if (value) sessionStorage.setItem(draftKey, value); else sessionStorage.removeItem(draftKey); } catch { /* Keep the in-memory draft. */ }
  }
  useEffect(() => () => stop.current?.(), []);
  useEffect(() => {
    let live = true;
    apiClient.listTutorMessages(branch.tutor_thread_id).then(value => { if (live) setMessages(value); })
      .catch(() => { if (live) setError('Could not load the conversation. Reopen this session to try again.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [branch.tutor_thread_id]);
  useEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [messages, sending]);
  function updatePreferences(value: Partial<LearningPreferences>) {
    const next = { ...preferences, ...value }; setPreferences(next);
    try { localStorage.setItem('guitar-learning-preferences', JSON.stringify(next)); } catch { /* Still usable without browser storage. */ }
  }
  async function ask() {
    if (busy || loading || !question.trim()) return;
    onBusy(true); setSending(true); setError(''); setNotice(''); stop.current?.();
    let received = false;
    try {
      const result = await apiClient.sendTutorTurn({ session_id: branch.session_id, branch_id: branch.id, message: question, learning_preferences: preferences });
      received = true;
      updateQuestion('');
      if (result.branch) {
        setUndo(result.mutation && result.mutation.kind !== 'noop' ? { id: result.branch.live_presentation_turn_id!, revision: result.branch.updated_at } : null);
        await onRefresh(result.branch);
      }
      setMessages(await apiClient.listTutorMessages(branch.tutor_thread_id));
    } catch { setError(received ? 'Your Tutor replied, but the view could not refresh. Reopen this session to see the saved response.' : 'The Tutor could not finish this turn. Your question is still here. Please try again.'); }
    finally { onBusy(false); setSending(false); }
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
  const prompts = branch.active_workspace === 'harmony'
    ? ['Explain this', 'Show me an easier shape', 'Compare two useful views', `Give me a ${preferences.minutes}-minute drill`]
    : ['Why do these chords work?', 'Suggest a smoother transition', 'Show the voice leading', `Give me a ${preferences.minutes}-minute drill`];
  return <aside id="workspace-tutor" className="tutor-panel" aria-label="Your Tutor">
    <header className="tutor-heading"><span className="tutor-mark" aria-hidden="true">✦</span><div><h2>Your Tutor</h2><p>Understand it. Hear it. Make it yours.</p></div></header>
    <p className="tutor-context"><span>Working with</span><strong>{context}</strong></p>
    <a className="learning-return-link" href="#workspace-music">Back to the music ↑</a>
    <details className="tutor-preferences"><summary>How I teach · {preferences.level}</summary>
      <div className="learning-fields">
        <label>Your level<select value={preferences.level} onChange={event => updatePreferences({ level: event.target.value as LearningPreferences['level'] })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option></select></label>
        <label>Teaching style<select value={preferences.style} onChange={event => updatePreferences({ style: event.target.value as LearningPreferences['style'] })}><option value="balanced">Show and explain</option><option value="explain">Explain the why</option><option value="practice">Get me playing</option></select></label>
        <label>Practice time<select value={preferences.minutes} onChange={event => updatePreferences({ minutes: Number(event.target.value) as LearningPreferences['minutes'] })}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="20">20 minutes</option></select></label>
      </div>
    </details>
    <div className="tutor-conversation" aria-label="Tutor conversation" ref={conversation} tabIndex={0}>
      {loading && <p role="status">Loading your conversation…</p>}
      {!loading && messages.length === 0 && <div className="tutor-welcome"><h3>Start with one small question.</h3><p>Select a note, shape, or chord. I can explain it, compare alternatives, or turn it into something to practise.</p></div>}
      {messages.filter(message => message.role !== 'tool').map(message => <article key={message.id} className={`tutor-message tutor-message--${message.role}`}>
        <span className="tutor-speaker">{message.role === 'user' ? 'You' : 'Tutor'}</span>
        <div className="chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content.text ?? ''}</ReactMarkdown></div>
        {message.role === 'assistant' && message.content.presentation && message.id !== branch.live_presentation_turn_id && <button className="learning-text-button" disabled={busy} onClick={() => void restore(message.id)}>Show this teaching view</button>}
      </article>)}
      {sending && <p className="tutor-thinking" role="status">Preparing an explanation and useful musical views…</p>}
    </div>
    {visible.length > 0 && <section className="tutor-candidates" aria-label="Candidates"><h3>Try an alternative</h3><p>Hear it first. Keep the one you like.</p>{visible.map(candidate => <div key={String(candidate.id)} role="group" aria-label={`Candidate: ${candidate.label}`}>
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
    {undo && <div className="tutor-undo"><button className="music-button" disabled={busy || branch.updated_at !== undo.revision} onClick={() => void restore(undo.id, true)}>Undo musical change</button><p>{branch.updated_at === undo.revision ? 'Returns to the music before your last question.' : 'You edited the music after this turn. Undo is disabled to protect those edits.'}</p></div>}
    {notice && <p className="learning-notice" role="status">{notice}</p>}
    {error && <p className="learning-error" role="alert">{error}</p>}
    <form className="tutor-compose" onSubmit={event => { event.preventDefault(); void ask(); }}>
      <div className="tutor-prompts">{prompts.map(prompt => <button key={prompt} type="button" disabled={busy} onClick={() => { updateQuestion(prompt); document.getElementById(`question-${branch.id}`)?.focus(); }}>{prompt}</button>)}</div>
      <label htmlFor={`question-${branch.id}`}>Ask the Tutor</label>
      <textarea id={`question-${branch.id}`} placeholder="What would you like to understand or try?" rows={3} maxLength={12000} value={question} disabled={sending} onChange={event => updateQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} />
      <div className="tutor-send"><small>Enter to send · Shift + Enter for a new line</small><button className="music-button learning-primary" disabled={busy || loading || !question.trim()}>Ask</button></div>
    </form>
  </aside>;
}
