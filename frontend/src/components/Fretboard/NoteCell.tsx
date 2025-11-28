import type { CagedShapeName } from '../../types';
import { CAGED_COLORS } from '../../constants/colors';

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
  darkMode?: boolean;
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
  darkMode = false,
}: NoteCellProps) {
  // Determine styling based on context
  const getColorClasses = () => {
    // Chord mode - CAGED shape coloring takes priority
    if (cagedShape) {
      if (isChordRoot) {
        return darkMode 
          ? 'bg-gray-100 text-gray-900 ring-2'
          : 'bg-gray-900 text-white ring-2';
      }
      return `${CAGED_COLORS[cagedShape].bg} text-white`;
    }
    
    // Scale mode
    if (isRoot) {
      return darkMode 
        ? 'bg-gray-100 text-gray-900'
        : 'bg-gray-900 text-white';
    }
    if (isInScale) {
      return 'text-white';  // Background applied via inline style
    }
    return '';  // Will use inline styles for dimmed notes
  };
  
  // Get ring color for chord root
  const getRingStyle = (): React.CSSProperties => {
    if (cagedShape && isChordRoot) {
      return { '--tw-ring-color': 'var(--accent-400)' } as React.CSSProperties;
    }
    return {};
  };
  
  // Get background for scale notes
  const getScaleNoteStyle = (): React.CSSProperties => {
    if (isInScale && !isRoot && !cagedShape) {
      return { backgroundColor: 'var(--accent-500)' };
    }
    return {};
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
      `}
      style={{
        borderRight: isOpenString 
          ? `6px solid ${darkMode ? '#475569' : '#d1d5db'}` 
          : `2px solid ${darkMode ? '#334155' : '#e5e7eb'}`,
        backgroundColor: isOpenString 
          ? (darkMode ? 'rgba(71, 85, 105, 0.3)' : '#f9fafb') 
          : 'transparent'
      }}
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
        style={{
          ...getRingStyle(),
          ...getScaleNoteStyle(),
          ...(isDimmed ? {
            backgroundColor: darkMode ? '#475569' : '#e5e7eb',
            color: darkMode ? '#94a3b8' : '#9ca3af'
          } : {})
        }}
        title={`${note} - Fret ${fret}${degreeLabel ? ` (${degreeLabel})` : ''}${isClickable ? ' (click for chord)' : ''}`}
      >
        {displayText}
      </button>
    </div>
  );
}
