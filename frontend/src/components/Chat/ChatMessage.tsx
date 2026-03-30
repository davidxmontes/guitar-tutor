import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatPill } from './ChatPill'
import type { ChatMessage as ChatMessageType } from '../../types/chat';
import { useAppStore } from '../../stores';

interface ChatMessageProps {
  message: ChatMessageType;
  onChordClick?: (chord: string, apiRequest?: { root: string; quality: string }) => void;
  onScaleClick?: (scale: string, apiRequest?: { root: string; mode: string }) => void;
  darkMode?: boolean;
  // Current app selection state (passed from App)
  selectedChordRoot?: string | null;
  selectedChordQuality?: string | null;
  selectedScaleRoot?: string | null;
  selectedScaleMode?: string | null;
}

export function ChatMessage({ message, onChordClick, onScaleClick, darkMode = false, selectedChordRoot = null, selectedChordQuality = null, selectedScaleRoot = null, selectedScaleMode = null }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const {
    agentHighlightGroups,
    agentHighlightIndex,
    agentHighlightVisible,
    agentHighlightMessageId,
    nextAgentHighlight,
    prevAgentHighlight,
    toggleAgentHighlightVisible,
  } = useAppStore();

  const isActiveHighlightMessage = !isUser && message.id === agentHighlightMessageId && !!agentHighlightGroups;

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
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : (
          <div className="text-sm leading-relaxed chat-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || ''}</ReactMarkdown>
          </div>
        )}

        {/* Show chord choices as clickable pills (assistant only) */}
        {!isUser && !message.interrupted && message.chordChoices && message.chordChoices.length > 0 && (
          <div className="mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border-primary)' }}>
            <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-muted)' }}>Suggested chords:</p>
            <div className="flex flex-wrap gap-1.5">
              {message.chordChoices.map((chord, idx) => {
                const apiReq = getChordApiRequest(idx);
                const selected = apiReq && selectedChordRoot && selectedChordQuality
                  ? apiReq.root === selectedChordRoot && apiReq.quality === selectedChordQuality
                  : false;

                return (
                  <ChatPill
                    key={idx}
                    label={chord}
                    onActivate={() => onChordClick?.(chord, apiReq)}
                    darkMode={darkMode}
                    selected={selected}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Show scale as clickable pill (assistant only) */}
        {!isUser && !message.interrupted && message.scale && (
          <div className="mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border-primary)' }}>
            <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-muted)' }}>Recommended scale:</p>
            <ChatPill
              label={message.scale!}
              onActivate={() => onScaleClick?.(message.scale!, message.apiRequests?.scale || undefined)}
              darkMode={darkMode}
              variant="accent"
              selected={
                message.apiRequests?.scale && selectedScaleRoot && selectedScaleMode
                  ? message.apiRequests!.scale.root === selectedScaleRoot && message.apiRequests!.scale.mode === selectedScaleMode
                  : false
              }
            />
          </div>
        )}

        {/* Agent fretboard highlight controls */}
        {isActiveHighlightMessage && agentHighlightGroups && (
          <div className="mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border-primary)' }}>
            <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-muted)' }}>Fretboard highlight:</p>
            <div className="flex items-center gap-2">
              <button
                onClick={prevAgentHighlight}
                className="w-6 h-6 rounded flex items-center justify-center text-xs transition-colors"
                style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                aria-label="Previous"
              >‹</button>
              <span className="text-xs font-medium flex-1 text-center" style={{ color: 'var(--text-primary)' }}>
                {agentHighlightGroups[agentHighlightIndex]?.name}
                {agentHighlightGroups.length > 1 && (
                  <span className="ml-1" style={{ color: 'var(--text-muted)' }}>
                    ({agentHighlightIndex + 1}/{agentHighlightGroups.length})
                  </span>
                )}
              </span>
              <button
                onClick={nextAgentHighlight}
                className="w-6 h-6 rounded flex items-center justify-center text-xs transition-colors"
                style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                aria-label="Next"
              >›</button>
              <button
                onClick={toggleAgentHighlightVisible}
                className="text-xs px-2 py-0.5 rounded transition-colors"
                style={{
                  backgroundColor: agentHighlightVisible ? 'var(--accent-500)' : 'var(--bg-hover)',
                  color: agentHighlightVisible ? 'white' : 'var(--text-muted)',
                }}
                aria-label={agentHighlightVisible ? 'Hide highlights' : 'Show highlights'}
              >{agentHighlightVisible ? 'Hide' : 'Show'}</button>
            </div>
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
