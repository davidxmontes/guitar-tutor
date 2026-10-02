// THROWAWAY: compare a movable, resizable player (A) with a shared support rail (B).
// Existing SongStudy route/data; ?variant=A|B. All support-panel actions are local demos.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { TutorConversationPrototype } from './TutorConversationPrototype';
import './StudySupportPrototype.css';

function RecordingContents({ context, onClose, embedded = false, moveHandle }: { context: string; onClose?: () => void; embedded?: boolean; moveHandle?: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [setup, setSetup] = useState(false);
  return <section className="support-proto-recording" aria-label="Recording preview">
    <header className="support-proto-player-header">{moveHandle ?? <strong>{setup ? 'Recording setup' : embedded ? 'Studio take' : 'Recording'}</strong>}
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

type PlayerBounds = { left: number; top: number; width: number; height: number };

function fitPlayer(bounds: PlayerBounds): PlayerBounds {
  const width = Math.max(Math.min(296, window.innerWidth - 24), Math.min(bounds.width, window.innerWidth - 24));
  // Leave room for the prototype switcher; a short landscape screen scrolls the player body.
  const height = Math.max(Math.min(350, window.innerHeight - 94), Math.min(bounds.height, window.innerHeight - 94));
  return { width, height, left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)), top: Math.max(12, Math.min(bounds.top, window.innerHeight - height - 82)) };
}

export function PrototypeRecording({ variant, context, covered }: { variant: 'A' | 'B'; context: string; covered: boolean }) {
  const [open, setOpen] = useState(true);
  const [bounds, setBounds] = useState<PlayerBounds | null>(null);
  const player = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; bounds: PlayerBounds; resize: boolean } | null>(null);

  useEffect(() => {
    const fit = () => setBounds(current => current && fitPlayer(current));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  function start(event: PointerEvent<HTMLButtonElement>, resize: boolean) {
    if (event.button !== 0 || !player.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { x: event.clientX, y: event.clientY, bounds: player.current.getBoundingClientRect(), resize };
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const from = gesture.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    const { left, top, width, height } = from.bounds;
    setBounds(fitPlayer(from.resize
      ? { left, top, width: Math.min(width + dx, window.innerWidth - left - 12), height: Math.min(height + dy, window.innerHeight - top - 82) }
      : { left: left + dx, top: top + dy, width, height }));
  }

  function keyAdjust(event: KeyboardEvent<HTMLButtonElement>, resize: boolean) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key) || !player.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Home') { setBounds(null); return; }
    const step = event.shiftKey ? 48 : 16;
    const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
    const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
    const { left, top, width, height } = player.current.getBoundingClientRect();
    setBounds(fitPlayer(resize
      ? { left, top, width: Math.min(width + dx, window.innerWidth - left - 12), height: Math.min(height + dy, window.innerHeight - top - 82) }
      : { left: left + dx, top: top + dy, width, height }));
  }

  const handleEvents = (resize: boolean) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(event, resize),
    onPointerMove: move,
    onPointerUp: () => { gesture.current = null; },
    onPointerCancel: () => { gesture.current = null; },
    onLostPointerCapture: () => { gesture.current = null; },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => keyAdjust(event, resize),
    onDoubleClick: () => setBounds(null),
  });

  if (variant === 'B') return null;
  return <><button type="button" className="music-button" aria-expanded={open} onClick={() => setOpen(!open)}>Video {open ? 'on' : 'off'}</button>
    {open && !covered && <div ref={player} className="support-proto-floating" style={bounds ? { ...bounds, bottom: 'auto', right: 'auto' } : undefined}>
      <RecordingContents context={context} onClose={() => setOpen(false)} moveHandle={
        <button type="button" className="support-proto-move" aria-label="Move recording" title="Drag to move · arrow keys to adjust · Home or double-click to reset" {...handleEvents(false)}>
          <span aria-hidden="true">⠿</span><strong>Recording</strong>
        </button>
      } />
      <button type="button" className="support-proto-resize" aria-label="Resize recording" title="Drag to resize · arrow keys to adjust · Home or double-click to reset" {...handleEvents(true)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13 13 3M8 13l5-5" /></svg>
      </button>
    </div>}
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
    const key = (event: globalThis.KeyboardEvent) => { if (['ArrowLeft', 'ArrowRight'].includes(event.key) && !(event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) { event.preventDefault(); switchVariant(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  return <div className="support-proto-switcher"><button type="button" aria-label="Previous layout" onClick={switchVariant}>←</button><div><small>DESIGN STUDY · LOCAL DEMO</small><strong>{variant === 'A' ? 'A · Floating player + Tutor' : 'B · One panel with tabs'}</strong></div><button type="button" aria-label="Next layout" onClick={switchVariant}>→</button></div>;
}
