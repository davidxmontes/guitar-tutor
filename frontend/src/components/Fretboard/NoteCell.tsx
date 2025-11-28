import type { CagedShapeName } from '../../types';

// CAGED shape color classes
const CAGED_BG_COLORS: Record<CagedShapeName, string> = {
  C: 'bg-orange-500',
  A: 'bg-yellow-500',
  G: 'bg-green-500',
  E: 'bg-blue-500',
  D: 'bg-purple-500',
};

interface NoteCellProps {
  note: string;
  string: number;
  fret: number;
  isOpenString: boolean;
  isInScale?: boolean;
  isRoot?: boolean;
  degreeLabel?: string;
  displayMode?: 'notes' | 'intervals';
  cagedShape?: CagedShapeName | null;
  isChordRoot?: boolean;
  onClick?: (e: React.MouseEvent, note: string, string: number, fret: number) => void;
  isClickable?: boolean;
}

export function NoteCell({ 
  note, 
  string,
  fret, 
  isOpenString,
  isInScale = false,
  isRoot = false,
  degreeLabel,
  displayMode = 'notes',
  cagedShape,
  isChordRoot = false,
  onClick,
  isClickable = false,
}: NoteCellProps) {
  // Determine styling based on context
  const getColorClasses = () => {
    // Chord mode - CAGED shape coloring takes priority
    if (cagedShape) {
      if (isChordRoot) {
        return 'bg-gray-900 text-white';
      }
      return `${CAGED_BG_COLORS[cagedShape]} text-white`;
    }
    
    // Scale mode
    if (isRoot) {
      return 'bg-gray-900 text-white';
    }
    if (isInScale) {
      return 'bg-blue-500 text-white';
    }
    return 'bg-gray-200 text-gray-400';
  };

  // Determine what to display in the circle
  const displayText = displayMode === 'intervals' && degreeLabel ? degreeLabel : note;
  
  // Determine if this note should be dimmed
  const isDimmed = !isInScale && !isRoot && !cagedShape;
  
  // Handle click
  const handleClick = (e: React.MouseEvent) => {
    if (onClick && isClickable) {
      onClick(e, note, string, fret);
    }
  };

  return (
    <div className="flex items-center justify-center p-0.5">
      <button
        onClick={handleClick}
        className={`
          w-9 h-9 rounded-full flex items-center justify-center
          text-xs font-medium transition-all
          ${isClickable ? 'cursor-pointer hover:scale-110 hover:shadow-md hover:ring-2 hover:ring-offset-1 hover:ring-blue-400' : 'cursor-default'}
          ${getColorClasses()}
          ${isOpenString ? 'ring-2 ring-gray-400' : ''}
          ${isDimmed ? 'opacity-40' : ''}
        `}
        title={`${note} - Fret ${fret}${degreeLabel ? ` (${degreeLabel})` : ''}${isClickable ? ' (click for chord)' : ''}`}
      >
        {displayText}
      </button>
    </div>
  );
}
