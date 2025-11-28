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
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
        }`}
      >
        {/* Message content */}
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>

        {/* Show chord choices as clickable pills (assistant only) */}
        {!isUser && message.chordChoices && message.chordChoices.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-2 font-medium">Suggested chords:</p>
            <div className="flex flex-wrap gap-1.5">
              {message.chordChoices.map((chord, idx) => (
                <button
                  key={idx}
                  onClick={() => onChordClick?.(chord, getChordApiRequest(idx))}
                  className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-full 
                             hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 
                             transition-all duration-150 font-medium text-slate-700"
                >
                  {chord}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Show scale as clickable pill (assistant only) */}
        {!isUser && message.scale && (
          <div className="mt-3 pt-2.5 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-2 font-medium">Recommended scale:</p>
            <button
              onClick={() => onScaleClick?.(message.scale!, message.apiRequests?.scale || undefined)}
              className="px-2.5 py-1 text-xs bg-emerald-50 border border-emerald-200 rounded-full 
                         hover:bg-emerald-100 hover:border-emerald-300 transition-all duration-150 
                         text-emerald-700 font-medium"
            >
              {message.scale}
            </button>
          </div>
        )}

        {/* Timestamp */}
        <p className={`text-[11px] mt-2 ${isUser ? 'text-blue-200' : 'text-slate-400'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
