import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { LearningPreferences } from '../types/v2';
import type { TutorDockState } from './useTutorDock';
import './TutorDock.css';

const DEFAULT_HEIGHT = 70;
const HEIGHT_STORAGE_KEY = 'guitar-tutor-dock-height';

function readPreferences(): LearningPreferences {
  try {
    const value = JSON.parse(localStorage.getItem('guitar-learning-preferences') ?? '{}');
    return { level: value.level === 'intermediate' ? 'intermediate' : 'beginner',
      style: ['balanced', 'explain', 'practice'].includes(value.style) ? value.style : 'balanced',
      minutes: [5, 10, 20].includes(value.minutes) ? value.minutes : 5 };
  } catch { return { level: 'beginner', style: 'balanced', minutes: 5 }; }
}

function initialHeight() {
  try {
    const saved = Number(localStorage.getItem(HEIGHT_STORAGE_KEY));
    if (saved) return Math.max(35, Math.min(95, saved));
  } catch { /* Use the default height when storage is unavailable. */ }
  return DEFAULT_HEIGHT;
}

export function TutorDock({ dock, children }: {
  dock: TutorDockState;
  children: (preferences: LearningPreferences) => ReactNode;
}) {
  const [height, setHeight] = useState(initialHeight);
  const [preferences, setPreferences] = useState(readPreferences);
  const dockElement = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const previousOpen = useRef(dock.open);
  const drag = useRef<{ x: number; y: number; width: number; height: number; compact: boolean } | null>(null);
  const settingsId = `tutor-settings-${useId().replaceAll(':', '')}`;

  useEffect(() => {
    if (dock.open && !previousOpen.current) requestAnimationFrame(() => closeButton.current?.focus());
    previousOpen.current = dock.open;
  }, [dock.open]);

  useEffect(() => {
    if (!dock.open) return;
    const element = dockElement.current;
    if (!element) return;
    let frame = 0;
    const updateAvailableHeight = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (window.innerWidth <= 1200) {
          element.style.removeProperty('--tutor-available-height');
          return;
        }
        const top = Math.max(16, element.getBoundingClientRect().top);
        element.style.setProperty('--tutor-available-height', `${Math.max(240, window.innerHeight - top - 16)}px`);
      });
    };
    const observer = new ResizeObserver(updateAvailableHeight);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener('resize', updateAvailableHeight);
    window.addEventListener('scroll', updateAvailableHeight, { passive: true });
    updateAvailableHeight();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', updateAvailableHeight);
      window.removeEventListener('scroll', updateAvailableHeight);
    };
  }, [dock.open]);

  function close() {
    dock.setOpen(false);
    requestAnimationFrame(() => dock.triggerRef.current?.focus());
  }

  function updatePreferences(value: Partial<LearningPreferences>) {
    const next = { ...preferences, ...value };
    setPreferences(next);
    try { localStorage.setItem('guitar-learning-preferences', JSON.stringify(next)); } catch { /* Still usable without browser storage. */ }
  }

  useEffect(() => {
    if (!dock.open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dockElement.current?.querySelector('[popover]:popover-open')) return;
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  function resizeHeight(value: number) {
    const next = Math.max(35, Math.min(95, value));
    setHeight(next);
    try { localStorage.setItem(HEIGHT_STORAGE_KEY, String(next)); } catch { /* Height still works in memory. */ }
  }

  function startResize(event: PointerEvent<HTMLDivElement>, compact: boolean) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, width: dockElement.current?.getBoundingClientRect().width ?? dock.width, height, compact };
  }

  function moveResize(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    if (start.compact) resizeHeight(start.height + (start.y - event.clientY) / window.innerHeight * 100);
    else dock.setWidth(start.width + start.x - event.clientX);
  }

  function keyResize(event: KeyboardEvent<HTMLDivElement>, compact: boolean) {
    const grow = compact ? 'ArrowUp' : 'ArrowLeft';
    const shrink = compact ? 'ArrowDown' : 'ArrowRight';
    if (![grow, shrink, 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const value = event.key === 'Home' ? (compact ? 35 : 320) : event.key === 'End' ? (compact ? 95 : 520)
      : (compact ? height : dockElement.current?.getBoundingClientRect().width ?? dock.width) + (event.key === grow ? 1 : -1) * (compact ? 5 : 20);
    if (compact) resizeHeight(value); else dock.setWidth(value);
  }

  return <section ref={dockElement} id="workspace-tutor" className="tutor-dock" aria-label="Tutor" hidden={!dock.open}
    style={{ '--tutor-sheet-height': `${height}dvh` } as CSSProperties}>
    {[false, true].map(compact => <div key={String(compact)}
      className={`tutor-dock__resizer tutor-dock__resizer--${compact ? 'height' : 'width'}`}
      role="separator" tabIndex={0} aria-label={compact ? 'Resize Tutor height' : 'Resize Tutor width'}
      aria-orientation={compact ? 'horizontal' : 'vertical'} aria-valuemin={compact ? 35 : 320}
      aria-valuemax={compact ? 95 : 520} aria-valuenow={Math.round(compact ? height : dock.width)}
      title="Drag to resize · arrow keys to adjust · double-click to reset"
      onPointerDown={event => startResize(event, compact)} onPointerMove={moveResize}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }} onKeyDown={event => keyResize(event, compact)}
      onDoubleClick={() => { dock.setWidth(340); resizeHeight(DEFAULT_HEIGHT); }} />)}
    <header className="tutor-dock__header"><h2>Tutor</h2>
      <div className="tutor-dock__header-actions">
        <button type="button" className="tutor-dock__quiet tutor-dock__settings-trigger" popoverTarget={settingsId} aria-haspopup="dialog">Settings</button>
        <button ref={closeButton} type="button" className="tutor-dock__quiet" aria-label="Close Tutor" onClick={close}>Close</button>
      </div>
      <div id={settingsId} className="tutor-dock__popover tutor-dock__settings" popover="auto" role="dialog" aria-label="Teaching preferences">
        <div className="tutor-dock__popover-heading"><strong>Teaching preferences</strong><small>Saved for next time</small></div>
        <label>Your level<select value={preferences.level} onChange={event => updatePreferences({ level: event.target.value as LearningPreferences['level'] })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option></select></label>
        <label>Teaching style<select value={preferences.style} onChange={event => updatePreferences({ style: event.target.value as LearningPreferences['style'] })}><option value="balanced">Show and explain</option><option value="explain">Explain the why</option><option value="practice">Get me playing</option></select></label>
        <label>Practice time<select value={preferences.minutes} onChange={event => updatePreferences({ minutes: Number(event.target.value) as LearningPreferences['minutes'] })}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="20">20 minutes</option></select></label>
      </div>
    </header>
    <div className="tutor-dock__body">{children(preferences)}</div>
  </section>;
}
