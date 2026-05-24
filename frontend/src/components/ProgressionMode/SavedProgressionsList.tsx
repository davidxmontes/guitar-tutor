import { useState } from 'react';
import type { SavedProgression } from '../../types';

interface SavedProgressionsListProps {
  progressions: SavedProgression[];
  loading: boolean;
  onLoad: (progression: SavedProgression) => void;
  onDelete: (id: string) => Promise<void>;
}

export function SavedProgressionsList({ progressions, loading, onLoad, onDelete }: SavedProgressionsListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  if (progressions.length === 0) {
    return (
      <div className="py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        No saved progressions yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
      {progressions.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {p.name}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {p.key_root && p.key_mode ? `${p.key_root} ${p.key_mode} · ` : ''}
              {p.slots.length} chord{p.slots.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button
            onClick={() => onLoad(p)}
            className="text-[10px] px-2 py-0.5 rounded font-medium flex-shrink-0"
            style={{ backgroundColor: 'var(--accent-600)', color: 'white' }}
          >
            Load
          </button>
          <button
            onClick={() => handleDelete(p.id)}
            disabled={deletingId === p.id}
            className="text-[10px] px-2 py-0.5 rounded flex-shrink-0 disabled:opacity-50"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
