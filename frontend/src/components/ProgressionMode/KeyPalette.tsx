import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores';
import { apiClient } from '../../api/client';
import type { ScaleCategory } from '../../types';

const ROOT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const OTHER_QUALITIES = [
  'major', 'minor', 'dominant7', 'major7', 'minor7', 'diminished', 'augmented',
  'sus2', 'sus4', '6', 'add9',
];

export function KeyPalette() {
  const {
    progressionKeyRoot,
    progressionKeyMode,
    diatonicChords,
    setProgressionKey,
    addSlot,
  } = useAppStore();

  const [scaleCategories, setScaleCategories] = useState<ScaleCategory[]>([]);
  const [showOtherPicker, setShowOtherPicker] = useState(false);
  const [otherRoot, setOtherRoot] = useState('C');
  const [otherQuality, setOtherQuality] = useState('major');

  useEffect(() => {
    apiClient.getScalesList().then((data) => setScaleCategories(data.scales));
  }, []);

  useEffect(() => {
    if (!progressionKeyRoot) {
      setProgressionKey('C', 'major');
    }
  }, []);

  const handleRootChange = (root: string) => {
    setProgressionKey(root, progressionKeyMode ?? 'major');
  };

  const handleModeChange = (mode: string) => {
    setProgressionKey(progressionKeyRoot ?? 'C', mode);
  };

  const handleChipClick = (chord: { root: string; quality: string }) => {
    addSlot({ root: chord.root, quality: chord.quality });
  };

  const handleAddOther = () => {
    addSlot({ root: otherRoot, quality: otherQuality });
    setShowOtherPicker(false);
  };

  return (
    <div
      className="rounded-xl border px-3 py-3 md:px-4 md:py-4"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
    >
      {/* Key + mode selectors */}
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <div className="flex flex-col gap-1">
          <label
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            Key
          </label>
          <select
            value={progressionKeyRoot ?? 'C'}
            onChange={(e) => handleRootChange(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm font-semibold focus:outline-none transition-all cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-input)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          >
            {ROOT_NOTES.map((note) => (
              <option key={note} value={note}>{note}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            Mode
          </label>
          <select
            value={progressionKeyMode ?? 'major'}
            onChange={(e) => handleModeChange(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm font-semibold focus:outline-none transition-all cursor-pointer min-w-[150px]"
            style={{
              backgroundColor: 'var(--bg-input)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          >
            {scaleCategories.map((cat) => (
              <optgroup key={cat.category} label={cat.category}>
                {cat.scales.map((scale) => (
                  <option key={scale.id} value={scale.id}>{scale.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* Diatonic chord chips */}
      {diatonicChords.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            Add:
          </span>
          {diatonicChords.map((chord) => (
            <button
              key={chord.numeral}
              onClick={() => handleChipClick(chord)}
              className="px-2 py-1 rounded-lg text-xs font-semibold border transition-all hover:opacity-75"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            >
              {chord.numeral} {chord.display}
            </button>
          ))}
          <button
            onClick={() => setShowOtherPicker(!showOtherPicker)}
            className="px-2 py-1 rounded-lg text-xs font-semibold border transition-all"
            style={{
              borderColor: 'var(--accent-500)',
              color: 'var(--accent-600)',
              backgroundColor: 'transparent',
            }}
          >
            + other
          </button>
        </div>
      )}

      {/* Other chord picker (inline) */}
      {showOtherPicker && (
        <div
          className="flex flex-wrap gap-2 items-end mt-2 pt-2 border-t"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <select
            value={otherRoot}
            onChange={(e) => setOtherRoot(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
            style={{
              backgroundColor: 'var(--bg-input)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          >
            {ROOT_NOTES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={otherQuality}
            onChange={(e) => setOtherQuality(e.target.value)}
            className="px-2 py-1 border rounded text-sm min-w-[110px]"
            style={{
              backgroundColor: 'var(--bg-input)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          >
            {OTHER_QUALITIES.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
          <button
            onClick={handleAddOther}
            className="px-3 py-1 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: 'var(--accent-600)', color: 'white' }}
          >
            Add
          </button>
          <button
            onClick={() => setShowOtherPicker(false)}
            className="px-2 py-1 rounded text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
