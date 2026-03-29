import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore, useSongSearch } from '../../stores/useAppStore';
import type { SongSearchResult } from '../../types';

export function SongSearch() {
  const [inputValue, setInputValue] = useState('');
  const { results, loading, error } = useSongSearch();
  const searchSongs = useAppStore((s) => s.searchSongs);
  const selectSong = useAppStore((s) => s.selectSong);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (query: string) => {
      setInputValue(query);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (query.trim().length < 2) return;
      debounceRef.current = setTimeout(() => searchSongs(query.trim()), 300);
    },
    [searchSongs],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim().length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchSongs(inputValue.trim());
    }
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search for a song or artist..."
          className="flex-1 px-4 py-2.5 rounded-lg border text-sm outline-none transition-colors"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          type="submit"
          disabled={loading || inputValue.trim().length < 2}
          className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            backgroundColor: 'var(--accent-500)',
            color: 'white',
          }}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
        >
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((song) => (
            <SongResultRow key={song.song_id} song={song} onSelect={selectSong} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && inputValue.trim().length >= 2 && (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
          No results found. Try a different search.
        </div>
      )}

      {/* Initial state */}
      {results.length === 0 && inputValue.trim().length < 2 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🎸</div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Search for a song to view its tab
          </p>
        </div>
      )}
    </div>
  );
}

function SongResultRow({
  song,
  onSelect,
}: {
  song: SongSearchResult;
  onSelect: (song: SongSearchResult) => void;
}) {
  const instruments = song.tracks
    .map((t) => t.instrument)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 4);

  return (
    <button
      onClick={() => onSelect(song)}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors hover:scale-[1.005] active:scale-[0.995]"
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
          {song.title}
        </div>
        <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          {song.artist}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {instruments.map((inst) => (
          <span
            key={inst}
            className="px-2 py-0.5 rounded text-[10px]"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--text-secondary)',
            }}
          >
            {inst}
          </span>
        ))}
        {song.has_chords && (
          <span
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{
              backgroundColor: 'rgba(16,185,129,0.15)',
              color: 'var(--accent-500)',
            }}
          >
            chords
          </span>
        )}
      </div>
    </button>
  );
}
