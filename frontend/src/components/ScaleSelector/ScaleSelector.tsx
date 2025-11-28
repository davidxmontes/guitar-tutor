import { useState, useEffect } from 'react';
import type { ScaleCategory } from '../../types';
import { apiClient } from '../../api/client';

const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface ScaleSelectorProps {
  selectedRoot: string | null;
  selectedMode: string | null;
  onSelect: (root: string, mode: string) => void;
}

export function ScaleSelector({ selectedRoot, selectedMode, onSelect }: ScaleSelectorProps) {
  const [scaleCategories, setScaleCategories] = useState<ScaleCategory[]>([]);
  const [root, setRoot] = useState<string>(selectedRoot || 'C');
  const [mode, setMode] = useState<string>(selectedMode || 'major');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getScalesList().then((data) => {
      setScaleCategories(data.scales);
      setLoading(false);
    });
  }, []);

  const handleApply = () => {
    onSelect(root, mode);
  };

  if (loading) {
    return <div className="text-gray-400">Loading scales...</div>;
  }

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-lg">
      {/* Root Note Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400 uppercase tracking-wide">Root</label>
        <select
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
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
        <label className="text-xs text-gray-400 uppercase tracking-wide">Scale</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none min-w-[180px]"
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

      {/* Apply Button */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-transparent">Apply</label>
        <button
          onClick={handleApply}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors"
        >
          Show Scale
        </button>
      </div>

      {/* Current Selection Display */}
      {selectedRoot && selectedMode && (
        <div className="ml-4 px-4 py-2 bg-gray-700 rounded">
          <span className="text-white font-semibold">
            {selectedRoot} {selectedMode.replace(/_/g, ' ')}
          </span>
        </div>
      )}
    </div>
  );
}
