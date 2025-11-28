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
        return 'bg-gray-900 text-white ring-2 ring-blue-400';
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
    <div 
      className={`
        relative flex items-center justify-center
        w-11 h-[38px]
        ${isOpenString ? 'border-r-[6px] border-gray-300 bg-gray-50' : 'border-r-2 border-gray-200'}
      `}
    >
      {/* Note circle */}
      <button
        onClick={handleClick}
        className={`
          w-[26px] h-[26px] rounded-full flex items-center justify-center
          text-[11px] font-bold transition-all z-10
          shadow-sm
          ${isClickable ? 'cursor-pointer hover:scale-[1.15] hover:shadow-md hover:z-20' : 'cursor-default'}
          ${getColorClasses()}
          ${isDimmed ? 'opacity-40' : ''}
        `}
        title={`${note} - Fret ${fret}${degreeLabel ? ` (${degreeLabel})` : ''}${isClickable ? ' (click for chord)' : ''}`}
      >
        {displayText}
      </button>
    </div>
  );
}
