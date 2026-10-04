import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';

const STORAGE_KEY = 'guitar-tutor-dock';
const COMPACT_QUERY = '(max-width: 1200px)';
const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 320;
const MAX_WIDTH = 520;

type StoredLayout = { open: boolean; width: number };

export type TutorDockState = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  width: number;
  setWidth: Dispatch<SetStateAction<number>>;
  compact: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

function boundedWidth(width: number) {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
}

function initialLayout(compact: boolean): StoredLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && typeof saved.open === 'boolean' && typeof saved.width === 'number') {
      return { open: saved.open, width: boundedWidth(saved.width) };
    }
  } catch { /* Use the viewport default when storage is unavailable. */ }
  return { open: !compact, width: DEFAULT_WIDTH };
}

function initialCompact() {
  return window.matchMedia(COMPACT_QUERY).matches;
}

export function useTutorDock(): TutorDockState {
  const [compact, setCompact] = useState(initialCompact);
  const [layout, setLayout] = useState(() => initialLayout(initialCompact()));
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const updateLayout = useCallback((update: (current: StoredLayout) => StoredLayout) => {
    setLayout(current => {
      const next = update(current);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Layout still works in memory. */ }
      return next;
    });
  }, []);
  const setOpen = useCallback<Dispatch<SetStateAction<boolean>>>(value => {
    updateLayout(current => ({ ...current, open: typeof value === 'function' ? value(current.open) : value }));
  }, [updateLayout]);
  const setWidth = useCallback<Dispatch<SetStateAction<number>>>(value => {
    updateLayout(current => ({ ...current, width: boundedWidth(typeof value === 'function' ? value(current.width) : value) }));
  }, [updateLayout]);

  return { open: layout.open, setOpen, width: layout.width, setWidth, compact, triggerRef };
}
