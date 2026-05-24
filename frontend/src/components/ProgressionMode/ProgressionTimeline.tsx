import { useAppStore } from '../../stores';
import { ProgressionSlotCard } from './ProgressionSlotCard';
import { playChord } from '../../utils/audio';

export function ProgressionTimeline() {
  const {
    progressionSlots,
    activeSlotIndex,
    setActiveSlot,
    removeSlot,
    addSlot,
    diatonicChords,
    autoPlay,
  } = useAppStore();

  const handleSetActive = async (index: number) => {
    const slot = progressionSlots[index];
    await setActiveSlot(index);
    if (!autoPlay) return;
    if (slot.positions) {
      playChord(slot.positions.map(p => ({ string: p.string, fret: p.fret })));
    } else {
      const { progressionChordData } = useAppStore.getState();
      const voicings = progressionChordData?.voicings;
      if (voicings?.length) {
        const voicing = slot.selectedVoicing
          ? voicings.find(v => v.label === slot.selectedVoicing) ?? voicings[0]
          : voicings[0];
        playChord(voicing.positions.map(p => ({ string: p.string, fret: p.fret })));
      }
    }
  };

  const handlePrev = () => {
    if (progressionSlots.length === 0) return;
    const next = (activeSlotIndex - 1 + progressionSlots.length) % progressionSlots.length;
    handleSetActive(next);
  };

  const handleNext = () => {
    if (progressionSlots.length === 0) return;
    const next = (activeSlotIndex + 1) % progressionSlots.length;
    handleSetActive(next);
  };

  const handleAddDefault = () => {
    if (diatonicChords.length > 0) {
      const first = diatonicChords[0];
      addSlot({ root: first.root, quality: first.quality });
    } else {
      addSlot({ root: 'C', quality: 'major' });
    }
  };

  if (progressionSlots.length === 0) {
    return (
      <div
        className="py-4 text-sm text-center rounded-xl border"
        style={{
          color: 'var(--text-muted)',
          borderColor: 'var(--border-primary)',
          borderStyle: 'dashed',
        }}
      >
        Select a key and click chords above to build a progression
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Previous arrow */}
      <button
        onClick={handlePrev}
        disabled={progressionSlots.length <= 1}
        className="flex-shrink-0 p-1.5 rounded-lg border transition-colors disabled:opacity-30"
        style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
        aria-label="Previous slot"
      >
        ◀
      </button>

      {/* Slot cards */}
      <div className="flex gap-2 overflow-x-auto flex-1 py-1 min-w-0">
        {progressionSlots.map((slot, index) => (
          <ProgressionSlotCard
            key={index}
            slot={slot}
            index={index}
            isActive={index === activeSlotIndex}
            onSetActive={handleSetActive}
            onRemove={removeSlot}
          />
        ))}
        {/* + card */}
        <button
          onClick={handleAddDefault}
          className="flex-shrink-0 rounded-xl border px-4 py-2 min-w-[60px] flex items-center justify-center transition-all hover:opacity-70"
          style={{
            borderColor: 'var(--border-primary)',
            borderStyle: 'dashed',
            color: 'var(--text-muted)',
          }}
          aria-label="Add slot"
        >
          <span className="text-xl leading-none">+</span>
        </button>
      </div>

      {/* Next arrow */}
      <button
        onClick={handleNext}
        disabled={progressionSlots.length <= 1}
        className="flex-shrink-0 p-1.5 rounded-lg border transition-colors disabled:opacity-30"
        style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
        aria-label="Next slot"
      >
        ▶
      </button>

      {/* Counter */}
      <span
        className="flex-shrink-0 text-xs tabular-nums min-w-[36px] text-right"
        style={{ color: 'var(--text-muted)' }}
      >
        {activeSlotIndex + 1}/{progressionSlots.length}
      </span>
    </div>
  );
}
