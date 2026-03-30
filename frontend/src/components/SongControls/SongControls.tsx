import { useAppStore } from '../../stores/useAppStore';
import { formatTuning } from '../../utils/tuning';

export function SongControls() {
  const selectedSong = useAppStore((s) => s.selectedSong);
  const songTracks = useAppStore((s) => s.songTracks);
  const selectedTrackIndex = useAppStore((s) => s.selectedTrackIndex);
  const songViewMode = useAppStore((s) => s.songViewMode);
  const chordProData = useAppStore((s) => s.chordProData);
  const chordProLoading = useAppStore((s) => s.chordProLoading);
  const selectedTuning = useAppStore((s) => s.selectedTuning);
  const availableTunings = useAppStore((s) => s.availableTunings);
  const customTuningNotes = useAppStore((s) => s.customTuningNotes);

  const selectTrack = useAppStore((s) => s.selectTrack);
  const setSongViewMode = useAppStore((s) => s.setSongViewMode);
  const fetchChordPro = useAppStore((s) => s.fetchChordPro);
  const backToSearch = useAppStore((s) => s.backToSearch);

  if (!selectedSong) return null;

  const tracks = songTracks?.tracks ?? selectedSong.tracks;
  const chordsAvailable = selectedSong.has_chords;
  const selectedTrack =
    tracks.find((track) => track.index === selectedTrackIndex) ??
    tracks[0];

  // Show tuning name from matched tuning, or fall back to note letters
  const matchedTuning = availableTunings.find((t) => t.id === selectedTuning);
  const tuningDisplay = matchedTuning
    ? `${matchedTuning.name} (${[...matchedTuning.notes].reverse().join(' ')})`
    : customTuningNotes
      ? `Custom (${[...customTuningNotes].reverse().join(' ')})`
      : formatTuning(selectedTrack?.tuning);

  const handleViewModeChange = async (mode: 'tab' | 'chords') => {
    setSongViewMode(mode);
    if (
      mode === 'chords' &&
      chordsAvailable &&
      !chordProData &&
      !chordProLoading
    ) {
      await fetchChordPro(selectedSong.song_id);
    }
  };

  return (
    <div className="flex flex-col gap-3 md:gap-4 w-full">
      <div className="flex items-center gap-2 min-w-0 text-[11px] md:text-xs">
        <button
          type="button"
          onClick={backToSearch}
          className="truncate transition-opacity hover:opacity-80"
          style={{ color: 'var(--accent-600)' }}
          title="Back to Search Results"
        >
          Songs / Search Results
        </button>
        <span style={{ color: 'var(--text-muted)' }}>/</span>
        <span className="truncate" style={{ color: 'var(--text-muted)' }}>
          {selectedSong.artist} - {selectedSong.title}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          <div className="text-xs md:text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {selectedSong.artist} - {selectedSong.title}
          </div>
          <div className="text-[11px] md:text-xs" style={{ color: 'var(--text-muted)' }}>
            Song ID: {selectedSong.song_id}
            {tuningDisplay ? ` • Tuning: ${tuningDisplay}` : ''}
          </div>
          <div
            className="mt-2 inline-flex rounded-lg p-0.5 border"
            style={{
              borderColor: 'var(--border-primary)',
              backgroundColor: 'var(--bg-tertiary)',
            }}
          >
            <button
              type="button"
              onClick={() => void handleViewModeChange('tab')}
              className={`px-3 py-1.5 text-xs md:text-sm rounded-md font-medium ${
                songViewMode === 'tab' ? 'shadow-sm border' : ''
              }`}
              style={{
                borderColor: songViewMode === 'tab' ? 'var(--border-primary)' : 'transparent',
                backgroundColor: songViewMode === 'tab' ? 'var(--card-bg)' : 'transparent',
                color: songViewMode === 'tab' ? 'var(--accent-600)' : 'var(--text-tertiary)',
              }}
            >
              Tab
            </button>
            <button
              type="button"
              onClick={() => void handleViewModeChange('chords')}
              disabled={!chordsAvailable}
              className={`px-3 py-1.5 text-xs md:text-sm rounded-md font-medium ${
                songViewMode === 'chords' ? 'shadow-sm border' : ''
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{
                borderColor: songViewMode === 'chords' ? 'var(--border-primary)' : 'transparent',
                backgroundColor: songViewMode === 'chords' ? 'var(--card-bg)' : 'transparent',
                color: songViewMode === 'chords' ? 'var(--accent-600)' : 'var(--text-tertiary)',
              }}
              title={chordsAvailable ? 'Show ChordPro lyrics/chords' : 'No chords available'}
            >
              Chords
            </button>
          </div>
        </div>

        <select
          value={selectedTrackIndex}
          onChange={(e) => void selectTrack(Number(e.target.value))}
          className="w-full lg:w-auto lg:min-w-[360px] px-3 py-2 rounded-lg text-xs md:text-sm border"
          style={{
            borderColor: 'var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        >
          {tracks.map((track) => (
            <option key={track.index} value={track.index}>
              {track.name || track.instrument}
              {track.is_vocal ? ' (vocal)' : ''}
              {track.is_empty ? ' (empty)' : ''}
              {track.tuning?.length ? ` • ${formatTuning(track.tuning)}` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
