import { useEffect, useMemo, useState } from 'react';

const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

type BaseQualityValue = 'major' | 'minor' | 'diminished' | 'augmented' | 'sus2' | 'sus4';
type ExtensionValue = 'none' | '6' | '7' | 'dom7' | 'add9' | '9' | 'maj9' | 'm7b5';

interface ExtensionOption {
  value: ExtensionValue;
  label: string;
  quality: string;
  suffix: string;
}

interface BaseQualityOption {
  value: BaseQualityValue;
  label: string;
  extensions: ExtensionOption[];
}

const BASE_QUALITY_OPTIONS: BaseQualityOption[] = [
  {
    value: 'major',
    label: 'Major',
    extensions: [
      { value: 'none', label: 'None', quality: 'major', suffix: '' },
      { value: '6', label: '6', quality: '6', suffix: '6' },
      { value: '7', label: '7 (Major 7th)', quality: 'major7', suffix: 'maj7' },
      { value: 'dom7', label: 'b7 (Dominant)', quality: 'dominant7', suffix: '7' },
      { value: 'add9', label: 'Add9', quality: 'add9', suffix: 'add9' },
      { value: '9', label: '9', quality: '9', suffix: '9' },
      { value: 'maj9', label: 'Maj9', quality: 'maj9', suffix: 'maj9' },
    ],
  },
  {
    value: 'minor',
    label: 'Minor',
    extensions: [
      { value: 'none', label: 'None', quality: 'minor', suffix: 'm' },
      { value: '6', label: '6', quality: 'm6', suffix: 'm6' },
      { value: '7', label: '7', quality: 'minor7', suffix: 'm7' },
      { value: 'add9', label: 'Add9', quality: 'madd9', suffix: 'm(add9)' },
      { value: '9', label: '9', quality: 'm9', suffix: 'm9' },
    ],
  },
  {
    value: 'diminished',
    label: 'Diminished',
    extensions: [
      { value: 'none', label: 'None', quality: 'diminished', suffix: '°' },
      { value: '7', label: 'Dim7', quality: 'dim7', suffix: '°7' },
      { value: 'm7b5', label: 'm7b5 (Half-dim)', quality: 'm7b5', suffix: 'ø7' },
    ],
  },
  {
    value: 'augmented',
    label: 'Augmented',
    extensions: [{ value: 'none', label: 'None', quality: 'augmented', suffix: '+' }],
  },
  {
    value: 'sus2',
    label: 'Sus2',
    extensions: [{ value: 'none', label: 'None', quality: 'sus2', suffix: 'sus2' }],
  },
  {
    value: 'sus4',
    label: 'Sus4',
    extensions: [
      { value: 'none', label: 'None', quality: 'sus4', suffix: 'sus4' },
      { value: '7', label: '7', quality: '7sus4', suffix: '7sus4' },
    ],
  },
];

const DEFAULT_SELECTION = { base: 'major' as BaseQualityValue, extension: 'none' as ExtensionValue };

function getSelectionForQuality(quality: string | null | undefined): { base: BaseQualityValue; extension: ExtensionValue } {
  if (!quality) return DEFAULT_SELECTION;

  for (const base of BASE_QUALITY_OPTIONS) {
    for (const ext of base.extensions) {
      if (ext.quality === quality) {
        return { base: base.value, extension: ext.value };
      }
    }
  }

  return DEFAULT_SELECTION;
}

interface ChordSelectorProps {
  selectedRoot: string | null;
  selectedQuality: string | null;
  onSelect: (root: string, quality: string) => void;
  darkMode?: boolean;
}

export function ChordSelector({ selectedRoot, selectedQuality, onSelect, darkMode = false }: ChordSelectorProps) {
  const initialSelection = getSelectionForQuality(selectedQuality);

  const [root, setRoot] = useState<string>(selectedRoot || 'C');
  const [baseQuality, setBaseQuality] = useState<BaseQualityValue>(initialSelection.base);
  const [extension, setExtension] = useState<ExtensionValue>(initialSelection.extension);

  const extensionOptions = useMemo(
    () => BASE_QUALITY_OPTIONS.find((b) => b.value === baseQuality)?.extensions ?? [],
    [baseQuality]
  );

  const selectedExtensionOption = extensionOptions.find((opt) => opt.value === extension) ?? extensionOptions[0];
  const selectedQualityValue = selectedExtensionOption?.quality ?? 'major';

  useEffect(() => {
    if (selectedRoot) setRoot(selectedRoot);
    if (selectedQuality) {
      const selection = getSelectionForQuality(selectedQuality);
      setBaseQuality(selection.base);
      setExtension(selection.extension);
    }
  }, [selectedRoot, selectedQuality]);

  const handleRootChange = (newRoot: string) => {
    setRoot(newRoot);
    onSelect(newRoot, selectedQualityValue);
  };

  const handleBaseQualityChange = (newBase: BaseQualityValue) => {
    const options = BASE_QUALITY_OPTIONS.find((b) => b.value === newBase)?.extensions ?? [];
    const nextExtension = options.some((opt) => opt.value === extension)
      ? extension
      : options[0]?.value ?? 'none';

    const nextQuality = options.find((opt) => opt.value === nextExtension)?.quality ?? 'major';

    setBaseQuality(newBase);
    setExtension(nextExtension);
    onSelect(root, nextQuality);
  };

  const handleExtensionChange = (newExtension: ExtensionValue) => {
    const nextQuality = extensionOptions.find((opt) => opt.value === newExtension)?.quality;
    if (!nextQuality) return;

    setExtension(newExtension);
    onSelect(root, nextQuality);
  };

  const chordName = `${root}${selectedExtensionOption?.suffix ?? ''}`;

  return (
    <div className="flex flex-wrap items-center gap-3 md:gap-4">
      {/* Root selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] md:text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Root</label>
        <select
          value={root}
          onChange={(e) => handleRootChange(e.target.value)}
          className="px-3 md:px-4 py-2 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 transition-all cursor-pointer touch-target"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
            '--tw-ring-color': 'var(--accent-500)'
          } as React.CSSProperties}
        >
          {ROOTS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Base quality selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] md:text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Quality</label>
        <select
          value={baseQuality}
          onChange={(e) => handleBaseQualityChange(e.target.value as BaseQualityValue)}
          className="px-3 md:px-4 py-2 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 transition-all cursor-pointer touch-target"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
            '--tw-ring-color': 'var(--accent-500)'
          } as React.CSSProperties}
        >
          {BASE_QUALITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {/* Extension selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] md:text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Extension</label>
        <select
          value={extension}
          onChange={(e) => handleExtensionChange(e.target.value as ExtensionValue)}
          disabled={extensionOptions.length <= 1}
          className="px-3 md:px-4 py-2 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 transition-all cursor-pointer touch-target disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
            '--tw-ring-color': 'var(--accent-500)'
          } as React.CSSProperties}
        >
          {extensionOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {/* Current chord display - hide on mobile */}
      <div className="hidden lg:block h-10 w-px" style={{ backgroundColor: 'var(--border-primary)' }}></div>
      <div
        className="hidden lg:block px-4 py-2 rounded-lg border"
        style={{
          backgroundColor: darkMode ? 'var(--accent-900)' : 'var(--accent-50)',
          borderColor: darkMode ? 'var(--accent-700)' : 'var(--accent-200)'
        }}
      >
        <span
          className="text-lg font-bold"
          style={{ color: darkMode ? 'var(--accent-300)' : 'var(--accent-700)' }}
        >
          {chordName}
        </span>
      </div>
    </div>
  );
}
