import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { midiToNoteName } from '../utils/tuning';
import { MeasureGroup } from '../components/TabViewer/MeasureGroup';
import { getBeatsFromMeasure } from '../components/TabViewer/TabViewer';
import { TutorChat } from './TutorChat';
import { SongEnrichmentPanel } from './SongEnrichment';
import type { SongSearchResult, TabBeat, TabMeasure } from '../types';
import type { SongDerivedRange, SongFocus, SongSelection, SongStudyArtifact, TutorFocus, V2Branch } from '../types/v2';

const DEFAULT_WINDOW_SIZE = 4;
// Supporting element, not a primary block (mock #overview callout 3: "large
// enough to teach the current relationship, no larger by default") — 12
// frets covers virtually every beat's shape by default. SongStudyFretboard
// extends past this when an actual active/upcoming note needs a higher
// fret, so a real note is never clipped out of view.
const FRESH_FRETBOARD_FRET_COUNT = 12;

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

function parseBeatId(beatId: string): { measureIndex: number; beatIndex: number } | null {
  const [m, b] = beatId.split(':');
  const measureIndex = Number(m);
  const beatIndex = Number(b);
  if (Number.isNaN(measureIndex) || Number.isNaN(beatIndex)) return null;
  return { measureIndex, beatIndex };
}

// --- Section grouping: compresses the whole-song overview + gives Full Tab
// row labels. Uses measure.marker.text (Songsterr's own section markers —
// "Intro"/"Verse"/"Chorus"/etc, already surfaced on TabMeasure) when the tab
// has any; falls back to fixed-size chunks when it doesn't. Chord-change
// boundaries were the other option the ticket allowed, but they're a noisier
// signal (chords repeat within a section) for no benefit once marker.text is
// covered — add that heuristic later only if real tabs without markers turn
// out to look bad chunked.
const OVERVIEW_CHUNK_SIZE = 8;

interface OverviewSection {
  label: string;
  startIndex: number;
  endIndex: number; // inclusive
}

function buildOverviewSections(measures: TabMeasure[]): OverviewSection[] {
  const markers = measures
    .map((measure, index) => ({ index, label: measure.marker?.text }))
    .filter((m): m is { index: number; label: string } => Boolean(m.label));

  if (markers.length === 0) {
    const sections: OverviewSection[] = [];
    for (let start = 0; start < measures.length; start += OVERVIEW_CHUNK_SIZE) {
      const endIndex = Math.min(start + OVERVIEW_CHUNK_SIZE, measures.length) - 1;
      sections.push({ label: `Measures ${start + 1}–${endIndex + 1}`, startIndex: start, endIndex });
    }
    return sections;
  }

  const sections: OverviewSection[] = [];
  if (markers[0].index > 0) {
    sections.push({ label: `Measures 1–${markers[0].index}`, startIndex: 0, endIndex: markers[0].index - 1 });
  }
  markers.forEach((marker, i) => {
    const endIndex = (markers[i + 1]?.index ?? measures.length) - 1;
    sections.push({ label: marker.label, startIndex: marker.index, endIndex });
  });
  return sections;
}

const FULL_TAB_ROW_SIZE = DEFAULT_WINDOW_SIZE;

interface FullTabRow {
  sectionLabel: string;
  startIndex: number;
  endIndex: number; // inclusive
}

function buildFullTabRows(sections: OverviewSection[]): FullTabRow[] {
  const rows: FullTabRow[] = [];
  for (const section of sections) {
    for (let start = section.startIndex; start <= section.endIndex; start += FULL_TAB_ROW_SIZE) {
      const endIndex = Math.min(start + FULL_TAB_ROW_SIZE - 1, section.endIndex);
      rows.push({ sectionLabel: section.label, startIndex: start, endIndex });
    }
  }
  return rows;
}

function describeSelection(selection: SongSelection | null): string | null {
  if (!selection) return null;
  if (selection.type === 'beat') {
    return `Measure ${selection.measureIndex + 1}, beat ${selection.beatIndex + 1} selected`;
  }
  return selection.startMeasureIndex === selection.endMeasureIndex
    ? `Measure ${selection.startMeasureIndex + 1} selected`
    : `Measures ${selection.startMeasureIndex + 1}–${selection.endMeasureIndex + 1} selected`;
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
  tutorFocus,
}: {
  tuningMidi: number[];
  tuningNotes: string[];
  activeNotes: FretNote[];
  upcomingNotes: FretNote[];
  // Third, additive highlight layer (ticket #13) — the tutor's ephemeral
  // cross-view attention for the current turn, distinct from the
  // beat-derived active/upcoming layers above and cleared/replaced on the
  // next turn by the parent (never persisted to Branch state here).
  tutorFocus?: TutorFocus | null;
}) {
  const tutorFocusNotes = useMemo(() => tutorFocus?.notes ?? [], [tutorFocus]);

  // FRESH_FRETBOARD_FRET_COUNT is the highest fret shown by default (fret 0
  // is always rendered too, so the default column count is one more than
  // this) — but never clip a real note out of view, extend past it when the
  // current or next beat actually reaches further up the neck.
  const neededFretCount = useMemo(() => {
    const frets = [...activeNotes, ...upcomingNotes, ...tutorFocusNotes].map((n) => n.fret);
    return Math.max(FRESH_FRETBOARD_FRET_COUNT + 1, ...frets.map((f) => f + 1));
  }, [activeNotes, upcomingNotes, tutorFocusNotes]);
  const frets = useMemo(() => Array.from({ length: neededFretCount }, (_, f) => f), [neededFretCount]);

  return (
    <div
      data-testid="song-study-fretboard"
      style={{
        background: 'linear-gradient(180deg,#20252b 0%,#171b20 100%)',
        border: '1px solid #343b44',
        borderRadius: 12,
        overflowX: 'auto',
        padding: 6,
        maxWidth: 560,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `28px repeat(${frets.length},minmax(22px,1fr))` }}>
        <span />
        {frets.map((f) => (
          <span key={f} style={{ fontSize: 8, color: '#8d98a5', textAlign: 'center', fontWeight: 800 }}>
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
              gridTemplateColumns: `28px repeat(${frets.length},minmax(22px,1fr))`,
              alignItems: 'center',
              height: 22,
            }}
          >
            <div style={{ fontSize: 8, fontWeight: 900, color: '#b7c0c9', textAlign: 'center' }}>
              {tuningNotes[i] ?? '?'}
            </div>
            {frets.map((fret) => {
              const isActive = activeNotes.some((n) => n.string === stringNumber && n.fret === fret);
              const isUpcoming = !isActive && upcomingNotes.some((n) => n.string === stringNumber && n.fret === fret);
              const isTutorFocus = tutorFocusNotes.some((n) => n.string === stringNumber && n.fret === fret);
              const label = isActive || isUpcoming || isTutorFocus ? midiToNoteName(openMidi + fret) : '';
              return (
                <div
                  key={fret}
                  style={{
                    borderLeft: '1px solid #3a424b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {label && (
                    <span
                      data-testid={isActive ? 'fretboard-active-note' : isUpcoming ? 'fretboard-upcoming-note' : 'fretboard-tutor-focus-note-label'}
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 7,
                        fontWeight: 900,
                        background: isActive ? 'linear-gradient(180deg,#2aa878,#1f8f67)' : 'transparent',
                        color: isActive ? '#fff' : isTutorFocus ? '#f9d38c' : '#9fe0c8',
                        border: isActive ? '1px solid #46ba8f' : isTutorFocus ? '2px solid #d4901f' : '2px solid #38a67b',
                      }}
                    >
                      {label}
                    </span>
                  )}
                  {isTutorFocus && (
                    // Additive third layer — a ring around whatever's already
                    // there (or the note label itself), never replacing the
                    // active/upcoming beat-derived styling above.
                    <span
                      data-testid="fretboard-tutor-focus-note"
                      style={{
                        position: 'absolute',
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        border: '2px solid #f5a623',
                        boxShadow: '0 0 0 2px rgba(245,166,35,0.35)',
                        pointerEvents: 'none',
                      }}
                    />
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
        {tutorFocusNotes.length > 0 && <span style={{ color: '#f5a623' }}>◎ tutor focus</span>}
      </div>
      {tutorFocus && (
        <p data-testid="song-study-tutor-focus-caption" style={{ fontSize: 9, color: '#f5a623', marginTop: 4 }}>
          Tutor focus — {tutorFocus.role}
          {tutorFocus.label ? `: ${tutorFocus.label}` : ''}
        </p>
      )}
    </div>
  );
}

// --- Overview: section-grouped, compressed measure map. Click a measure tile
// to jump, shift-click to pick a range, click a section header to jump to
// its first measure. Kept deliberately small/scrollable (mock #overview
// callout 1: "~15% of the screen, not the dominant widget") so it stays a
// secondary navigation strip regardless of song length. ---

function MeasureOverviewStrip({
  sections,
  focusMeasureIndex,
  selection,
  onJump,
  onRangeSelect,
  enrichedRanges,
}: {
  sections: OverviewSection[];
  focusMeasureIndex: number;
  selection: SongSelection | null;
  onJump: (measureIndex: number) => void;
  onRangeSelect: (start: number, end: number) => void;
  enrichedRanges: SongDerivedRange[];
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
      aria-label="Song overview"
      style={{ display: 'flex', gap: 6, overflowX: 'auto', overflowY: 'auto', maxHeight: 160, paddingBottom: 2 }}
    >
      {sections.map((section) => (
        <div
          key={section.startIndex}
          data-testid="song-study-overview-section"
          style={{
            flex: '0 0 auto',
            minWidth: 176,
            border: '1px solid var(--border-primary)',
            borderRadius: 8,
            backgroundColor: 'var(--card-bg)',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={() => handleClick(section.startIndex, false)}
            title={`Jump to ${section.label}`}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              fontSize: 9,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              padding: '4px 6px',
              border: 0,
              backgroundColor: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-primary)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {section.label}
          </button>
          <div
            role="list"
            aria-label={section.label}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 20px)', gap: 2, padding: 4 }}
          >
            {Array.from({ length: section.endIndex - section.startIndex + 1 }, (_, i) => section.startIndex + i).map(
              (idx) => {
                const inFocus = idx === focusMeasureIndex;
                const inRange =
                  selection?.type === 'range' && idx >= selection.startMeasureIndex && idx <= selection.endMeasureIndex;
                const enrichment = enrichedRanges?.find(
                  (range) => idx + 1 >= range.start_measure && idx + 1 <= range.end_measure,
                );
                return (
                  <button
                    key={idx}
                    type="button"
                    role="listitem"
                    data-testid="song-study-overview-measure"
                    data-measure-index={idx}
                    onClick={(e) => handleClick(idx, e.shiftKey)}
                    title={`Jump to measure ${idx + 1} — shift-click to select a range${enrichment ? ` — ${enrichment.section ?? 'AI learning annotation'}` : ''}`}
                    style={{
                      width: 20,
                      height: 16,
                      padding: 0,
                      fontSize: 7,
                      fontWeight: 800,
                      border: '1px solid var(--border-secondary)',
                      borderRadius: 3,
                      backgroundColor: inRange ? 'var(--accent-500)' : inFocus ? 'var(--accent-600)' : 'var(--bg-secondary)',
                      color: inRange || inFocus ? 'white' : 'var(--text-muted)',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                  >
                    {idx + 1}
                    {enrichment && (
                      <span
                        data-testid="song-study-enrichment-marker"
                        aria-hidden="true"
                        style={{ position: 'absolute', right: 1, bottom: 1, width: 3, height: 3, borderRadius: '50%', background: '#6d5bd0' }}
                      />
                    )}
                  </button>
                );
              },
            )}
          </div>
        </div>
      ))}
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
    <div data-testid="song-study-search" className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a song or artist..."
          data-testid="song-study-search-input"
          className="flex-1 px-4 py-2.5 rounded-lg border text-sm outline-none transition-colors"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          type="submit"
          disabled={searching || query.trim().length < 2}
          className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 hover:bg-[var(--accent-600)]"
          style={{ backgroundColor: 'var(--accent-500)', color: 'white' }}
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {searchError && (
        <p role="alert" className="px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {searchError}
        </p>
      )}
      {createError && (
        <p role="alert" className="px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {createError}
        </p>
      )}

      <div className="space-y-2">
        {results.map((song) => (
          <div
            key={song.song_id}
            data-testid="song-study-result"
            className="px-4 py-3 rounded-lg border"
            style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
          >
            <div className="text-sm">
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{song.title}</span>
              <span style={{ color: 'var(--text-muted)' }}> — {song.artist}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {song.tracks.map((track) => {
                const key = `${song.song_id}:${track.index}`;
                return (
                  <button
                    key={track.index}
                    type="button"
                    data-testid="song-study-track-option"
                    disabled={creatingKey === key}
                    onClick={() => handleSelectTrack(song.song_id, track.index)}
                    className="px-3 py-1.5 rounded-md border text-xs font-medium transition-colors disabled:opacity-50 hover:bg-[var(--bg-hover)]"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-primary)',
                    }}
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
  onSongStudyChange,
}: {
  sessionId: string;
  branch: V2Branch;
  songStudy: SongStudyArtifact;
  onBranchChange: (branch: V2Branch) => void;
  onSearchAgain: () => void;
  onSongStudyChange: (artifact: SongStudyArtifact) => void;
}) {
  const payload = songStudy.payload;
  const measures = useMemo(() => payload.tab_data.measures ?? [], [payload.tab_data.measures]);
  const measureCount = measures.length;

  const [focus, setFocus] = useState<SongFocus>(
    () => (branch.focus as SongFocus | null) ?? { measureIndex: 0, windowSize: DEFAULT_WINDOW_SIZE },
  );
  const [selection, setSelection] = useState<SongSelection | null>(() => (branch.selection as SongSelection | null) ?? null);
  const [showFullTab, setShowFullTab] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  // Ephemeral tutor attention (ticket #13) — deliberately NOT persisted to
  // Branch.selection/focus (that's user-driven navigation state, above).
  // Local-only, cleared/replaced on every tutor turn and whenever a
  // different SongStudy/thread is opened.
  const [tutorFocus, setTutorFocus] = useState<TutorFocus | null>(null);

  // A different SongStudy was opened — reset local view state from its branch snapshot.
  useEffect(() => {
    setFocus((branch.focus as SongFocus | null) ?? { measureIndex: 0, windowSize: DEFAULT_WINDOW_SIZE });
    setSelection((branch.selection as SongSelection | null) ?? null);
    setShowFullTab(false);
    setTutorFocus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songStudy.id]);

  const persistBranch = useCallback(
    async (fields: { selection?: SongSelection | null; focus?: SongFocus }) => {
      try {
        const updated = await apiClient.updateV2Branch(sessionId, branch.id, fields);
        onBranchChange(updated);
        setPersistError(null);
      } catch (err) {
        // Local view state already reflects the change optimistically; make
        // the failure visible so the user knows it hasn't reached the
        // server (a stale server snapshot would otherwise silently
        // overwrite it on next load).
        // ponytail: no retry/queueing — surfacing the failure is the whole
        // fix here. Add a retry queue (or optimistic-update rollback) if
        // dropped persists turn out to happen in practice.
        setPersistError(String(err));
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
  const detailEndIndex = Math.min(focus.measureIndex + focus.windowSize, measureCount) - 1;

  const overviewSections = useMemo(() => buildOverviewSections(measures), [measures]);
  const fullTabRows = useMemo(() => buildFullTabRows(overviewSections), [overviewSections]);

  // Measures spanned by a range selection — highlighted wherever they render
  // (Full Tab rows, and the focused detail window), so a selection made in
  // one view stays visible when the other view is showing the same measures.
  const selectedMeasureIndices = useMemo(() => {
    if (selection?.type !== 'range') return undefined;
    const set = new Set<number>();
    for (let i = selection.startMeasureIndex; i <= selection.endMeasureIndex; i += 1) set.add(i);
    return set;
  }, [selection]);

  // Full Tab -> Overview + Focus bridge: jump focus to the start of whatever
  // is selected and switch views, rather than leaving "focus selection" as a
  // manual toggle + manual measure search.
  const focusSelection = useCallback(() => {
    if (!selection) return;
    const startIndex = selection.type === 'range' ? selection.startMeasureIndex : selection.measureIndex;
    jumpToMeasure(startIndex);
    setShowFullTab(false);
  }, [selection, jumpToMeasure]);

  if (measureCount === 0) {
    return (
      <div data-testid="song-study-workspace" className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No tab measures found for this track.</p>
        <button
          type="button"
          onClick={onSearchAgain}
          className="px-3 py-2 rounded-lg border text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        >
          Search another song
        </button>
      </div>
    );
  }

  const headerButtonClass =
    'px-3 py-2 rounded-lg border text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]';
  const headerButtonStyle = {
    backgroundColor: 'var(--card-bg)',
    borderColor: 'var(--border-primary)',
    color: 'var(--text-primary)',
  };

  return (
    // Two-column layout: the SongStudy content stays the primary, undisturbed
    // area on the left; the Tutor is a permanent side rail on the right, not
    // a tab the user must navigate away to reach (spec #10: "artifacts do
    // not obstruct spontaneous questions").
    <div data-testid="song-study-workspace" className="flex gap-4 items-start">
    <div className="flex flex-col gap-4 flex-1 min-w-0">
      <div className="pb-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 data-testid="song-study-title" className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {payload.title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span> {payload.artist}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {payload.track.name} ({payload.track.instrument}) • {measureCount} measures
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              data-testid="song-study-search-again"
              onClick={onSearchAgain}
              className={headerButtonClass}
              style={headerButtonStyle}
            >
              Search another song
            </button>
            <button
              type="button"
              data-testid="song-study-toggle-full-tab"
              onClick={() => setShowFullTab((v) => !v)}
              className={headerButtonClass}
              style={headerButtonStyle}
            >
              {showFullTab ? 'Show overview + focus' : 'Show full tab'}
            </button>
          </div>
        </div>
        {persistError && (
          <p
            role="status"
            data-testid="song-study-persist-error"
            className="text-xs mt-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            Not saved — {persistError}
          </p>
        )}
      </div>

      <SongEnrichmentPanel
        songStudy={songStudy}
        onChange={onSongStudyChange}
        visibleStartMeasure={focus.measureIndex + 1}
        visibleEndMeasure={detailEndIndex + 1}
      />

      {!showFullTab ? (
        // Overview + Focus: the compressed section map is a secondary strip
        // above; the focused 2-4 measures are the dominant area below it
        // (mock #overview callouts 1-2), with the fretboard as a small
        // supporting element underneath (callout 3).
        <>
          <MeasureOverviewStrip
            sections={overviewSections}
            focusMeasureIndex={focus.measureIndex}
            selection={selection}
            onJump={jumpToMeasure}
            onRangeSelect={selectRange}
            enrichedRanges={payload.enrichment?.ranges ?? []}
          />

          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Focused passage
                </p>
                <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  Measures {focus.measureIndex + 1}–{detailEndIndex + 1}
                </h3>
                {activeBeatIndex >= 0 && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Beat {beatSequence[activeBeatIndex].beatIndex + 1} of M
                    {beatSequence[activeBeatIndex].measureIndex + 1} active
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="song-study-focus-prev"
                  disabled={focus.measureIndex === 0}
                  onClick={() => jumpToMeasure(focus.measureIndex - focus.windowSize)}
                  className={headerButtonClass}
                  style={headerButtonStyle}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  data-testid="song-study-focus-next"
                  disabled={detailEndIndex >= measureCount - 1}
                  onClick={() => jumpToMeasure(focus.measureIndex + focus.windowSize)}
                  className={headerButtonClass}
                  style={headerButtonStyle}
                >
                  Next →
                </button>
              </div>
            </div>

            <MeasureGroup
              measures={detailMeasures}
              startMeasureIndex={focus.measureIndex}
              selectedBeatId={selectedBeatId}
              activeMeasureIndex={focus.measureIndex}
              selectedMeasureIndices={selectedMeasureIndices}
              onBeatClick={(_beat, beatId) => selectBeat(beatId)}
              tuningNotes={tuningNotes ?? undefined}
            />
          </div>

          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-wide mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Fretboard · relationship view
            </p>
            {trackTuningMidi && tuningNotes ? (
              <SongStudyFretboard
                tuningMidi={trackTuningMidi}
                tuningNotes={tuningNotes}
                activeNotes={activeNotes}
                upcomingNotes={upcomingNotes}
                tutorFocus={tutorFocus}
              />
            ) : (
              <p role="status">No tuning data for this track — showing tab only.</p>
            )}
          </div>
        </>
      ) : (
        // Full Tab: dense, continuous whole-song reader. No permanent
        // fretboard here (mock #full: "remove the permanent fretboard...
        // give the tab the width"). A selection surfaces a dock with a
        // bridge back into Overview + Focus on exactly that range.
        <div className="flex flex-col gap-3">
          <div data-testid="song-study-full-tab" className="flex flex-col gap-2">
            {fullTabRows.map((row) => (
              <div
                key={`${row.startIndex}-${row.endIndex}`}
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--card-bg)' }}
              >
                <div
                  className="flex items-center justify-between px-2 py-1 text-[9px] font-bold border-b"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
                >
                  <span>
                    {row.sectionLabel} · measures {row.startIndex + 1}–{row.endIndex + 1}
                  </span>
                </div>
                <MeasureGroup
                  measures={measures.slice(row.startIndex, row.endIndex + 1)}
                  startMeasureIndex={row.startIndex}
                  selectedBeatId={selectedBeatId}
                  activeMeasureIndex={focus.measureIndex}
                  selectedMeasureIndices={selectedMeasureIndices}
                  onBeatClick={(_beat, beatId) => selectBeat(beatId)}
                  tuningNotes={tuningNotes ?? undefined}
                  compact
                />
              </div>
            ))}
          </div>

          {selection && (
            <div
              data-testid="song-study-selection-dock"
              className="sticky bottom-2 flex items-center justify-between gap-3 rounded-lg px-3 py-2"
              style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)' }}
            >
              <strong className="text-xs font-bold">{describeSelection(selection)}</strong>
              <button
                type="button"
                data-testid="song-study-focus-selection"
                onClick={focusSelection}
                className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={{ backgroundColor: 'var(--accent-500)', color: 'white' }}
              >
                Focus selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
      <TutorChat
        sessionId={sessionId}
        branchId={branch.id}
        tutorThreadId={branch.tutor_thread_id}
        onFocusChange={setTutorFocus}
      />
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
      onSongStudyChange={setSongStudy}
    />
  );
}
