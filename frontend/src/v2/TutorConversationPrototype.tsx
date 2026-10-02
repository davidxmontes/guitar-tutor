// Throwaway UI prototype: conversation-first Tutor hierarchy for the Study support panel.
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { LearningPreferences } from '../types/v2';
import './TutorConversationPrototype.css';

const prompts = [
  'Explain this passage',
  'How should I practise this?',
  'Explain the techniques',
  'Give me a 5-minute drill',
];

const answer = 'Loop the passage slowly and listen for the note that feels like home. Keep your first finger planted through the return, then add speed only when the shift feels relaxed.';

export function TutorConversationPrototype({ context }: { context: string }) {
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Array<{ id: number; question: string; answer: string }>>([]);
  const [searchOnline, setSearchOnline] = useState(false);
  const [preferences, setPreferences] = useState<LearningPreferences>({ level: 'beginner', style: 'balanced', minutes: 5 });
  const textarea = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const suggestions = useRef<HTMLDivElement>(null);
  const settingsId = `support-settings-${useId().replaceAll(':', '')}`;
  const suggestionsId = `support-suggestions-${useId().replaceAll(':', '')}`;

  useEffect(() => {
    if (turns.length) conversation.current?.scrollTo({ top: conversation.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  function insertPrompt(prompt: string) {
    setDraft(prompt);
    suggestions.current?.hidePopover();
    requestAnimationFrame(() => textarea.current?.focus());
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question) return;
    setTurns(current => [...current, { id: current.length + 1, question, answer }]);
    setDraft('');
  }

  return <section className="support-proto-chat" role="dialog" aria-label="Tutor conversation prototype">
    <header className="support-proto-chat__header">
      <div><h2>Tutor</h2><p>Ask, listen, try it on the guitar.</p></div>
      <button type="button" className="support-proto-chat__quiet support-proto-chat__settings-trigger"
        popoverTarget={settingsId} aria-haspopup="dialog">Settings</button>
      <div id={settingsId} className="support-proto-chat__popover support-proto-chat__settings" popover="auto" role="dialog" aria-label="Teaching preferences">
        <div className="support-proto-chat__popover-heading"><strong>Teaching preferences</strong><small>For this preview</small></div>
        <label>Your level<select value={preferences.level} onChange={event => setPreferences(current => ({ ...current, level: event.target.value as LearningPreferences['level'] }))}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option></select></label>
        <label>Teaching style<select value={preferences.style} onChange={event => setPreferences(current => ({ ...current, style: event.target.value as LearningPreferences['style'] }))}><option value="balanced">Show and explain</option><option value="explain">Explain the why</option><option value="practice">Get me playing</option></select></label>
        <label>Practice time<select value={preferences.minutes} onChange={event => setPreferences(current => ({ ...current, minutes: Number(event.target.value) as LearningPreferences['minutes'] }))}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="20">20 minutes</option></select></label>
      </div>
    </header>

    <div ref={conversation} className="support-proto-chat__conversation" aria-live="polite">
      {turns.length === 0 ? <div className="support-proto-chat__empty">
        <p>Ask about this passage, or choose a place to begin.</p>
        <div className="support-proto-chat__starters">
          <button type="button" onClick={() => insertPrompt('Explain this passage')}>Explain this passage</button>
          <button type="button" onClick={() => insertPrompt('How should I practise this?')}>Help me practise</button>
        </div>
      </div> : turns.map(turn => <div className="support-proto-chat__turn" key={turn.id}>
        <article className="support-proto-chat__message support-proto-chat__message--learner"><small>You</small><p>{turn.question}</p></article>
        <article className="support-proto-chat__message support-proto-chat__message--tutor"><small>Tutor</small><p>{turn.answer}</p></article>
      </div>)}
    </div>

    <form className="support-proto-chat__composer" onSubmit={submit}>
      <p className="support-proto-chat__context"><span>Asking about</span><strong>{context}</strong></p>
      <label className="support-proto-chat__field"><span>Question</span><textarea ref={textarea} rows={2} value={draft} onChange={event => setDraft(event.target.value)} placeholder="What would you like to understand or try?" onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
      }} /></label>
      <div className="support-proto-chat__compose-actions">
        <div>
          <button type="button" className="support-proto-chat__quiet support-proto-chat__suggestions-trigger" popoverTarget={suggestionsId}>Suggestions</button>
          <label className="support-proto-chat__search"><input type="checkbox" checked={searchOnline} onChange={event => setSearchOnline(event.target.checked)} /> Search online</label>
        </div>
        <button type="submit" className="support-proto-chat__send" aria-label="Send question" disabled={!draft.trim()}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 14-7-4 14-3-6-7-1Z"/><path d="m12 13 7-8"/></svg>
        </button>
      </div>
      <div ref={suggestions} id={suggestionsId} className="support-proto-chat__popover support-proto-chat__suggestions" popover="auto" aria-label="Suggested questions">
        <strong>Suggested questions</strong>
        {prompts.map(prompt => <button key={prompt} type="button" onClick={() => insertPrompt(prompt)}>{prompt}</button>)}
      </div>
    </form>
  </section>;
}
