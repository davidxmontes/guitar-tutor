import { useState, useEffect } from 'react';

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const CHORD_QUALITIES = [
  // Triads
  { value: 'major', label: 'Major', suffix: '', category: 'Triads' },
  { value: 'minor', label: 'Minor', suffix: 'm', category: 'Triads' },
  { value: 'diminished', label: 'Dim', suffix: '°', category: 'Triads' },
  { value: 'augmented', label: 'Aug', suffix: '+', category: 'Triads' },
  // Suspended
  { value: 'sus2', label: 'Sus2', suffix: 'sus2', category: 'Suspended' },
  { value: 'sus4', label: 'Sus4', suffix: 'sus4', category: 'Suspended' },
  // 7th chords
  { value: 'dominant7', label: '7', suffix: '7', category: '7th' },
  { value: 'major7', label: 'Maj7', suffix: 'maj7', category: '7th' },
  { value: 'minor7', label: 'm7', suffix: 'm7', category: '7th' },
  { value: 'dim7', label: 'Dim7', suffix: '°7', category: '7th' },
  { value: 'm7b5', label: 'm7♭5', suffix: 'ø7', category: '7th' },
  { value: '7sus4', label: '7sus4', suffix: '7sus4', category: '7th' },
  // 6th chords
  { value: '6', label: '6', suffix: '6', category: '6th' },
  { value: 'm6', label: 'm6', suffix: 'm6', category: '6th' },
  // Extended
  { value: 'add9', label: 'Add9', suffix: 'add9', category: 'Extended' },
  { value: '9', label: '9', suffix: '9', category: 'Extended' },
  { value: 'm9', label: 'm9', suffix: 'm9', category: 'Extended' },
  { value: 'maj9', label: 'Maj9', suffix: 'maj9', category: 'Extended' },
];

interface ChordSelectorProps {
  selectedRoot: string | null;
  selectedQuality: string | null;
  onSelect: (root: string, quality: string) => void;
  darkMode?: boolean;
}

export function ChordSelector({ selectedRoot, selectedQuality, onSelect, darkMode = false }: ChordSelectorProps) {
  const [root, setRoot] = useState<string>(selectedRoot || 'C');
  const [quality, setQuality] = useState<string>(selectedQuality || 'major');

  // Update local state when props change
  useEffect(() => {
    if (selectedRoot) setRoot(selectedRoot);
    if (selectedQuality) setQuality(selectedQuality);
  }, [selectedRoot, selectedQuality]);

  const handleRootChange = (newRoot: string) => {
    setRoot(newRoot);
    onSelect(newRoot, quality);
  };

  const handleQualityChange = (newQuality: string) => {
    setQuality(newQuality);
    onSelect(root, newQuality);
  };

  // Get display name for current chord
  const qualityInfo = CHORD_QUALITIES.find(q => q.value === quality);
  const chordName = `${root}${qualityInfo?.suffix || ''}`;

  // Group qualities by category
  const categories = ['Triads', 'Suspended', '7th', '6th', 'Extended'];

  return (
    <div className="flex flex-wrap items-center gap-3 md:gap-6">
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

      {/* Quality selector with categories */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] md:text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Type</label>
        <select
          value={quality}
          onChange={(e) => handleQualityChange(e.target.value)}
          className="px-3 md:px-4 py-2 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 transition-all cursor-pointer touch-target"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
            '--tw-ring-color': 'var(--accent-500)'
          } as React.CSSProperties}
        >
          {categories.map((category) => (
            <optgroup key={category} label={category}>
              {CHORD_QUALITIES.filter(q => q.category === category).map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </optgroup>
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
