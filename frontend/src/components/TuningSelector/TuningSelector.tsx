import type { TuningInfo } from '../../types';

interface TuningSelectorProps {
  selectedTuning: string;
  tunings: TuningInfo[];
  customTuningNotes: string[] | null;
  onSelect: (tuningId: string) => void;
}

export function TuningSelector({
  selectedTuning,
  tunings,
  customTuningNotes,
  onSelect,
}: TuningSelectorProps) {
  const isCustom = selectedTuning === 'custom';

  return (
    <div className="flex flex-col gap-1">
      <label
        className="text-[10px] md:text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        Tuning
      </label>
      <select
        value={selectedTuning}
        onChange={(e) => onSelect(e.target.value)}
        disabled={isCustom}
        className="w-full min-w-[180px] md:w-[280px] px-3 md:px-4 py-2 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 transition-all cursor-pointer touch-target"
        style={{
          backgroundColor: 'var(--bg-input)',
          borderColor: 'var(--border-primary)',
          color: 'var(--text-primary)',
          // @ts-expect-error CSS custom property
          '--tw-ring-color': 'var(--accent-500)',
        }}
      >
        {tunings.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({[...t.notes].reverse().join(' ')})
          </option>
        ))}
        {isCustom && customTuningNotes && (
          <option value="custom">
            Custom ({[...customTuningNotes].reverse().join(' ')})
          </option>
        )}
      </select>
    </div>
  );
}
