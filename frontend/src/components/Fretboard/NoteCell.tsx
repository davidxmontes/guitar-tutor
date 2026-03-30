import { getVoicingColor } from '../../constants/colors';

interface NoteCellProps {
  note: string;
  string: number;
  fret: number;
  isOpenString: boolean;
  isInScale?: boolean;
  isRoot?: boolean;
  degreeLabel?: string;
  displayMode?: 'notes' | 'intervals';
  voicingLabel?: string | null;
  isChordRoot?: boolean;
  hasChordOverlay?: boolean;
  onClick?: (e: React.MouseEvent, note: string, string: number, fret: number) => void;
  isClickable?: boolean;
  isHighlighted?: boolean;
  isAgentHighlighted?: boolean;
  hasAgentHighlightLayer?: boolean;
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
  voicingLabel,
  isChordRoot = false,
  hasChordOverlay = false,
  onClick,
  isClickable = false,
  isHighlighted = false,
  isAgentHighlighted = false,
  hasAgentHighlightLayer = false,
  darkMode = false,
}: NoteCellProps) {
  const voicingColor = voicingLabel ? getVoicingColor(voicingLabel) : null;

  const getColorClasses = () => {
    if (isAgentHighlighted) {
      return 'ring-2 ring-violet-400 text-white';
    }

    if (isHighlighted) {
      return 'bg-amber-400 text-gray-900 ring-2 ring-amber-400 animate-pulse';
    }

    if (voicingLabel) {
      if (isChordRoot) {
        return darkMode
          ? 'bg-gray-100 text-gray-900 ring-2'
          : 'bg-gray-900 text-white ring-2';
      }
      return `${voicingColor?.bg ?? ''} text-white`;
    }

    if (isRoot) {
      return darkMode
        ? 'bg-gray-100 text-gray-900'
        : 'bg-gray-900 text-white';
    }

    if (isInScale) {
      return 'text-white';
    }

    return '';
  };

  const getRingStyle = (): React.CSSProperties => {
    if (isAgentHighlighted) {
      return { backgroundColor: '#7c3aed' };
    }
    if (isHighlighted) {
      return {};
    }
    if (voicingLabel && isChordRoot) {
      return { '--tw-ring-color': 'var(--accent-400)' } as React.CSSProperties;
    }
    return {};
  };

  const getScaleNoteStyle = (): React.CSSProperties => {
    if (isAgentHighlighted || isHighlighted) return {};

    if (isInScale && !isRoot && !voicingLabel) {
      if (hasChordOverlay) {
        return {
          // Muted underlay: keep theme green, just reduce intensity when chord tones are present.
          backgroundColor: 'var(--accent-500)',
          opacity: 0.3,
          color: 'white'
        };
      }
      return {
        backgroundColor: 'var(--accent-500)'
      };
    }
    return {};
  };

  const displayText = displayMode === 'intervals' && degreeLabel ? degreeLabel : note;
  const isDimmed = !isAgentHighlighted && !isHighlighted && !isInScale && !isRoot && !voicingLabel;
  const isAgentDimmed = hasAgentHighlightLayer && !isAgentHighlighted && !isDimmed;

  const handleClick = (e: React.MouseEvent) => {
    if (onClick && isClickable) {
      onClick(e, note, string, fret);
    }
  };

  return (
    <div
      className="relative flex items-center justify-center flex-shrink-0 w-11 h-[38px]"
      style={{
        backgroundColor: isOpenString
          ? (darkMode ? 'rgba(71, 85, 105, 0.3)' : '#f9fafb')
          : 'transparent'
      }}
    >
      <div
        className="absolute right-0 top-0 bottom-0"
        style={{
          width: isOpenString ? '6px' : '2px',
          backgroundColor: isOpenString
            ? (darkMode ? '#475569' : '#d1d5db')
            : (darkMode ? '#334155' : '#e5e7eb')
        }}
      />

      <button
        onClick={handleClick}
        className={`
          w-[26px] h-[26px] rounded-full flex items-center justify-center
          text-[11px] font-bold transition-all z-10
          shadow-sm
          ${isClickable ? 'cursor-pointer hover:scale-[1.15] hover:shadow-md hover:z-20' : 'cursor-default'}
          ${getColorClasses()}
          ${isDimmed ? 'opacity-40' : isAgentDimmed ? 'opacity-30' : ''}
        `}
        style={{
          ...getRingStyle(),
          ...getScaleNoteStyle(),
          ...(isDimmed ? {
            backgroundColor: darkMode ? '#475569' : '#e5e7eb',
            color: darkMode ? '#94a3b8' : '#9ca3af'
          } : {})
        }}
        title={`${note} - Fret ${fret}${degreeLabel ? ` (${degreeLabel})` : ''}${isAgentHighlighted ? ' (agent highlight)' : ''}${isHighlighted ? ' (highlighted from tab beat)' : ''}${isClickable ? ' (click for chord)' : ''}`}
      >
        {displayText}
      </button>
    </div>
  );
}
