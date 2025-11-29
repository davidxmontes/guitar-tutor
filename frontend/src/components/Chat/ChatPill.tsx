import { useState, useRef } from 'react'

interface ChatPillProps {
  label: string;
  onActivate?: () => void;
  darkMode?: boolean;
  variant?: 'default' | 'accent';
  selected?: boolean;
}

export function ChatPill({ label, onActivate, darkMode = false, variant = 'default', selected = false }: ChatPillProps) {
  const [pressed, setPressed] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const trigger = () => {
    // Visual pressed feedback
    setPressed(true);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    // Clear press state after animation length
    timeoutRef.current = window.setTimeout(() => setPressed(false), 220);

    // Call action
    onActivate?.();
  }

  const handleClick = () => trigger();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger();
    }
  }

  // Base visuals
  const baseClasses = 'px-2.5 py-1 text-xs rounded-full border transition-all duration-150 font-medium focus:outline-none';
  const pressedClasses = 'scale-95 ring-1 ring-offset-1';

  // Dynamically compute inline styles for default vs accent
  const defaultStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-tertiary)',
    borderColor: 'var(--border-primary)',
    color: 'var(--text-secondary)'
  };

  const accentStyle: React.CSSProperties = {
    backgroundColor: darkMode ? 'var(--accent-900)' : 'var(--accent-50)',
    borderColor: darkMode ? 'var(--accent-700)' : 'var(--accent-300)',
    color: darkMode ? 'var(--accent-300)' : 'var(--accent-700)'
  };

  // Pressed overrides to briefly emphasize the action
  const pressedOverride: React.CSSProperties = variant === 'accent' ? {
    backgroundColor: darkMode ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16,185,129,0.12)'
  } : {
    backgroundColor: 'var(--bg-hover)'
  };

  // Selected visual override (persisted selected state)
  const selectedStyle: React.CSSProperties = variant === 'accent' ? {
    backgroundColor: darkMode ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16,185,129,0.14)',
    borderColor: 'var(--accent-500)',
    color: darkMode ? 'var(--accent-100)' : 'var(--accent-700)'
  } : {
    backgroundColor: 'var(--accent-50)',
    borderColor: 'var(--accent-300)',
    color: 'var(--accent-700)'
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-pressed={pressed || selected}
      className={`${baseClasses} ${pressed ? pressedClasses : ''} hover:scale-[1.02] active:scale-[0.98] ${selected ? 'shadow-sm' : ''}`}
      style={{ ...(variant === 'accent' ? accentStyle : defaultStyle), ...(selected ? selectedStyle : {}), ...(pressed ? pressedOverride : {}) }}
    >
      {label}
    </button>
  )
}
