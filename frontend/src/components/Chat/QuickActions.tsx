interface QuickActionsProps {
  onAction: (prompt: string) => void;
  disabled?: boolean;
}

const QUICK_ACTIONS = [
  { label: "A minor pentatonic", prompt: "Show me the A minor pentatonic scale" },
  { label: "G major chords", prompt: "What chords work in G major?" },
  { label: "Blues in E", prompt: "Suggest a bluesy chord progression in E" },
  { label: "Beginner chords", prompt: "What are the easiest chords for beginners?" },
];

export function QuickActions({ onAction, disabled = false }: QuickActionsProps) {
  return (
    <div className="p-3 border-b border-gray-100">
      <p className="text-xs text-gray-500 mb-2">Try asking:</p>
      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action, idx) => (
          <button
            key={idx}
            onClick={() => onAction(action.prompt)}
            disabled={disabled}
            className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg
                       hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors text-gray-700 shadow-sm"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
