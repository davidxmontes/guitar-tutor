interface QuickActionsProps {
  onAction: (prompt: string) => void;
  disabled?: boolean;
  darkMode?: boolean;
}

const QUICK_ACTIONS = [
  { label: "A minor pentatonic", prompt: "Show me the A minor pentatonic scale", icon: "🎸", type: "scale" },
  { label: "G major chords", prompt: "What chords work in G major?", icon: "🎵", type: "chord" },
  { label: "Blues in E", prompt: "Suggest a bluesy chord progression in E", icon: "🎶", type: "progression" },
  { label: "Beginner chords", prompt: "What are the easiest chords for beginners?", icon: "✨", type: "chord" },
];

export function QuickActions({ onAction, disabled = false, darkMode: _darkMode = false }: QuickActionsProps) {
  // Check if we're in dark mode by looking at the document class
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  
  const getButtonStyles = (type: string) => {
    if (type === 'scale') {
      return {
        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)',
        border: `1px solid ${isDark ? 'rgba(52, 211, 153, 0.4)' : 'rgba(16, 185, 129, 0.3)'}`,
        color: isDark ? '#6ee7b7' : '#059669'
      };
    } else if (type === 'progression') {
      return {
        backgroundColor: isDark ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)',
        border: `1px solid ${isDark ? 'rgba(167, 139, 250, 0.4)' : 'rgba(139, 92, 246, 0.3)'}`,
        color: isDark ? '#c4b5fd' : '#7c3aed'
      };
    } else {
      // Chord type - uses accent color (pink/rose)
      return {
        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
        border: `1px solid ${isDark ? 'rgba(96, 165, 250, 0.4)' : 'rgba(59, 130, 246, 0.3)'}`,
        color: isDark ? '#93c5fd' : '#2563eb'
      };
    }
  };
  
  return (
    <div 
      className="p-4 border-b"
      style={{ 
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--border-primary)'
      }}
    >
      <div className="text-center mb-4">
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>How can I help?</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Ask about scales, chords, or progressions</p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {QUICK_ACTIONS.map((action, idx) => (
          <button
            key={idx}
            onClick={() => onAction(action.prompt)}
            disabled={disabled}
            className={`px-3 py-2 text-xs rounded-lg shadow-sm
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]`}
            style={getButtonStyles(action.type)}
          >
            <span className="mr-1.5">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
