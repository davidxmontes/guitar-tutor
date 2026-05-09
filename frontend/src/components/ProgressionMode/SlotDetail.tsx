import { useState } from 'react';
import { useAppStore } from '../../stores';
import { ChordDiagramRow } from '../ChordDiagram';

export function SlotDetail() {
  const {
    progressionSlots,
    activeSlotIndex,
    progressionChordData,
    progressionChordLoading,
    setSlotVoicing,
  } = useAppStore();

  const [diagramsExpanded, setDiagramsExpanded] = useState(true);

  const activeSlot = progressionSlots[activeSlotIndex];
  if (!activeSlot) return null;

  const isPinned = !!activeSlot.positions;

  if (isPinned) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {activeSlot.root} {activeSlot.quality.replace(/_/g, ' ')}
          </span>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
            style={{
              backgroundColor: 'var(--accent-50)',
              color: 'var(--accent-600)',
              borderColor: 'var(--accent-200)',
            }}
          >
            pinned ✦
          </span>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Agent-chosen positions for smooth voice leading.
        </p>
        <div className="flex flex-wrap gap-2">
          {activeSlot.positions!.map((pos, i) => (
            <span
              key={i}
              className="text-xs px-2 py-1 rounded border"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-secondary)',
              }}
            >
              str {pos.string} · fret {pos.fret === 0 ? 'open' : pos.fret}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (progressionChordLoading) {
    return (
      <div className="py-4 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
        Loading voicings...
      </div>
    );
  }

  if (!progressionChordData) return null;

  const activeVoicings = activeSlot.selectedVoicing ? [activeSlot.selectedVoicing] : [];

  const handleToggleVoicing = (label: string) => {
    setSlotVoicing(activeSlotIndex, activeSlot.selectedVoicing === label ? '' : label);
  };

  return (
    <ChordDiagramRow
      voicings={progressionChordData.voicings}
      activeVoicings={activeVoicings}
      onToggleVoicing={handleToggleVoicing}
      isExpanded={diagramsExpanded}
      onToggleExpanded={() => setDiagramsExpanded(!diagramsExpanded)}
    />
  );
}
