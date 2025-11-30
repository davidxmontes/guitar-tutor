import { ChatPanel } from '../Chat';
import { useAppStore } from '../../stores';

interface ChatSidebarProps {
  onSendMessage: (message: string) => void;
  onChordClick?: (chord: string, apiRequest?: { root: string; quality: string }) => void;
  onScaleClick?: (scale: string, apiRequest?: { root: string; mode: string }) => void;
}

export function ChatSidebar({
  onSendMessage,
  onChordClick,
  onScaleClick,
}: ChatSidebarProps) {
  const {
    messages,
    chatLoading,
    resetChat,
    darkMode,
    chatCollapsed,
    toggleCollapsed,
    chatWidth,
    setChatWidth,
    selectedChordRoot,
    selectedChordQuality,
    selectedRoot,
    selectedMode,
  } = useAppStore();

  return (
    <aside
      className="flex-shrink-0 relative hidden md:block"
      style={{ width: chatCollapsed ? 56 : chatWidth }}
    >
      <ChatPanel
        messages={messages}
        isLoading={chatLoading}
        onSendMessage={onSendMessage}
        onChordClick={onChordClick}
        onScaleClick={onScaleClick}
        onReset={resetChat}
        isCollapsed={chatCollapsed}
        onToggleCollapsed={toggleCollapsed}
        darkMode={darkMode}
        selectedChordRoot={selectedChordRoot}
        selectedChordQuality={selectedChordQuality}
        selectedScaleRoot={selectedRoot}
        selectedScaleMode={selectedMode}
      />
      {/* Resize Handle */}
      {!chatCollapsed && (
        <ResizeHandle chatWidth={chatWidth} onResize={setChatWidth} />
      )}
    </aside>
  );
}

interface ResizeHandleProps {
  chatWidth: number;
  onResize: (width: number) => void;
}

function ResizeHandle({ chatWidth, onResize }: ResizeHandleProps) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = chatWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(Math.max(startWidth + delta, 280), 500);
      onResize(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      className="absolute top-0 right-0 w-1 h-full cursor-col-resize transition-colors group"
      style={{ '--hover-color': 'var(--accent-400)' } as React.CSSProperties}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-400)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      onMouseDown={handleMouseDown}
    >
      <div
        className="absolute top-1/2 -translate-y-1/2 right-0 w-1 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: 'var(--border-secondary)' }}
      />
    </div>
  );
}

interface MobileChatSheetProps {
  onSendMessage: (message: string) => void;
  onChordClick?: (chord: string, apiRequest?: { root: string; quality: string }) => void;
  onScaleClick?: (scale: string, apiRequest?: { root: string; mode: string }) => void;
}

export function MobileChatSheet({
  onSendMessage,
  onChordClick,
  onScaleClick,
}: MobileChatSheetProps) {
  const {
    messages,
    chatLoading,
    resetChat,
    darkMode,
    mobileSheetOpen,
    setMobileSheetOpen,
    selectedChordRoot,
    selectedChordQuality,
    selectedRoot,
    selectedMode,
  } = useAppStore();

  const handleClose = () => setMobileSheetOpen(false);

  return (
    <>
      {/* Floating Action Button - hidden when sheet is open */}
      {!mobileSheetOpen && (
        <button
          className="fab-chat md:hidden"
          onClick={() => setMobileSheetOpen(true)}
          aria-label="Open chat"
        >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-6 h-6"
        >
          <path
            fillRule="evenodd"
            d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      )}

      {/* Backdrop */}
      <div
        className={`mobile-sheet-backdrop md:hidden ${mobileSheetOpen ? 'open' : ''}`}
        onClick={handleClose}
      />

      {/* Bottom Sheet */}
      <div className={`mobile-sheet md:hidden ${mobileSheetOpen ? 'open' : ''} safe-area-bottom`}>
        <div className="sheet-handle" />
        <div className="h-[80vh] flex flex-col">
          <ChatPanel
            messages={messages}
            isLoading={chatLoading}
            onSendMessage={onSendMessage}
            onChordClick={(chord, apiRequest) => {
              onChordClick?.(chord, apiRequest);
              handleClose();
            }}
            onScaleClick={(scale, apiRequest) => {
              onScaleClick?.(scale, apiRequest);
              handleClose();
            }}
            onReset={resetChat}
            isCollapsed={false}
            onToggleCollapsed={handleClose}
            darkMode={darkMode}
            selectedChordRoot={selectedChordRoot}
            selectedChordQuality={selectedChordQuality}
            selectedScaleRoot={selectedRoot}
            selectedScaleMode={selectedMode}
            isMobile={true}
          />
        </div>
      </div>
    </>
  );
}
