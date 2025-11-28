import type { ChatMessage as ChatMessageType } from '../../types/chat';

interface ChatMessageProps {
  message: ChatMessageType;
  onChordClick?: (chord: string, apiRequest?: { root: string; quality: string }) => void;
  onScaleClick?: (scale: string, apiRequest?: { root: string; mode: string }) => void;
}

export function ChatMessage({ message, onChordClick, onScaleClick }: ChatMessageProps) {
  const isUser = message.role === 'user';

  // Find the API request for a chord by index
  const getChordApiRequest = (index: number) => {
    if (message.apiRequests?.chords && message.apiRequests.chords[index]) {
      return message.apiRequests.chords[index];
    }
    return undefined;
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'bg-blue-500 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-900 rounded-bl-md'
        }`}
      >
        {/* Message content */}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {/* Show chord choices as clickable pills (assistant only) */}
        {!isUser && message.chordChoices && message.chordChoices.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-1.5">Suggested chords:</p>
            <div className="flex flex-wrap gap-1.5">
              {message.chordChoices.map((chord, idx) => (
                <button
                  key={idx}
                  onClick={() => onChordClick?.(chord, getChordApiRequest(idx))}
                  className="px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-full 
                             hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm"
                >
                  {chord}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Show scale as clickable pill (assistant only) */}
        {!isUser && message.scale && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-1.5">Recommended scale:</p>
            <button
              onClick={() => onScaleClick?.(message.scale!, message.apiRequests?.scale || undefined)}
              className="px-2.5 py-1 text-xs bg-white border border-emerald-300 rounded-full 
                         hover:bg-emerald-50 hover:border-emerald-400 transition-colors text-emerald-700"
            >
              {message.scale}
            </button>
          </div>
        )}

        {/* Timestamp */}
        <p className={`text-xs mt-1.5 ${isUser ? 'text-blue-100' : 'text-gray-400'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
