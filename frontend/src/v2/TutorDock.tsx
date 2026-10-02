import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { TutorDockState } from './useTutorDock';
import './TutorDock.css';

const DEFAULT_HEIGHT = 70;
const HEIGHT_STORAGE_KEY = 'guitar-tutor-dock-height';

function initialHeight() {
  try {
    const saved = Number(localStorage.getItem(HEIGHT_STORAGE_KEY));
    if (saved) return Math.max(35, Math.min(95, saved));
  } catch { /* Use the default height when storage is unavailable. */ }
  return DEFAULT_HEIGHT;
}

export function TutorDock({ dock, context, children }: {
  dock: TutorDockState;
  context: string;
  children: ReactNode;
}) {
  const [height, setHeight] = useState(initialHeight);
  const dockElement = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const previousOpen = useRef(dock.open);
  const drag = useRef<{ x: number; y: number; width: number; height: number; compact: boolean } | null>(null);

  useEffect(() => {
    if (dock.open && !previousOpen.current) requestAnimationFrame(() => closeButton.current?.focus());
    previousOpen.current = dock.open;
  }, [dock.open]);

  function close() {
    dock.setOpen(false);
    requestAnimationFrame(() => dock.triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!dock.open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
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
      <button ref={closeButton} type="button" className="learning-text-button" aria-label="Close Tutor" onClick={close}>Close</button>
    </header>
    <p className="tutor-dock__context"><span>Working with</span><strong>{context}</strong></p>
    <div className="tutor-dock__body">{children}</div>
  </section>;
}
