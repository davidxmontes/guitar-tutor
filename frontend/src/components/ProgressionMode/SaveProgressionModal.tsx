import { useState } from 'react';

interface SaveProgressionModalProps {
  defaultName: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function SaveProgressionModal({ defaultName, onSave, onCancel }: SaveProgressionModalProps) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim());
    } catch {
      setError('Failed to save. Try again.');
      setSaving(false);
    }
  };

  return (
    <div
      className="absolute top-full left-0 mt-2 z-50 rounded-xl border shadow-lg p-3 w-72"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Save progression
        </span>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border px-2 py-1.5 text-sm outline-none"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
          }}
          placeholder="Name this progression..."
          maxLength={60}
        />
        {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 rounded-lg text-xs"
            style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-600)', color: 'white' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
