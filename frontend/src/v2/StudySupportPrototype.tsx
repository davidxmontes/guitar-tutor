// THROWAWAY: compare a single-size floating player (A) with a shared support rail (B).
// Existing SongStudy route/data; ?variant=A|B. All support-panel actions are local demos.
import { useEffect, useState } from 'react';
import { TutorConversationPrototype } from './TutorConversationPrototype';
import './StudySupportPrototype.css';

export function supportPrototypeVariant() {
  if (!import.meta.env.DEV) return null;
  const variant = new URLSearchParams(window.location.search).get('variant');
  return variant === 'A' || variant === 'B' ? variant : null;
}

function RecordingContents({ context, onClose, embedded = false }: { context: string; onClose?: () => void; embedded?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [setup, setSetup] = useState(false);
  return <section className="support-proto-recording" aria-label="Recording preview">
    <header className="support-proto-player-header"><strong>{setup ? 'Recording setup' : embedded ? 'Studio take' : 'Recording'}</strong>
      <div>{setup ? <button type="button" onClick={() => setSetup(false)}>Back to player</button> :
        <details className="support-proto-menu"><summary aria-label="Recording options">•••</summary><div>
          <button type="button" onClick={event => { event.currentTarget.closest('details')!.open = false; setPlaying(false); setSetup(true); }}>Sync with the score</button>
          <button type="button" onClick={event => { event.currentTarget.closest('details')!.open = false; setPlaying(false); setSetup(true); }}>Change recording</button>
        </div></details>}{onClose && <button type="button" aria-label="Close recording preview" onClick={onClose}>×</button>}</div>
    </header>
    {setup ? <div className="support-proto-setup">
      <p className="support-proto-eyebrow">PLAYBACK PAUSED</p><h3>Line up the first beat.</h3>
      <p>Adjust when the score starts in this recording. Your selected passage stays in place.</p>
      <label>First score beat at <input aria-label="Recording start time" defaultValue="0:14.0" /></label>
      <details><summary>Fine-tune a passage</summary><label>Passage starts at<input defaultValue="0:14.0" /></label><label>Passage ends at<input defaultValue="0:21.5" /></label></details>
      <button type="button" className="support-proto-primary" onClick={() => setSetup(false)}>Use this timing</button>
    </div> : <>
      <div className="support-proto-video" aria-label="Illustrated video placeholder">
        <svg viewBox="0 0 384 216" aria-hidden="true"><defs><linearGradient id={embedded ? 'studio-b' : 'studio-a'} x2="1" y2="1"><stop stopColor="#282e29"/><stop offset="1" stopColor="#45443a"/></linearGradient></defs><rect width="384" height="216" fill={`url(#${embedded ? 'studio-b' : 'studio-a'})`}/><g transform="translate(188 108) rotate(-26)"><ellipse cx="-16" cy="25" rx="56" ry="65" fill="#a18b62"/><ellipse cx="6" cy="-4" rx="40" ry="44" fill="#bba477"/><rect x="-2" y="-130" width="19" height="122" rx="3" fill="#836d4d"/><circle cx="8" cy="18" r="18" fill="#302d24"/><path d="M2 -125v193M6 -125v193M10 -125v193M14 -125v193" stroke="#ded3b9" strokeWidth=".6"/><rect x="-5" y="62" width="28" height="6" rx="1" fill="#423728"/></g><rect y="178" width="384" height="38" fill="#151916" opacity=".72"/></svg>
        <button type="button" className="support-proto-video-play" aria-label={playing ? 'Pause preview video' : 'Play preview video'} onClick={() => setPlaying(!playing)}>{playing ? 'Ⅱ' : '▶'}</button>
        <div className="support-proto-native"><span>{playing ? 'Ⅱ' : '▶'}</span><span>0:14 / 3:42</span><span className="support-proto-native-line"/><span>YouTube</span></div>
      </div>
      <div className="support-proto-playback"><button type="button" className="support-proto-primary" onClick={() => setPlaying(!playing)}>{playing ? 'Ⅱ Pause' : '▶ Play passage'}</button>
        <button type="button" className="support-proto-loop" aria-pressed={loop} onClick={() => setLoop(!loop)}>↻ Loop</button>
        <select aria-label="Preview playback speed" defaultValue="0.75"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option></select>
      </div>
      <div className="support-proto-player-context"><span>Passage · {context}</span><span>Timing estimated</span></div>
      {embedded && <div className="support-proto-recording-note"><h3>Listen. Try it. Repeat.</h3><p>Choose measures in the score, then play or loop that passage here.</p></div>}
    </>}
  </section>;
}

export function PrototypeRecording({ variant, context, covered }: { variant: 'A' | 'B'; context: string; covered: boolean }) {
  const [open, setOpen] = useState(true);
  if (variant === 'B') return null;
  return <><button type="button" className="music-button" aria-expanded={open} onClick={() => setOpen(!open)}>Video {open ? 'on' : 'off'}</button>
    {open && !covered && <div className="support-proto-floating"><RecordingContents context={context} onClose={() => setOpen(false)} /></div>}
  </>;
}

export function PrototypeCompanion({ variant, context, onClose }: { variant: 'A' | 'B'; context: string; onClose: () => void }) {
  const [tab, setTab] = useState(new URLSearchParams(window.location.search).get('panel') === 'recording' ? 'recording' : 'tutor');
  return <section className="support-proto-companion" aria-label="Support panel preview">
    {variant === 'B' && <nav className="support-proto-tabs" aria-label="Support panel"><button type="button" aria-pressed={tab === 'tutor'} onClick={() => setTab('tutor')}>Tutor</button><button type="button" aria-pressed={tab === 'recording'} onClick={() => setTab('recording')}>Recording</button></nav>}
    <button type="button" className="support-proto-close" aria-label="Close Tutor preview" onClick={onClose}>×</button>
    <div className="support-proto-chat-frame" hidden={variant === 'B' && tab !== 'tutor'}><TutorConversationPrototype context={context} /></div>
    {variant === 'B' && tab === 'recording' && <RecordingContents context={context} embedded />}
  </section>;
}

export function PrototypeSwitcher({ variant }: { variant: 'A' | 'B' }) {
  function switchVariant() { const url = new URL(window.location.href); url.searchParams.set('variant', variant === 'A' ? 'B' : 'A'); window.location.href = url.href; }
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (['ArrowLeft', 'ArrowRight'].includes(event.key) && !(event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) { event.preventDefault(); switchVariant(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  return <div className="support-proto-switcher"><button type="button" aria-label="Previous layout" onClick={switchVariant}>←</button><div><small>DESIGN STUDY · LOCAL DEMO</small><strong>{variant === 'A' ? 'A · Floating player + Tutor' : 'B · One panel with tabs'}</strong></div><button type="button" aria-label="Next layout" onClick={switchVariant}>→</button></div>;
}
