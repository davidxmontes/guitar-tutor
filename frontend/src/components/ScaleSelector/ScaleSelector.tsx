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
    <div className="flex items-center gap-6">
      {/* Root Note Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Root Note</label>
        <select
          value={root}
          onChange={(e) => setRoot(e.target.value)}
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
          value={mode}
          onChange={(e) => setMode(e.target.value)}
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

      {/* Apply Button */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-transparent select-none">Action</label>
        <button
          onClick={handleApply}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
            <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
          </svg>
          Show Scale
        </button>
      </div>

      {/* Current Selection Display */}
      {selectedRoot && selectedMode && (
        <>
          <div className="h-10 w-px bg-gray-200"></div>
          <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-lg font-bold text-blue-800">
              {selectedRoot} {selectedMode.replace(/_/g, ' ')}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
