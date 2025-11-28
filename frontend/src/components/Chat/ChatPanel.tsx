import { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { QuickActions } from './QuickActions';
import type { ChatMessage as ChatMessageType } from '../../types/chat';

interface ChatPanelProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onChordClick?: (chord: string, apiRequest?: { root: string; quality: string }) => void;
  onScaleClick?: (scale: string, apiRequest?: { root: string; mode: string }) => void;
  onReset?: () => void;
}

export function ChatPanel({
  messages,
  isLoading,
  onSendMessage,
  onChordClick,
  onScaleClick,
  onReset,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200 font-sans">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-blue-600">
              <path d="M10 3.75a2 2 0 10-4 0 2 2 0 004 0zM17.25 4.5a.75.75 0 000-1.5h-5.5a.75.75 0 000 1.5h5.5zM5 3.75a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75zM4.25 17a.75.75 0 000-1.5h-1.5a.75.75 0 000 1.5h1.5zM17.25 17a.75.75 0 000-1.5h-5.5a.75.75 0 000 1.5h5.5zM9 10a.75.75 0 01-.75.75h-5.5a.75.75 0 010-1.5h5.5A.75.75 0 019 10zM17.25 10.75a.75.75 0 000-1.5h-1.5a.75.75 0 000 1.5h1.5zM14 10a2 2 0 10-4 0 2 2 0 004 0zM10 16.25a2 2 0 10-4 0 2 2 0 004 0z" />
            </svg>
            <h2 className="font-semibold text-slate-800">Guitar Tutor</h2>
          </div>
          {messages.length > 0 && onReset && (
            <button
              onClick={onReset}
              disabled={isLoading}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100 
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Reset chat"
              aria-label="Reset chat"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Quick Actions (shown when no messages) */}
      {messages.length === 0 && (
        <QuickActions onAction={onSendMessage} disabled={isLoading} />
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
            <div className="w-12 h-12 mb-3 rounded-full bg-slate-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-slate-400">
                <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">Start a conversation</p>
            <p className="text-xs mt-1">
              Ask about chord progressions, scales, or CAGED shapes
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
              />
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start mb-3">
                <div className="bg-white border border-slate-200 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <ChatInput onSend={onSendMessage} disabled={isLoading} />
    </div>
  );
}
