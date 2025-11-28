import { useState, useEffect } from 'react';
import type { ScaleCategory } from '../../types';
import { apiClient } from '../../api/client';

const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

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
    <div className="flex items-center gap-6">
      {/* Root Note Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Root Note</label>
        <select
          value={selectedRoot}
          onChange={(e) => handleRootChange(e.target.value)}
          className="px-4 py-2 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)'
          }}
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
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Scale Type</label>
        <select
          value={selectedMode}
          onChange={(e) => handleModeChange(e.target.value)}
          className="px-4 py-2 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer min-w-[180px]"
          style={{
            backgroundColor: 'var(--bg-input)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)'
          }}
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

      {/* Current Selection Display */}
      <div className="h-10 w-px" style={{ backgroundColor: 'var(--border-primary)' }}></div>
      <div 
        className="px-4 py-2 rounded-lg border"
        style={{
          backgroundColor: darkMode ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
          borderColor: darkMode ? 'rgba(59, 130, 246, 0.4)' : '#bfdbfe'
        }}
      >
        <span 
          className="text-lg font-bold"
          style={{ color: darkMode ? '#93c5fd' : '#1e40af' }}
        >
          {selectedRoot} {selectedMode.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
}
