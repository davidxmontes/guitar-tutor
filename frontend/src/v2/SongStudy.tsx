import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { midiTuningToNotes } from '../utils/tuning';
import { useFretboard } from '../hooks';
import { Fretboard } from '../components/Fretboard';
import { MeasureGroup } from '../components/TabViewer/MeasureGroup';
import type { HighlightedNote, SongSearchResult, TabBeat, TabMeasure } from '../types';
import type { SongFocus, SongSelection, SongStudyArtifact, V2Branch } from '../types/v2';

const DEFAULT_WINDOW_SIZE = 4;
const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40]; // fallback display only — never assumed for playable tracks

// Small local ports of TabViewer's private helpers (see
// ../components/TabViewer/TabViewer.tsx) — V1 is reference material for V2,
// not something this ticket modifies, so these stay duplicated rather than
// exported out of a V1 file.
function getBeatsFromMeasure(measure?: TabMeasure): TabBeat[] {
  if (!measure) return [];
  const voices = measure.voices ?? [];
  if (voices.length === 0) return [];
  if (voices.length === 1) return voices[0]?.beats ?? [];

  let bestBeats: TabBeat[] = voices[0]?.beats ?? [];
  let bestScore = -1;
  for (const voice of voices) {
    const beats = voice?.beats ?? [];
    const score = beats.reduce((acc, beat) => acc + (beat.notes ?? []).filter((n) => !n.rest && !n.dead).length, 0);
    if (score > bestScore) {
      bestScore = score;
      bestBeats = beats;
    }
  }
  return bestBeats;
}

function toHighlightedNotes(beat: TabBeat): HighlightedNote[] {
  const seen = new Set<string>();
  const highlights: HighlightedNote[] = [];
  for (const note of beat.notes ?? []) {
    if (note.rest || note.dead) continue;
    if (typeof note.string !== 'number' || typeof note.fret !== 'number') continue;
    const mappedString = note.string + 1; // Songsterr strings are 0-5 (high e -> low E), fretboard uses 1-6
    if (mappedString < 1 || mappedString > 6) continue;
    const key = `${mappedString}:${note.fret}`;
    if (seen.has(key)) continue;
    seen.add(key);
    highlights.push({ string: mappedString, fret: note.fret });
  }
  return highlights;
}

function parseBeatId(beatId: string): { measureIndex: number; beatIndex: number } | null {
  const [m, b] = beatId.split(':');
  const measureIndex = Number(m);
  const beatIndex = Number(b);
  if (Number.isNaN(measureIndex) || Number.isNaN(beatIndex)) return null;
  return { measureIndex, beatIndex };
}

function chunkMeasures<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// --- Overview: whole-track measure map, click to jump, shift-click to pick a range ---

function MeasureOverviewStrip({
  measureCount,
  focusMeasureIndex,
  selection,
  onJump,
  onRangeSelect,
}: {
  measureCount: number;
  focusMeasureIndex: number;
  selection: SongSelection | null;
  onJump: (measureIndex: number) => void;
  onRangeSelect: (start: number, end: number) => void;
}) {
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);

  const handleClick = (idx: number, shiftKey: boolean) => {
    if (shiftKey && rangeAnchor !== null) {
      onRangeSelect(Math.min(rangeAnchor, idx), Math.max(rangeAnchor, idx));
      return;
    }
    setRangeAnchor(idx);
    onJump(idx);
  };

  return (
    <div
      data-testid="song-study-overview"
      role="list"
      aria-label="Song overview"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}
    >
      {Array.from({ length: measureCount }, (_, idx) => {
        const inFocus = idx === focusMeasureIndex;
        const inRange =
          selection?.type === 'range' && idx >= selection.startMeasureIndex && idx <= selection.endMeasureIndex;
        return (
          <button
            key={idx}
            type="button"
            role="listitem"
            data-testid="song-study-overview-measure"
            data-measure-index={idx}
            onClick={(e) => handleClick(idx, e.shiftKey)}
            title={`Jump to measure ${idx + 1}${inRange ? ' (in selected range)' : ''} — shift-click to select a range`}
            style={{
              width: 10,
              height: 16,
              border: '1px solid var(--border-primary)',
              borderRadius: 2,
              backgroundColor: inRange ? 'var(--accent-500)' : inFocus ? 'var(--accent-600)' : 'var(--bg-hover)',
              cursor: 'pointer',
              padding: 0,
            }}
          />
        );
      })}
    </div>
  );
}

// --- Search: find a song, pick a track, open (or create) its SongStudy ---

function SongStudySearch({
  sessionId,
  branchId,
  onCreated,
}: {
  sessionId: string;
  branchId: string;
  onCreated: (artifact: SongStudyArtifact, branch: V2Branch) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const data = await apiClient.searchSongs(query.trim());
      setResults(data.results);
    } catch (err) {
      setSearchError(String(err));
    } finally {
      setSearching(false);
    }
  };

  const handleSelectTrack = async (songId: number, trackIndex: number) => {
    const key = `${songId}:${trackIndex}`;
    setCreatingKey(key);
    setCreateError(null);
    try {
      const artifact = await apiClient.createSongStudy({
        session_id: sessionId,
        branch_id: branchId,
        song_id: songId,
        track_index: trackIndex,
      });
      const session = await apiClient.getV2Session(sessionId);
      const branch = session.branches.find((b) => b.id === branchId);
      if (!branch) throw new Error('Branch not found after creating SongStudy');
      onCreated(artifact, branch);
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setCreatingKey(null);
    }
  };

  return (
    <div data-testid="song-study-search">
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a song or artist..."
          data-testid="song-study-search-input"
        />
        <button type="submit" disabled={searching || query.trim().length < 2}>
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {searchError && <p role="alert">{searchError}</p>}
      {createError && <p role="alert">{createError}</p>}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map((song) => (
          <div key={song.song_id} data-testid="song-study-result">
            <div>
              <strong>{song.title}</strong> — {song.artist}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {song.tracks.map((track) => {
                const key = `${song.song_id}:${track.index}`;
                return (
                  <button
                    key={track.index}
                    type="button"
                    data-testid="song-study-track-option"
                    disabled={creatingKey === key}
                    onClick={() => handleSelectTrack(song.song_id, track.index)}
                  >
                    {creatingKey === key ? 'Loading...' : track.name || track.instrument}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Workspace: overview + focused detail window, full-tab toggle, fretboard sync ---

function SongStudyWorkspace({
  sessionId,
  branch,
  songStudy,
  onBranchChange,
  onSearchAgain,
}: {
  sessionId: string;
  branch: V2Branch;
  songStudy: SongStudyArtifact;
  onBranchChange: (branch: V2Branch) => void;
  onSearchAgain: () => void;
}) {
  const payload = songStudy.payload;
  const measures = useMemo(() => payload.tab_data.measures ?? [], [payload.tab_data.measures]);
  const measureCount = measures.length;

  const [focus, setFocus] = useState<SongFocus>(
    () => (branch.focus as SongFocus | null) ?? { measureIndex: 0, windowSize: DEFAULT_WINDOW_SIZE },
  );
  const [selection, setSelection] = useState<SongSelection | null>(() => (branch.selection as SongSelection | null) ?? null);
  const [showFullTab, setShowFullTab] = useState(false);
  const [highlightedNotes, setHighlightedNotes] = useState<HighlightedNote[]>([]);

  // A different SongStudy was opened — reset local view state from its branch snapshot.
  useEffect(() => {
    setFocus((branch.focus as SongFocus | null) ?? { measureIndex: 0, windowSize: DEFAULT_WINDOW_SIZE });
    setSelection((branch.selection as SongSelection | null) ?? null);
    setHighlightedNotes([]);
    setShowFullTab(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songStudy.id]);

  const persistBranch = useCallback(
    async (fields: { selection?: SongSelection | null; focus?: SongFocus }) => {
      try {
        const updated = await apiClient.updateV2Branch(sessionId, branch.id, fields);
        onBranchChange(updated);
      } catch {
        // Best-effort persistence — local view state already reflects the change.
      }
    },
    [sessionId, branch.id, onBranchChange],
  );

  const jumpToMeasure = useCallback(
    (measureIndex: number) => {
      const clamped = Math.max(0, Math.min(measureCount - 1, measureIndex));
      const next: SongFocus = { measureIndex: clamped, windowSize: focus.windowSize };
      setFocus(next);
      persistBranch({ focus: next });
    },
    [measureCount, focus.windowSize, persistBranch],
  );

  const selectRange = useCallback(
    (start: number, end: number) => {
      const next: SongSelection = { type: 'range', startMeasureIndex: start, endMeasureIndex: end };
      setSelection(next);
      persistBranch({ selection: next });
    },
    [persistBranch],
  );

  const selectBeat = useCallback(
    (beatId: string) => {
      const parsed = parseBeatId(beatId);
      if (!parsed) return;
      const beat = getBeatsFromMeasure(measures[parsed.measureIndex])[parsed.beatIndex];
      const next: SongSelection = { type: 'beat', ...parsed };
      setSelection(next);
      setHighlightedNotes(beat ? toHighlightedNotes(beat) : []);
      persistBranch({ selection: next });
    },
    [measures, persistBranch],
  );

  const trackTuningMidi = payload.track.tuning ?? payload.tab_data.tuning ?? null;
  const tuningNotes = trackTuningMidi && trackTuningMidi.length === 6 ? midiTuningToNotes(trackTuningMidi) : null;
  const fretboardTuningNotes = tuningNotes ?? midiTuningToNotes(STANDARD_TUNING_MIDI);
  const { fretboardData } = useFretboard('custom', fretboardTuningNotes.join(','));

  const selectedBeatId = selection?.type === 'beat' ? `${selection.measureIndex}:${selection.beatIndex}` : null;
  const detailMeasures = measures.slice(focus.measureIndex, focus.measureIndex + focus.windowSize);

  if (measureCount === 0) {
    return (
      <div data-testid="song-study-workspace">
        <p>No tab measures found for this track.</p>
        <button type="button" onClick={onSearchAgain}>Search another song</button>
      </div>
    );
  }

  return (
    <div data-testid="song-study-workspace" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 data-testid="song-study-title">
          {payload.title} — {payload.artist}
        </h2>
        <p>
          {payload.track.name} ({payload.track.instrument}) • {measureCount} measures
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" data-testid="song-study-search-again" onClick={onSearchAgain}>
            Search another song
          </button>
          <button type="button" data-testid="song-study-toggle-full-tab" onClick={() => setShowFullTab((v) => !v)}>
            {showFullTab ? 'Show overview + focus' : 'Show full tab'}
          </button>
        </div>
      </div>

      {!tuningNotes && (
        <p role="status">
          Fretboard mapping only supports 6-string tuning; showing tab only for this track.
        </p>
      )}

      {!showFullTab ? (
        <>
          <MeasureOverviewStrip
            measureCount={measureCount}
            focusMeasureIndex={focus.measureIndex}
            selection={selection}
            onJump={jumpToMeasure}
            onRangeSelect={selectRange}
          />
          <MeasureGroup
            measures={detailMeasures}
            startMeasureIndex={focus.measureIndex}
            selectedBeatId={selectedBeatId}
            activeMeasureIndex={focus.measureIndex}
            onBeatClick={(_beat, beatId) => selectBeat(beatId)}
            tuningNotes={tuningNotes ?? undefined}
          />
        </>
      ) : (
        <div data-testid="song-study-full-tab" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {chunkMeasures(measures, DEFAULT_WINDOW_SIZE).map((row, i) => (
            <MeasureGroup
              key={i}
              measures={row}
              startMeasureIndex={i * DEFAULT_WINDOW_SIZE}
              selectedBeatId={selectedBeatId}
              activeMeasureIndex={focus.measureIndex}
              onBeatClick={(_beat, beatId) => selectBeat(beatId)}
              tuningNotes={tuningNotes ?? undefined}
            />
          ))}
        </div>
      )}

      {tuningNotes && (
        <Fretboard
          strings={fretboardData?.strings ?? []}
          fretCount={fretboardData?.fret_count ?? 22}
          tuningNotes={tuningNotes}
          highlightedNotes={highlightedNotes}
        />
      )}
    </div>
  );
}

// --- Panel: wires branch <-> SongStudy artifact, switches search <-> workspace ---

export function SongStudyPanel({
  sessionId,
  branch,
  onBranchChange,
}: {
  sessionId: string;
  branch: V2Branch;
  onBranchChange: (branch: V2Branch) => void;
}) {
  const [songStudy, setSongStudy] = useState<SongStudyArtifact | null>(null);
  const [searchingAgain, setSearchingAgain] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (branch.current_artifact_kind !== 'song_study' || !branch.current_artifact_id) {
      setSongStudy(null);
      return;
    }
    if (songStudy?.id === branch.current_artifact_id) return;

    let cancelled = false;
    apiClient
      .getSongStudy(branch.current_artifact_id)
      .then((artifact) => {
        if (!cancelled) setSongStudy(artifact);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.current_artifact_kind, branch.current_artifact_id]);

  const handleCreated = (artifact: SongStudyArtifact, updatedBranch: V2Branch) => {
    setSongStudy(artifact);
    setSearchingAgain(false);
    onBranchChange(updatedBranch);
  };

  if (!songStudy || searchingAgain) {
    return (
      <div>
        {loadError && <p role="alert">{loadError}</p>}
        <SongStudySearch sessionId={sessionId} branchId={branch.id} onCreated={handleCreated} />
      </div>
    );
  }

  return (
    <SongStudyWorkspace
      sessionId={sessionId}
      branch={branch}
      songStudy={songStudy}
      onBranchChange={onBranchChange}
      onSearchAgain={() => setSearchingAgain(true)}
    />
  );
}
