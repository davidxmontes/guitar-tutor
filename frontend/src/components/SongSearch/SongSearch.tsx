import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppAuth } from '../../lib/authBypass';
import { useAppStore, useSongSearch } from '../../stores/useAppStore';
import type { SongSearchResult, FavoriteSong } from '../../types';
import { pickPrimaryTuning } from '../../utils/tuning';

export function SongSearch() {
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'favorites'>('search');
  const { results, loading, error } = useSongSearch();
  const searchSongs = useAppStore((s) => s.searchSongs);
  const selectSong = useAppStore((s) => s.selectSong);
  const favorites = useAppStore((s) => s.favorites);
  const favoriteIds = useAppStore((s) => s.favoriteIds);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const { isSignedIn } = useAppAuth();
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
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
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
      {/* Tab bar */}
      {isSignedIn && (
        <div
          className="flex rounded-lg p-0.5 border"
          style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
        >
          {(['search', 'favorites'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1 rounded-md text-xs font-medium transition-all ${activeTab === tab ? 'shadow-sm border font-bold' : ''}`}
              style={{
                backgroundColor: activeTab === tab ? 'var(--card-bg)' : 'transparent',
                borderColor: activeTab === tab ? 'var(--border-primary)' : 'transparent',
                color: activeTab === tab ? 'var(--accent-600)' : 'var(--text-tertiary)',
              }}
            >
              {tab === 'search' ? 'Search' : `Favorites (${favorites.length})`}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'favorites' && isSignedIn ? (
        <FavoritesList
          favorites={favorites}
          onSelect={(fav) =>
            selectSong({
              song_id: fav.songsterr_song_id,
              title: fav.title,
              artist: fav.artist,
              tracks: [],
              has_chords: false,
            } as any)
          }
          onToggle={(fav) => toggleFavorite({
            songsterr_song_id: fav.songsterr_song_id,
            title: fav.title,
            artist: fav.artist,
          })}
          favoriteIds={favoriteIds}
        />
      ) : (
        <>
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
              style={{ backgroundColor: 'var(--accent-500)', color: 'white' }}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {error && (
            <div className="px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              {error}
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-1">
              {results.map((song) => (
                <SongResultRow
                  key={song.song_id}
                  song={song}
                  onSelect={selectSong}
                  isFavorite={favoriteIds.has(song.song_id)}
                  onToggleFavorite={isSignedIn ? () => toggleFavorite({
                    songsterr_song_id: song.song_id,
                    title: song.title,
                    artist: song.artist,
                  }) : undefined}
                />
              ))}
            </div>
          )}

          {!loading && results.length === 0 && inputValue.trim().length >= 2 && (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
              No results found. Try a different search.
            </div>
          )}

          {results.length === 0 && inputValue.trim().length < 2 && (
            <div className="text-center py-16">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Search for a song to view its tab
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

function SongResultRow({
  song,
  onSelect,
  isFavorite,
  onToggleFavorite,
}: {
  song: SongSearchResult;
  onSelect: (song: SongSearchResult) => void;
  isFavorite: boolean;
  onToggleFavorite?: () => void;
}) {
  const instruments = song.tracks
    .map((t) => t.instrument)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 4);
  const tuningText = pickPrimaryTuning(song.tracks.map((t) => t.tuning));

  return (
    <div
      className="flex items-center gap-2 px-3 py-3 rounded-lg"
      style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-primary)' }}
    >
      <button
        onClick={() => onSelect(song)}
        className="flex-1 flex items-center gap-3 text-left min-w-0"
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {song.title}
          </div>
          <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
            {song.artist}
          </div>
          {tuningText && (
            <div className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Tuning: {tuningText}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {instruments.map((inst) => (
            <span key={inst} className="px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
              {inst}
            </span>
          ))}
          {song.has_chords && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: 'var(--accent-500)' }}>
              chords
            </span>
          )}
        </div>
      </button>
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className="flex-shrink-0 p-1 rounded transition-colors"
          style={{ color: isFavorite ? '#ef4444' : 'var(--text-muted)' }}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <HeartIcon filled={isFavorite} />
        </button>
      )}
    </div>
  );
}

function FavoritesList({
  favorites,
  onSelect,
  onToggle,
  favoriteIds,
}: {
  favorites: FavoriteSong[];
  onSelect: (fav: FavoriteSong) => void;
  onToggle: (fav: FavoriteSong) => void;
  favoriteIds: Set<number>;
}) {
  if (favorites.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No favorites yet. Heart a song from search results.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {favorites.map((fav) => (
        <div
          key={fav.id}
          className="flex items-center gap-2 px-3 py-3 rounded-lg"
          style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-primary)' }}
        >
          <button onClick={() => onSelect(fav)} className="flex-1 text-left min-w-0">
            <div className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{fav.title}</div>
            <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{fav.artist}</div>
          </button>
          <button
            onClick={() => onToggle(fav)}
            className="flex-shrink-0 p-1 rounded"
            style={{ color: '#ef4444' }}
            aria-label="Remove from favorites"
          >
            <HeartIcon filled={!favoriteIds.has(fav.songsterr_song_id) ? false : true} />
          </button>
        </div>
      ))}
    </div>
  );
}
