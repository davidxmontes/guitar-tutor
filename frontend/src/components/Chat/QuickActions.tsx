interface QuickActionsProps {
  onAction: (prompt: string) => void;
  disabled?: boolean;
}

const QUICK_ACTIONS = [
  { label: "A minor pentatonic", prompt: "Show me the A minor pentatonic scale", icon: "🎸", type: "scale" },
  { label: "G major chords", prompt: "What chords work in G major?", icon: "🎵", type: "chord" },
  { label: "Blues in E", prompt: "Suggest a bluesy chord progression in E", icon: "🎶", type: "progression" },
  { label: "Beginner chords", prompt: "What are the easiest chords for beginners?", icon: "✨", type: "chord" },
];

export function QuickActions({ onAction, disabled = false }: QuickActionsProps) {
  return (
    <div className="p-4 bg-white border-b border-slate-100">
      <div className="text-center mb-4">
        <p className="text-sm text-slate-600 font-medium">How can I help?</p>
        <p className="text-xs text-slate-400 mt-0.5">Ask about scales, chords, or progressions</p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {QUICK_ACTIONS.map((action, idx) => (
          <button
            key={idx}
            onClick={() => onAction(action.prompt)}
            disabled={disabled}
            className={`px-3 py-2 text-xs rounded-lg border shadow-sm
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]
                       ${
                         action.type === 'scale'
                           ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300'
                           : action.type === 'progression'
                           ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 hover:border-purple-300'
                           : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300'
                       }`}
          >
            <span className="mr-1.5">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
