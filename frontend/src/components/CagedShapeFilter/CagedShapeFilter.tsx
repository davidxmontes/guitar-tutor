import type { CagedShape, CagedShapeName } from '../../types';

// CAGED shape color mapping
const SHAPE_COLORS: Record<CagedShapeName, string> = {
  C: 'bg-orange-500',
  A: 'bg-yellow-500',
  G: 'bg-green-500',
  E: 'bg-blue-500',
  D: 'bg-purple-500',
};

const SHAPE_BORDER_COLORS: Record<CagedShapeName, string> = {
  C: 'border-orange-500',
  A: 'border-yellow-500',
  G: 'border-green-500',
  E: 'border-blue-500',
  D: 'border-purple-500',
};

const SHAPE_TEXT_COLORS: Record<CagedShapeName, string> = {
  C: 'text-orange-500',
  A: 'text-yellow-500',
  G: 'text-green-500',
  E: 'text-blue-500',
  D: 'text-purple-500',
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
  const noneActive = activeShapes.length === 0;

  // Get active shape info for the indicator
  const activeShapeInfo = shapes.filter(s => activeShapes.includes(s.shape));

  return (
    <div className="flex flex-col gap-3 p-4 bg-gray-800 rounded-lg">
      {/* Top row: buttons */}
      <div className="flex items-center gap-2">
        <span className="text-gray-400 text-sm mr-2">CAGED Shapes:</span>
        
        {/* All button */}
        <button
          onClick={onShowAll}
          className={`
            px-3 py-1.5 rounded text-sm font-medium transition-all
            ${allActive 
              ? 'bg-white text-gray-900' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }
          `}
        >
          All
        </button>
        
        {/* Individual shape buttons */}
        {shapes.map((shape) => {
          const isActive = activeShapes.includes(shape.shape);
          return (
            <button
              key={shape.shape}
              onClick={() => onToggleShape(shape.shape)}
              className={`
                w-9 h-9 rounded-full text-sm font-bold transition-all
                flex items-center justify-center border-2
                ${isActive 
                  ? `${SHAPE_COLORS[shape.shape]} text-white border-transparent shadow-lg scale-110` 
                  : `bg-gray-900 ${SHAPE_TEXT_COLORS[shape.shape]} ${SHAPE_BORDER_COLORS[shape.shape]} hover:bg-gray-700`
                }
              `}
              title={`${shape.shape} Shape (Fret ${shape.base_fret})`}
            >
              {shape.shape}
            </button>
          );
        })}
      </div>

      {/* Current shape indicator */}
      {activeShapeInfo.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Showing:</span>
          <div className="flex items-center gap-2">
            {activeShapeInfo.map((shape, index) => (
              <span key={shape.shape} className="flex items-center gap-1">
                <span className={`font-semibold ${SHAPE_TEXT_COLORS[shape.shape]}`}>
                  {shape.shape} Shape
                </span>
                <span className="text-gray-500">
                  (frets {shape.min_fret}-{shape.max_fret})
                </span>
                {index < activeShapeInfo.length - 1 && (
                  <span className="text-gray-600 mx-1">•</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* No shapes selected hint */}
      {noneActive && (
        <div className="text-sm text-gray-500 italic">
          Click a shape button to display it on the fretboard
        </div>
      )}
    </div>
  );
}
