import type { ChatMessage as ChatMessageType } from '../../types/chat';

interface ChatMessageProps {
  message: ChatMessageType;
  onChordClick?: (chord: string, apiRequest?: { root: string; quality: string }) => void;
  onScaleClick?: (scale: string, apiRequest?: { root: string; mode: string }) => void;
  darkMode?: boolean;
}

export function ChatMessage({ message, onChordClick, onScaleClick, darkMode = false }: ChatMessageProps) {
  const isUser = message.role === 'user';

  // Find the API request for a chord by index
  const getChordApiRequest = (index: number) => {
    if (message.apiRequests?.chords && message.apiRequests.chords[index]) {
      return message.apiRequests.chords[index];
    }
    return undefined;
  };

  const bubbleClassName = `chat-bubble ${isUser ? 'user' : 'assistant'}`;

  const timestampColor = isUser
    ? 'rgba(255,255,255,0.9)'
    : 'var(--text-muted)';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={bubbleClassName}>
        {/* Message content */}
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>

        {/* Show chord choices as clickable pills (assistant only) */}
        {!isUser && message.chordChoices && message.chordChoices.length > 0 && (
          <div className="mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border-primary)' }}>
            <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-muted)' }}>Suggested chords:</p>
            <div className="flex flex-wrap gap-1.5">
              {message.chordChoices.map((chord, idx) => (
                <button
                  key={idx}
                  onClick={() => onChordClick?.(chord, getChordApiRequest(idx))}
                  className="px-2.5 py-1 text-xs rounded-full border
                             hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 
                             dark:hover:bg-blue-900/30 dark:hover:border-blue-600 dark:hover:text-blue-400
                             transition-all duration-150 font-medium"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  {chord}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Show scale as clickable pill (assistant only) */}
        {!isUser && message.scale && (
          <div className="mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border-primary)' }}>
            <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-muted)' }}>Recommended scale:</p>
            <button
              onClick={() => onScaleClick?.(message.scale!, message.apiRequests?.scale || undefined)}
              className="px-2.5 py-1 text-xs rounded-full border transition-all duration-150 font-medium"
              style={{
                backgroundColor: darkMode ? 'var(--accent-900)' : 'var(--accent-50)',
                borderColor: darkMode ? 'var(--accent-700)' : 'var(--accent-300)',
                color: darkMode ? 'var(--accent-300)' : 'var(--accent-700)'
              }}
            >
              {message.scale}
            </button>
          </div>
        )}

        {/* Timestamp */}
        <p className="text-[11px] mt-2" style={{ color: timestampColor }}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
