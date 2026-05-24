import type { ConversationThread } from '../../types';

interface ThreadHistoryDropdownProps {
  threads: ConversationThread[];
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ThreadHistoryDropdown({ threads, onSelectThread, onNewThread }: ThreadHistoryDropdownProps) {
  return (
    <div
      className="absolute right-0 top-full mt-2 z-50 rounded-xl border shadow-lg w-72"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
    >
      <div className="p-2 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        <button
          onClick={onNewThread}
          className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--accent-600)', color: 'white' }}
        >
          + New conversation
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto p-2 flex flex-col gap-1">
        {threads.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
            No previous conversations.
          </p>
        ) : (
          threads.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectThread(t.id)}
              className="w-full text-left px-3 py-2 rounded-lg transition-colors"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {t.title}
              </div>
              {t.preview && (
                <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {t.preview}
                </div>
              )}
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {formatRelativeTime(t.last_message_at)}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
