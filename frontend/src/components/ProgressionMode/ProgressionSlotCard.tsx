import type { ProgressionSlot } from '../../types';

interface ProgressionSlotCardProps {
  slot: ProgressionSlot;
  index: number;
  isActive: boolean;
  onSetActive: (index: number) => void;
  onRemove: (index: number) => void;
}

export function ProgressionSlotCard({
  slot,
  index,
  isActive,
  onSetActive,
  onRemove,
}: ProgressionSlotCardProps) {
  const isPinned = !!slot.positions;
  const displayQuality = slot.quality.replace(/_/g, ' ');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSetActive(index)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSetActive(index); }}
      className="flex-shrink-0 rounded-xl border px-3 py-2 cursor-pointer transition-all min-w-[76px] relative select-none"
      style={{
        backgroundColor: isPinned ? 'var(--bg-tertiary)' : 'var(--card-bg)',
        borderColor: isActive ? 'var(--accent-500)' : 'var(--border-primary)',
        borderWidth: isActive ? '2px' : '1px',
        boxShadow: isActive ? '0 0 0 1px var(--accent-200)' : 'none',
      }}
    >
      <div className="text-sm font-bold pr-3" style={{ color: 'var(--text-primary)' }}>
        {slot.root}
      </div>
      <div className="text-xs truncate max-w-[80px]" style={{ color: 'var(--text-secondary)' }}>
        {displayQuality}
      </div>
      <div
        className="text-[9px] mt-0.5 font-medium"
        style={{ color: isPinned ? 'var(--accent-500)' : 'var(--text-muted)' }}
      >
        {isPinned ? 'pinned ✦' : 'open'}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(index); }}
        className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded transition-colors hover:opacity-70"
        style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1 }}
        aria-label="Remove slot"
      >
        ×
      </button>
    </div>
  );
}
