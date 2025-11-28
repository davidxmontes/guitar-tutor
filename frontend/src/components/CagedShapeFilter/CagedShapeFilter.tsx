import type { CagedShape, CagedShapeName } from '../../types';

// CAGED shape color mapping
const SHAPE_COLORS: Record<CagedShapeName, string> = {
  C: 'bg-orange-500',
  A: 'bg-yellow-500',
  G: 'bg-green-500',
  E: 'bg-blue-500',
  D: 'bg-purple-500',
};

const SHAPE_HOVER_COLORS: Record<CagedShapeName, string> = {
  C: 'hover:bg-orange-100',
  A: 'hover:bg-yellow-100',
  G: 'hover:bg-green-100',
  E: 'hover:bg-blue-100',
  D: 'hover:bg-purple-100',
};

const SHAPE_TEXT_COLORS: Record<CagedShapeName, string> = {
  C: 'text-orange-600',
  A: 'text-yellow-600',
  G: 'text-green-600',
  E: 'text-blue-600',
  D: 'text-purple-600',
};

interface CagedShapeFilterProps {
  shapes: CagedShape[];
  activeShapes: CagedShapeName[];
  onToggleShape: (shape: CagedShapeName) => void;
  onShowAll: () => void;
}

export function CagedShapeFilter({ 
  shapes, 
  activeShapes, 
  onToggleShape, 
  onShowAll 
}: CagedShapeFilterProps) {
  const allActive = activeShapes.length === shapes.length;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Show Shapes</label>
      <div className="flex items-center gap-2">
        {/* Individual shape buttons */}
        {shapes.map((shape) => {
          const isActive = activeShapes.includes(shape.shape);
          return (
            <button
              key={shape.shape}
              onClick={() => onToggleShape(shape.shape)}
              className={`
                w-8 h-8 rounded-lg text-xs font-bold transition-all
                flex items-center justify-center shadow-sm
                hover:shadow-md hover:scale-105
                ${isActive 
                  ? `${SHAPE_COLORS[shape.shape]} text-white` 
                  : `bg-gray-100 ${SHAPE_TEXT_COLORS[shape.shape]} ${SHAPE_HOVER_COLORS[shape.shape]} border border-gray-200`
                }
              `}
              title={`${shape.shape} Shape (Frets ${shape.min_fret}-${shape.max_fret})`}
            >
              {shape.shape}
            </button>
          );
        })}
        
        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 mx-1"></div>
        
        {/* All button */}
        <button
          onClick={onShowAll}
          className={`
            px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm
            hover:shadow-md
            ${allActive 
              ? 'bg-gray-800 text-white' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
            }
          `}
        >
          All
        </button>
      </div>
    </div>
  );
}
