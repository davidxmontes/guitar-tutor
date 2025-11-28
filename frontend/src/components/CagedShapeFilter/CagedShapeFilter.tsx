import type { CagedShape, CagedShapeName } from '../../types';
import { CAGED_COLORS } from '../../constants/colors';

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
                  ? `${CAGED_COLORS[shape.shape].bg} text-white` 
                  : `bg-gray-100 ${CAGED_COLORS[shape.shape].text} ${CAGED_COLORS[shape.shape].bgHover} border border-gray-200`
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
