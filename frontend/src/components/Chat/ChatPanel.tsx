import { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { QuickActions } from './QuickActions';
import type { ChatMessage as ChatMessageType } from '../../types/chat';

interface ChatPanelProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  streamingStatus?: string | null;
  onSendMessage: (message: string) => void;
  onChordClick?: (chord: string, apiRequest?: { root: string; quality: string }) => void;
  onScaleClick?: (scale: string, apiRequest?: { root: string; mode: string }) => void;
  onReset?: () => void;
  darkMode?: boolean;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  selectedChordRoot?: string | null;
  selectedChordQuality?: string | null;
  selectedScaleRoot?: string | null;
  selectedScaleMode?: string | null;
  isMobile?: boolean;
}

export function ChatPanel({
  messages,
  isLoading,
  streamingStatus,
  onSendMessage,
  onChordClick,
  onScaleClick,
  onReset,
  darkMode = false,
  isCollapsed = false,
  onToggleCollapsed,
  selectedChordRoot = null,
  selectedChordQuality = null,
  selectedScaleRoot = null,
  selectedScaleMode = null,
  isMobile = false,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Collapsed / minimized UI variant
  if (isCollapsed) {
    return (
      <div
        data-agent-highlight-scope="chat"
        className="flex flex-col h-full font-sans border-r items-center justify-start py-2"
        style={{
          backgroundColor: 'var(--chat-bg)',
          borderColor: 'var(--border-primary)'
        }}
      >
        <button
          onClick={onToggleCollapsed}
          aria-label="Open chat"
          title="Open chat"
          className="p-2 rounded-md transition-transform hover:scale-105"
          style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6" style={{ transform: 'rotate(0deg)' }}>
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div 
      data-agent-highlight-scope="chat"
      className="flex flex-col h-full font-sans border-r"
      style={{ 
        backgroundColor: 'var(--chat-bg)',
        borderColor: 'var(--border-primary)'
      }}
    >
      {/* Header */}
      <div 
        className="px-4 py-4 border-b"
        style={{ 
          backgroundColor: 'var(--chat-header-bg)',
          borderColor: 'var(--border-primary)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" style={{ color: 'var(--accent-600)' }}>
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" fill="currentColor" />
              <circle cx="18" cy="16" r="3" fill="currentColor" />
            </svg>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>AI Guitar Tutor</h2>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && onReset && (
              <button
                onClick={onReset}
                disabled={isLoading}
                className="p-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                style={{
                  color: 'var(--text-tertiary)',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                title="Reset chat"
                aria-label="Reset chat"
              >
                {/* Inline the project's stroke-based reload.svg so it matches header icons */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            )}

            {onToggleCollapsed && (
              <button
                onClick={onToggleCollapsed}
                aria-label="Collapse chat"
                title="Collapse chat"
                className="text-xs px-2 py-1 rounded-md transition-all hover:scale-105"
                style={{
                  color: 'var(--text-tertiary)',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {/* larger chevron for open panel to match visual weight of collapsed chevron */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6" style={{ transform: `rotate(${isMobile ? 90 : 180}deg)` }}>
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions (shown when no messages) */}
      {messages.length === 0 && (
        <QuickActions onAction={onSendMessage} disabled={isLoading} darkMode={darkMode} />
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div 
              className="w-12 h-12 mb-3 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" style={{ color: 'var(--text-muted)' }}>
                <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Start a conversation</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Ask about chord progressions, scales, or voicings
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onChordClick={onChordClick}
                onScaleClick={onScaleClick}
                darkMode={darkMode}
                selectedChordRoot={selectedChordRoot}
                selectedChordQuality={selectedChordQuality}
                selectedScaleRoot={selectedScaleRoot}
                selectedScaleMode={selectedScaleMode}
              />
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start mb-3">
                <div
                  className="rounded-2xl rounded-bl-sm px-4 py-3 border"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--border-primary)',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '0ms', backgroundColor: 'var(--accent-400)' }} />
                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '150ms', backgroundColor: 'var(--accent-400)' }} />
                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '300ms', backgroundColor: 'var(--accent-400)' }} />
                  </div>
                  {streamingStatus && (
                    <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                      {streamingStatus}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <ChatInput onSend={onSendMessage} disabled={isLoading} darkMode={darkMode} />
    </div>
  );
}
