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
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Guitar Tutor
          </h2>
          {messages.length > 0 && onReset && (
            <button
              onClick={onReset}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Reset chat"
              aria-label="Reset chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.43l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389 5.5 5.5 0 019.201-2.466l.312.311h-2.433a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.22z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Ask about chords, scales, and music theory
        </p>
      </div>

      {/* Quick Actions (shown when no messages) */}
      {messages.length === 0 && (
        <QuickActions onAction={onSendMessage} disabled={isLoading} />
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
            <div className="w-12 h-12 mb-3 rounded-full bg-gray-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-gray-400">
                <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-600">Start a conversation</p>
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
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
