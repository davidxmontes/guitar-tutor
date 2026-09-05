import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { midiToNoteName } from '../utils/tuning';
import { MeasureGroup } from '../components/TabViewer/MeasureGroup';
import type { SongSearchResult, TabBeat, TabMeasure } from '../types';
import type { SongFocus, SongSelection, SongStudyArtifact, V2Branch } from '../types/v2';

const DEFAULT_WINDOW_SIZE = 4;
const FRESH_FRETBOARD_FRET_COUNT = 15; // readable default window; horizontally scrollable

// Small local port of TabViewer's private helper (see
// ../components/TabViewer/TabViewer.tsx) — V1 is reference material for V2,
// not something this ticket modifies, so this stays duplicated rather than
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

interface FretNote {
  string: number; // 1-based, 1 = highest string
  fret: number;
}

function toFretNotes(beat?: TabBeat): FretNote[] {
  if (!beat) return [];
  const seen = new Set<string>();
  const notes: FretNote[] = [];
  for (const note of beat.notes ?? []) {
    if (note.rest || note.dead) continue;
    if (typeof note.string !== 'number' || typeof note.fret !== 'number') continue;
    const stringNumber = note.string + 1; // Songsterr strings are 0-based, high string first
    const key = `${stringNumber}:${note.fret}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push({ string: stringNumber, fret: note.fret });
  }
  return notes;
}

function firstMeasureChordLabel(measure: TabMeasure): string | null {
  for (const beat of getBeatsFromMeasure(measure)) {
    if (beat.chord?.text) return beat.chord.text;
  }
  return null;
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

// --- Fretboard: fresh V2 component. Draws styling cues (dark neck, green
// active/upcoming role dots) from V1's Fretboard + the UX reference mock,
// but is written against SongStudy's own data (MIDI tuning + string/fret
// pairs from the raw beat) rather than porting V1's component/props — see
// docs/agents/project.md "V1 UI reuse". Any string count works (not just 6),
// which is also how this ticket avoids inheriting V1's standard-tuning
// assumption.
function SongStudyFretboard({
  tuningMidi,
  tuningNotes,
  activeNotes,
  upcomingNotes,
}: {
  tuningMidi: number[];
  tuningNotes: string[];
  activeNotes: FretNote[];
  upcomingNotes: FretNote[];
}) {
  const frets = useMemo(() => Array.from({ length: FRESH_FRETBOARD_FRET_COUNT }, (_, f) => f), []);

  return (
    <div
      data-testid="song-study-fretboard"
      style={{
        background: 'linear-gradient(180deg,#20252b 0%,#171b20 100%)',
        border: '1px solid #343b44',
        borderRadius: 16,
        overflowX: 'auto',
        padding: 8,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(${frets.length},minmax(28px,1fr))` }}>
        <span />
        {frets.map((f) => (
          <span key={f} style={{ fontSize: 9, color: '#8d98a5', textAlign: 'center', fontWeight: 800 }}>
            {f}
          </span>
        ))}
      </div>
      {tuningMidi.map((openMidi, i) => {
        const stringNumber = i + 1;
        return (
          <div
            key={stringNumber}
            style={{
              display: 'grid',
              gridTemplateColumns: `34px repeat(${frets.length},minmax(28px,1fr))`,
              alignItems: 'center',
              height: 30,
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 900, color: '#b7c0c9', textAlign: 'center' }}>
              {tuningNotes[i] ?? '?'}
            </div>
            {frets.map((fret) => {
              const isActive = activeNotes.some((n) => n.string === stringNumber && n.fret === fret);
              const isUpcoming = !isActive && upcomingNotes.some((n) => n.string === stringNumber && n.fret === fret);
              const label = isActive || isUpcoming ? midiToNoteName(openMidi + fret) : '';
              return (
                <div
                  key={fret}
                  style={{
                    borderLeft: '1px solid #3a424b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {label && (
                    <span
                      data-testid={isActive ? 'fretboard-active-note' : 'fretboard-upcoming-note'}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 8,
                        fontWeight: 900,
                        background: isActive ? 'linear-gradient(180deg,#2aa878,#1f8f67)' : 'transparent',
                        color: isActive ? '#fff' : '#9fe0c8',
                        border: isActive ? '1px solid #46ba8f' : '2px solid #38a67b',
                      }}
                    >
                      {label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 9, color: '#8d98a5' }}>
        <span>● active beat</span>
        <span>○ upcoming beat</span>
      </div>
    </div>
  );
}

// --- Overview: whole-track measure map, click to jump, shift-click to pick a range ---

function MeasureOverviewStrip({
  measures,
  focusMeasureIndex,
  selection,
  onJump,
  onRangeSelect,
}: {
  measures: TabMeasure[];
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
      style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}
    >
      {measures.map((measure, idx) => {
        const inFocus = idx === focusMeasureIndex;
        const inRange =
          selection?.type === 'range' && idx >= selection.startMeasureIndex && idx <= selection.endMeasureIndex;
        const chordLabel = firstMeasureChordLabel(measure);
        const markerText = measure.marker?.text;
        return (
          <button
            key={idx}
            type="button"
            role="listitem"
            data-testid="song-study-overview-measure"
            data-measure-index={idx}
            onClick={(e) => handleClick(idx, e.shiftKey)}
            title={`Jump to measure ${idx + 1}${markerText ? ` (${markerText})` : ''} — shift-click to select a range`}
            style={{
              width: 46,
              minHeight: 34,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
              padding: 4,
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
              backgroundColor: inRange ? 'var(--accent-500)' : inFocus ? 'var(--accent-600)' : 'var(--card-bg)',
              color: inRange || inFocus ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 800 }}>{idx + 1}</span>
            {chordLabel && <span style={{ fontSize: 8 }}>{chordLabel}</span>}
          </button>
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

  // A different SongStudy was opened — reset local view state from its branch snapshot.
  useEffect(() => {
    setFocus((branch.focus as SongFocus | null) ?? { measureIndex: 0, windowSize: DEFAULT_WINDOW_SIZE });
    setSelection((branch.selection as SongSelection | null) ?? null);
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
      const next: SongSelection = { type: 'beat', ...parsed };
      setSelection(next);
      persistBranch({ selection: next });
    },
    [persistBranch],
  );

  // Flat measure/beat sequence — used to derive "active beat" (selected, or
  // else the first playable beat in the focused measure) and "upcoming beat"
  // (whatever plays next), so the fretboard always shows something relevant
  // without a separate piece of highlight state to keep in sync.
  const beatSequence = useMemo(() => {
    const seq: Array<{ measureIndex: number; beatIndex: number; beat: TabBeat }> = [];
    measures.forEach((measure, measureIndex) => {
      getBeatsFromMeasure(measure).forEach((beat, beatIndex) => {
        seq.push({ measureIndex, beatIndex, beat });
      });
    });
    return seq;
  }, [measures]);

  const activeBeatIndex = useMemo(() => {
    if (selection?.type === 'beat') {
      return beatSequence.findIndex(
        (e) => e.measureIndex === selection.measureIndex && e.beatIndex === selection.beatIndex,
      );
    }
    return beatSequence.findIndex(
      (e) => e.measureIndex === focus.measureIndex && (e.beat.notes ?? []).some((n) => !n.rest && !n.dead),
    );
  }, [selection, beatSequence, focus.measureIndex]);

  const activeNotes = activeBeatIndex >= 0 ? toFretNotes(beatSequence[activeBeatIndex].beat) : [];
  const upcomingNotes = activeBeatIndex >= 0 ? toFretNotes(beatSequence[activeBeatIndex + 1]?.beat) : [];

  const trackTuningMidi = payload.track.tuning ?? payload.tab_data.tuning ?? null;
  const tuningNotes = trackTuningMidi ? trackTuningMidi.map((midi) => midiToNoteName(midi)) : null;

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

      {!showFullTab ? (
        <>
          <MeasureOverviewStrip
            measures={measures}
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

      {trackTuningMidi && tuningNotes ? (
        <SongStudyFretboard
          tuningMidi={trackTuningMidi}
          tuningNotes={tuningNotes}
          activeNotes={activeNotes}
          upcomingNotes={upcomingNotes}
        />
      ) : (
        <p role="status">No tuning data for this track — showing tab only.</p>
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
