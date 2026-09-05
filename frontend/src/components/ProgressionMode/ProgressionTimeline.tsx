import { useState, useRef, useEffect } from 'react';
import { useAppAuth } from '../../lib/authBypass';
import { useAppStore } from '../../stores';
import { ProgressionSlotCard } from './ProgressionSlotCard';
import { SaveProgressionModal } from './SaveProgressionModal';
import { SavedProgressionsList } from './SavedProgressionsList';
import { playChord } from '../../utils/audio';
import type { SavedProgression } from '../../types';

export function ProgressionTimeline() {
  const {
    progressionSlots,
    activeSlotIndex,
    progressionKeyRoot,
    progressionKeyMode,
    setActiveSlot,
    removeSlot,
    addSlot,
    diatonicChords,
    autoPlay,
    savedProgressions,
    userDataLoading,
    saveCurrentProgression,
    deleteProgression,
    fetchProgressions,
    setProgressionFromAgent,
  } = useAppStore();
  const { isSignedIn } = useAppAuth();

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedList, setShowSavedList] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSaveModal && !showSavedList) return;
    function handle(e: MouseEvent) {
      if (saveRef.current && !saveRef.current.contains(e.target as Node)) {
        setShowSaveModal(false);
        setShowSavedList(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showSaveModal, showSavedList]);

  const handleSetActive = async (index: number) => {
    const slot = progressionSlots[index];
    await setActiveSlot(index);
    if (!autoPlay) return;
    if (slot.positions) {
      playChord(slot.positions.map(p => ({ string: p.string, fret: p.fret })));
    } else if (slot.selectedVoicing) {
      playChord(slot.selectedVoicing.positions.map(p => ({ string: p.string, fret: p.fret })));
    } else {
      const { progressionChordData } = useAppStore.getState();
      const voicings = progressionChordData?.voicings;
      if (voicings?.length) {
        playChord(voicings[0].positions.map(p => ({ string: p.string, fret: p.fret })));
      }
    }
  };

  const handlePrev = () => {
    if (progressionSlots.length === 0) return;
    handleSetActive((activeSlotIndex - 1 + progressionSlots.length) % progressionSlots.length);
  };

  const handleNext = () => {
    if (progressionSlots.length === 0) return;
    handleSetActive((activeSlotIndex + 1) % progressionSlots.length);
  };

  useEffect(() => {
    if (progressionSlots.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); handleNext(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [progressionSlots.length, activeSlotIndex]);

  const handleAddDefault = () => {
    if (diatonicChords.length > 0) {
      const first = diatonicChords[0];
      addSlot({ root: first.root, quality: first.quality });
    } else {
      addSlot({ root: 'C', quality: 'major' });
    }
  };

  const defaultSaveName = [
    progressionKeyRoot,
    progressionKeyMode,
    progressionSlots.length > 0 ? `— ${progressionSlots.length} chord${progressionSlots.length !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' ') || 'My progression';

  const handleSave = async (name: string) => {
    await saveCurrentProgression(name);
    setShowSaveModal(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleLoad = async (p: SavedProgression) => {
    await setProgressionFromAgent(
      p.slots as any,
      p.key_root ?? undefined,
      p.key_mode ?? undefined,
    );
    setShowSavedList(false);
  };

  const handleOpenSavedList = () => {
    fetchProgressions();
    setShowSavedList(true);
    setShowSaveModal(false);
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
    <div className="flex flex-col gap-2">
      {/* Slot row */}
      <div className="flex items-center gap-2">
        <button
          onClick={handlePrev}
          disabled={progressionSlots.length <= 1}
          className="flex-shrink-0 p-1.5 rounded-lg border transition-colors disabled:opacity-30"
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          aria-label="Previous slot"
        >◀</button>

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
          <button
            onClick={handleAddDefault}
            className="flex-shrink-0 rounded-xl border px-4 py-2 min-w-[60px] flex items-center justify-center transition-all hover:opacity-70"
            style={{ borderColor: 'var(--border-primary)', borderStyle: 'dashed', color: 'var(--text-muted)' }}
            aria-label="Add slot"
          >
            <span className="text-xl leading-none">+</span>
          </button>
        </div>

        <button
          onClick={handleNext}
          disabled={progressionSlots.length <= 1}
          className="flex-shrink-0 p-1.5 rounded-lg border transition-colors disabled:opacity-30"
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          aria-label="Next slot"
        >▶</button>

        <span className="flex-shrink-0 text-xs tabular-nums min-w-[36px] text-right" style={{ color: 'var(--text-muted)' }}>
          {activeSlotIndex + 1}/{progressionSlots.length}
        </span>
      </div>

      {/* Save / Saved controls (only when signed in) */}
      {isSignedIn && (
        <div ref={saveRef} className="relative flex gap-2 justify-end">
          {saveSuccess && (
            <span className="text-xs self-center" style={{ color: 'var(--accent-600)' }}>Saved!</span>
          )}
          <button
            onClick={() => { setShowSavedList(false); setShowSaveModal((v) => !v); }}
            className="text-xs px-2 py-1 rounded-lg border"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          >
            Save
          </button>
          <button
            onClick={handleOpenSavedList}
            className="text-xs px-2 py-1 rounded-lg border"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
          >
            Saved ({savedProgressions.length})
          </button>

          {showSaveModal && (
            <SaveProgressionModal
              defaultName={defaultSaveName}
              onSave={handleSave}
              onCancel={() => setShowSaveModal(false)}
            />
          )}

          {showSavedList && (
            <div
              className="absolute top-full right-0 mt-2 z-50 rounded-xl border shadow-lg p-3 w-80"
              style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide block mb-2" style={{ color: 'var(--text-muted)' }}>
                Saved progressions
              </span>
              <SavedProgressionsList
                progressions={savedProgressions}
                loading={userDataLoading}
                onLoad={handleLoad}
                onDelete={deleteProgression}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
