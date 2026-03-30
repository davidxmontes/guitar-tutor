import { useState, useEffect } from 'react';
import type { ScaleCategory } from '../../types';
import { apiClient } from '../../api/client';

const ROOT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

interface ScaleSelectorProps {
  selectedRoot: string;
  selectedMode: string;
  onSelect: (root: string, mode: string) => void;
  darkMode?: boolean;
}

export function ScaleSelector({ selectedRoot, selectedMode, onSelect, darkMode = false }: ScaleSelectorProps) {
  const [scaleCategories, setScaleCategories] = useState<ScaleCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getScalesList().then((data) => {
      setScaleCategories(data.scales);
      setLoading(false);
    });
  }, []);

  const handleRootChange = (newRoot: string) => {
    onSelect(newRoot, selectedMode);
  };

  const handleModeChange = (newMode: string) => {
    onSelect(selectedRoot, newMode);
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading scales...</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 md:gap-6">
      {/* Root Note Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] md:text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Root</label>
        <select
          value={selectedRoot}
          onChange={(e) => handleRootChange(e.target.value)}
          className="px-3 md:px-4 py-2 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 transition-all cursor-pointer touch-target"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
            '--tw-ring-color': 'var(--accent-500)'
          } as React.CSSProperties}
        >
          {ROOT_NOTES.map((note) => (
            <option key={note} value={note}>
              {note}
            </option>
          ))}
        </select>
      </div>

      {/* Mode Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] md:text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Scale</label>
        <select
          value={selectedMode}
          onChange={(e) => handleModeChange(e.target.value)}
          className="px-3 md:px-4 py-2 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 transition-all cursor-pointer min-w-[140px] md:min-w-[180px] touch-target"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
            '--tw-ring-color': 'var(--accent-500)'
          } as React.CSSProperties}
        >
          {scaleCategories.map((category) => (
            <optgroup key={category.category} label={category.category}>
              {category.scales.map((scale) => (
                <option key={scale.id} value={scale.id}>
                  {scale.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Current Selection Display - hide on mobile */}
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
          {selectedRoot} {selectedMode.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
}
