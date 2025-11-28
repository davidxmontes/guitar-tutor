import { useState, useEffect } from 'react';
import type { ScaleCategory } from '../../types';
import { apiClient } from '../../api/client';

const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface ScaleSelectorProps {
  selectedRoot: string;
  selectedMode: string;
  onSelect: (root: string, mode: string) => void;
}

export function ScaleSelector({ selectedRoot, selectedMode, onSelect }: ScaleSelectorProps) {
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
    return <div className="text-gray-400">Loading scales...</div>;
  }

  return (
    <div className="flex items-center gap-6">
      {/* Root Note Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Root Note</label>
        <select
          value={selectedRoot}
          onChange={(e) => handleRootChange(e.target.value)}
          className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer hover:bg-gray-100"
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
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Scale Type</label>
        <select
          value={selectedMode}
          onChange={(e) => handleModeChange(e.target.value)}
          className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer hover:bg-gray-100 min-w-[180px]"
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
      <div className="h-10 w-px bg-gray-200"></div>
      <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
        <span className="text-lg font-bold text-blue-800">
          {selectedRoot} {selectedMode.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
}
