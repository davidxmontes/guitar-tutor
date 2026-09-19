import { SongVideo } from './SongVideo';
import type { VideoPosition } from './songVideoTiming';
import { SaveToLibrary } from './MyStuff';
import { ExerciseComposer } from './ExerciseComposer';
import { songDrill } from './exerciseMaterial';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { midiToNoteName } from '../utils/tuning';
import { MeasureGroup } from '../components/TabViewer/MeasureGroup';
import { getBeatsFromMeasure } from '../utils/tab';
import { SongEnrichmentPanel } from './SongEnrichment';
import { SongShapeStrip } from './SongShapeStrip';
import { SongLearningMap } from './SongLearningMap';
import { usePractice } from './usePractice';
import { PracticeControls } from './PracticeControls';
import { beatDuration } from './practiceTiming';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import type { SongSearchResult, TabBeat, TabMeasure, TrackSummary } from '../types';
import type { SongDerivedRange, SongFocus, SongSelection, SongShapeSource, SongStudyArtifact } from '../types/v2';

const DEFAULT_WINDOW_SIZE = 4;
const MemoMeasureGroup = memo(MeasureGroup);
// Supporting element, not a primary block (mock #overview callout 3: "large
// enough to teach the current relationship, no larger by default") — 12
// frets covers virtually every beat's shape by default. SongStudyFretboard
// extends past this when an actual active/upcoming note needs a higher
// fret, so a real note is never clipped out of view.
const FRESH_FRETBOARD_FRET_COUNT = 12;

// Standard guitar neck inlay positions — single dots at 3/5/7/9, double dot
// at 12 (octave), then the same pattern repeats shifted an octave up.
const SINGLE_INLAY_FRETS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_INLAY_FRETS = new Set([12, 24]);

interface FretNote {
  string: number; // 1-based, 1 = highest string
  fret: number;
}

function toFretNotes(beat?: TabBeat): FretNote[] {
  if (!beat || beat.rest) return [];
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
  // Fills the middle panel's width by default instead of a small fixed cap —
  // pass a smaller value (e.g. the rail layout's 760) only to compare sizes.
  maxWidth = '100%',
}: {
  tuningMidi: number[];
  tuningNotes: string[];
  activeNotes: FretNote[];
  upcomingNotes: FretNote[];
  // Layout-comparison toggle (rail variant) passes a smaller pixel value to
  // see whether less width is worth it (kept as a size comparison knob).
  maxWidth?: number | string;
}) {

  // FRESH_FRETBOARD_FRET_COUNT is the highest fret shown by default (fret 0
  // is always rendered too, so the default column count is one more than
  // this) — but never clip a real note out of view, extend past it when the
  // current or next beat actually reaches further up the neck.
  const neededFretCount = useMemo(() => {
    const frets = [...activeNotes, ...upcomingNotes].map((n) => n.fret);
    return Math.max(FRESH_FRETBOARD_FRET_COUNT + 1, ...frets.map((f) => f + 1));
  }, [activeNotes, upcomingNotes]);
  const frets = useMemo(() => Array.from({ length: neededFretCount }, (_, f) => f), [neededFretCount]);

  return (
    <div
      data-testid="song-study-fretboard"
      role="img"
      aria-label={`Fretboard. Active: ${activeNotes.map(n => `string ${n.string} fret ${n.fret}`).join(", ") || "rest"}. Upcoming: ${upcomingNotes.map(n => `string ${n.string} fret ${n.fret}`).join(", ") || "rest"}.`}
      style={{
        background: 'var(--neck-bg)',
        border: '1px solid var(--border-primary)',
        borderRadius: 12,
        overflowX: 'auto',
        padding: 6,
        width: '100%',
        maxWidth,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `28px repeat(${frets.length},minmax(22px,1fr))` }}>
        <span />
        {frets.map((f) => (
          <span key={f} style={{ fontSize: 8, color: 'var(--text-secondary)', textAlign: 'center', fontWeight: 800 }}>
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
            <div style={{ fontSize: 8, fontWeight: 900, color: 'var(--text-secondary)', textAlign: 'center' }}>
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
                    borderLeft: '1px solid var(--border-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px solid var(--neck-line)' }}
                  />
                  {label && (
                    <span
                      data-testid={isActive ? 'fretboard-active-note' : 'fretboard-upcoming-note'}
                      data-string={stringNumber}
                      data-fret={fret}
                      style={{
                        position: 'relative',
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 7,
                        fontWeight: 900,
                        background: isActive ? 'var(--root-fill)' : 'transparent',
                        color: isActive ? 'var(--root-text)' : 'var(--note-text)',
                        border: '1px solid var(--note-stroke)',
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
      <div
        aria-hidden="true"
        style={{ display: 'grid', gridTemplateColumns: `28px repeat(${frets.length},minmax(22px,1fr))`, height: 10 }}
      >
        <span />
        {frets.map((fret) => (
          <div key={fret} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            {DOUBLE_INLAY_FRETS.has(fret) ? (
              <>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--neck-line)' }} />
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--neck-line)' }} />
              </>
            ) : SINGLE_INLAY_FRETS.has(fret) ? (
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--neck-line)' }} />
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 9, color: 'var(--text-secondary)' }}>
        <span>● active beat</span>
        <span>○ upcoming beat</span>
      </div>
    </div>
  );
}

// --- Overview: section-grouped, compressed measure map. Sticky vertical
// rail (see SongStudyWorkspace) — click a section header to jump to its
// first measure, click a measure tile to jump there, shift-click to pick a
// range. Only the section containing the focused measure expands its
// measure grid; everything else collapses to just its header so the whole
// song's sections fit in the sidebar without dominating it. ---

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
      style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' }}
    >
      {sections.map((section) => {
        const isCurrentSection = focusMeasureIndex >= section.startIndex && focusMeasureIndex <= section.endIndex;
        const collapsed = !isCurrentSection;
        return (
        <div
          key={section.startIndex}
          data-testid="song-study-overview-section"
          style={{
            flex: '0 0 auto',
            border: '1px solid var(--border-primary)',
            borderColor: isCurrentSection ? 'var(--accent-500)' : 'var(--border-primary)',
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
              backgroundColor: isCurrentSection ? 'rgba(16,185,129,0.12)' : 'var(--bg-secondary)',
              borderBottom: collapsed ? 0 : '1px solid var(--border-primary)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {section.label}
          </button>
          {!collapsed && (
          <div
            role="group"
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
                    aria-label={`Select measure ${idx + 1}`}
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
          )}
        </div>
        );
      })}
    </div>
  );
}

// --- Search: find a song, pick a track, open (or create) its SongStudy ---

export interface SongSearchState {
  query: string;
  results: SongSearchResult[];
  searched: boolean;
  resultsQuery?: string;
}

export function SongStudySearch({ state, onStateChange, ensureSession, onSearch, onCreated }: {
  state: SongSearchState;
  onStateChange: React.Dispatch<React.SetStateAction<SongSearchState>>;
  ensureSession: () => Promise<{ sessionId: string; branchId: string }>;
  onSearch: (query: string) => void;
  onCreated: (artifact: SongStudyArtifact) => void;
}) {
  const { query, results, searched } = state;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searching || creatingKey || query.trim().length < 2) return;
    const submitted = query.trim();
    onStateChange(previous => ({ ...previous, results: [], searched: true, resultsQuery: submitted }));
    onSearch(submitted);
    setSearching(true);
    setSearchError(null);
    try {
      const data = await apiClient.searchSongs(submitted);
      if (mounted.current) onStateChange(previous => ({ ...previous, results: data.results, resultsQuery: submitted }));
    } catch (err) {
      if (mounted.current) setSearchError(String(err));
    } finally {
      if (mounted.current) setSearching(false);
    }
  };

  const handleSelectTrack = async (songId: number, trackIndex: number) => {
    const key = `${songId}:${trackIndex}`;
    setCreatingKey(key);
    setCreateError(null);
    try {
      const { sessionId, branchId } = await ensureSession();
      if (!mounted.current) return;
      const artifact = await apiClient.createSongStudy({
        session_id: sessionId,
        branch_id: branchId,
        song_id: songId,
        track_index: trackIndex,
      });
      if (mounted.current) onCreated(artifact);
    } catch (err) {
      if (mounted.current) setCreateError(String(err));
    } finally {
      if (mounted.current) setCreatingKey(null);
    }
  };

  return (
    <div data-testid="song-study-search" className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => onStateChange(previous => ({ ...previous, query: e.target.value, results: [], searched: false, resultsQuery: undefined }))}
          aria-label="Search songs"
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
          disabled={searching || creatingKey !== null || query.trim().length < 2}
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

      {searched && !searching && !searchError && results.length === 0 && <p role="status">No songs found. Try another song or artist.</p>}
      <div className="space-y-2">
        {results.map((song) => {
          const guitarTracks: TrackSummary[] = [];
          const otherTracks: TrackSummary[] = [];
          for (const track of song.tracks) {
            const isGuitar = !track.is_vocal && !/\b(vocals?|voice)\b/i.test(track.name) && /\bguitar\b/i.test(track.instrument) && !/\bbass\b/i.test(track.instrument);
            (isGuitar ? guitarTracks : otherTracks).push(track);
          }
          const renderTrack = (track: TrackSummary) => {
            const key = `${song.song_id}:${track.index}`;
            return (
                <button
                  key={track.index}
                  type="button"
                  data-testid="song-study-track-option"
                  disabled={creatingKey !== null}
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
            };
            return (
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
              {guitarTracks.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{guitarTracks.map(renderTrack)}</div>}
              {otherTracks.length > 0 && (
                <details className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <summary className="cursor-pointer py-2">Other tracks ({otherTracks.length})</summary>
                  <div className="flex flex-wrap gap-1.5 mt-1">{otherTracks.map(renderTrack)}</div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Workspace: overview + focused detail window, full-tab toggle, fretboard sync ---

export function SongStudyWorkspace({ songStudy, onSongStudyChange }: {
  songStudy: SongStudyArtifact;
  onSongStudyChange: (artifact: SongStudyArtifact) => void;
}) {
  const payload = songStudy.payload;
  const measures = useMemo(() => payload.tab_data.measures ?? [], [payload.tab_data.measures]);
  const measureCount = measures.length;

  const [focus, setFocus] = useState<SongFocus>(
    { measureIndex: 0, windowSize: DEFAULT_WINDOW_SIZE },
  );
  const [selection, setSelection] = useState<SongSelection | null>(null);
  // New selection objects represent learner gestures, including reselecting a beat.
  // Keep the fallback stable so playback highlights cannot trigger a seek.
  const videoSelection = useMemo<SongSelection>(() => selection ?? { type: 'range', startMeasureIndex: focus.measureIndex, endMeasureIndex: focus.measureIndex }, [selection, focus.measureIndex]);
  const [showFullTab, setShowFullTab] = useState(false);
  const [playbackSource, setPlaybackSource] = useState<'practice' | 'video'>('video');
  const [followVideo, setFollowVideo] = useState(true);
  const [videoPlayhead, setVideoPlayhead] = useState<VideoPosition | null>(null);
  const receiveVideoPosition = useCallback((position: VideoPosition | null, resumeFollowing = false) => {
    if (position || resumeFollowing) setFollowVideo(true);
    setVideoPlayhead(previous => previous?.passageId === position?.passageId && previous?.measureIndex === position?.measureIndex && previous?.beatIndex === position?.beatIndex ? previous : position);
  }, []);
  // Shape strip's per-card diagrams default off — the active shape's
  // diagram surfaces next to the fretboard instead (see activeShapeEvent).
  const [diagramsMinimized, setDiagramsMinimized] = useState(true);
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

  const practiceBeats = useMemo(() => {
    const start = selection?.type === 'range' ? selection.startMeasureIndex : selection?.type === 'beat' ? selection.measureIndex : focus.measureIndex;
    const end = selection?.type === 'range' ? selection.endMeasureIndex : start;
    return beatSequence.map((entry, sequenceIndex) => ({ ...entry, sequenceIndex }))
      .filter(entry => entry.measureIndex >= start && entry.measureIndex <= end);
  }, [beatSequence, selection, focus.measureIndex]);
  const practiceDurations = useMemo(() => {
    const durations = practiceBeats.map(entry => beatDuration(entry.beat));
    return durations.every((duration): duration is number => duration !== null) ? durations : [];
  }, [practiceBeats]);
  const guideSteps = useMemo(() => songDrill(payload, selection, focus), [payload, selection, focus]);
  const practice = usePractice(practiceDurations, 80, guideSteps);

  // Selection is local; saved ranges live on the artifact. The parent keys by artifact ID.

  const jumpToMeasure = useCallback(
    (measureIndex: number) => {
      if (practice.active) return;
      setFollowVideo(false);
      const clamped = Math.max(0, Math.min(measureCount - 1, measureIndex));
      const next: SongFocus = { measureIndex: clamped, windowSize: focus.windowSize };
      setFocus(next);
    },
    [measureCount, focus.windowSize, practice.active],
  );

  const selectRange = useCallback(
    (start: number, end: number, reveal = false) => {
      if (practice.active) return;
      setFollowVideo(false);
      const next: SongSelection = { type: 'range', startMeasureIndex: start, endMeasureIndex: end };
      setSelection(next);
      const nextFocus = { ...focus, measureIndex: start };
      if (reveal) setFocus(nextFocus);
    },
    [practice.active, focus],
  );

  const selectBeat = useCallback(
    (beatId: string) => {
      if (practice.active) return;
      const parsed = parseBeatId(beatId);
      if (!parsed) return;
      setFollowVideo(false);
      setFocus(current => parsed.measureIndex >= current.measureIndex && parsed.measureIndex < current.measureIndex + current.windowSize ? current : { ...current, measureIndex: parsed.measureIndex });
      const next: SongSelection = { type: 'beat', ...parsed };
      setSelection(next);
    },
    [practice.active],
  );

  const selectShape = useCallback(
    (source: SongShapeSource) => {
      if (practice.active) return;
      setFollowVideo(false);
      const nextSelection: SongSelection = {
        type: 'beat',
        measureIndex: source.measure_index,
        beatIndex: source.beat_index,
      };
      const nextFocus: SongFocus = { measureIndex: source.measure_index, windowSize: focus.windowSize };
      setSelection(nextSelection);
      setFocus(nextFocus);
    },
    [focus.windowSize, practice.active],
  );

  const selectedBeatIndex = useMemo(() => {
    if (selection?.type === 'beat') {
      return beatSequence.findIndex(
        (e) => e.measureIndex === selection.measureIndex && e.beatIndex === selection.beatIndex,
      );
    }
    return beatSequence.findIndex(
      (e) => e.measureIndex === focus.measureIndex && (e.beat.notes ?? []).some((n) => !n.rest && !n.dead),
    );
  }, [selection, beatSequence, focus.measureIndex]);

  const videoBeatIndex = videoPlayhead ? beatSequence.findIndex(beat => beat.measureIndex === videoPlayhead.measureIndex && beat.beatIndex === videoPlayhead.beatIndex) : -1;
  const activeBeatIndex = playbackSource === 'video' && followVideo ? videoBeatIndex : practice.active ? practiceBeats[Math.max(0, practice.position.index)]?.sequenceIndex ?? -1 : selectedBeatIndex;
  const nextBeatIndex = playbackSource === 'video' ? -1 : practice.active ? practice.position.next === null ? -1 : practiceBeats[practice.position.next]?.sequenceIndex ?? -1 : activeBeatIndex < 0 ? -1 : activeBeatIndex + 1;
  const displayMeasureIndex = (practice.active || playbackSource === 'video' && followVideo) && activeBeatIndex >= 0 ? beatSequence[activeBeatIndex].measureIndex : focus.measureIndex;

  const overviewSections = useMemo(() => buildOverviewSections(measures), [measures]);

  // Keeps the focused measure window scrolled to wherever keyboard nav lands.
  const ensureMeasureVisible = useCallback(
    (measureIndex: number) => {
      if (measureIndex < focus.measureIndex || measureIndex >= focus.measureIndex + focus.windowSize) {
        jumpToMeasure(measureIndex);
      }
    },
    [focus.measureIndex, focus.windowSize, jumpToMeasure],
  );

  const moveBeatSelection = useCallback(
    (direction: -1 | 1) => {
      if (beatSequence.length === 0) return;
      const sourceIndex = playbackSource === 'video' ? selectedBeatIndex : activeBeatIndex;
      const nextIndex = Math.max(0, Math.min(beatSequence.length - 1, sourceIndex + direction));
      if (nextIndex === sourceIndex) return;
      const next = beatSequence[nextIndex];
      selectBeat(`${next.measureIndex}:${next.beatIndex}`);
      ensureMeasureVisible(next.measureIndex);
    },
    [beatSequence, activeBeatIndex, selectedBeatIndex, playbackSource, selectBeat, ensureMeasureVisible],
  );

  const moveMeasureSelection = useCallback(
    (direction: -1 | 1) => {
      if (measureCount === 0) return;
      const sourceMeasureIndex = selection?.type === 'beat' ? selection.measureIndex : focus.measureIndex;
      const sourceBeatIndex = selection?.type === 'beat' ? selection.beatIndex : 0;
      const targetMeasureIndex = Math.max(0, Math.min(measureCount - 1, sourceMeasureIndex + direction));
      if (targetMeasureIndex === sourceMeasureIndex) return;

      const targetBeats = getBeatsFromMeasure(measures[targetMeasureIndex]);
      if (targetBeats.length === 0) {
        ensureMeasureVisible(targetMeasureIndex);
        return;
      }

      const targetBeatIndex = Math.min(sourceBeatIndex, targetBeats.length - 1);
      selectBeat(`${targetMeasureIndex}:${targetBeatIndex}`);
      ensureMeasureVisible(targetMeasureIndex);
    },
    [measureCount, selection, focus.measureIndex, measures, selectBeat, ensureMeasureVisible],
  );

  const moveSectionSelection = useCallback(
    (direction: -1 | 1) => {
      if (overviewSections.length === 0) return;
      const currentMeasureIndex = selection?.type === 'beat' ? selection.measureIndex : focus.measureIndex;
      const currentSectionIndex = overviewSections.findIndex(
        (section) => currentMeasureIndex >= section.startIndex && currentMeasureIndex <= section.endIndex,
      );
      const nextSectionIndex = Math.max(
        0,
        Math.min(overviewSections.length - 1, (currentSectionIndex < 0 ? 0 : currentSectionIndex) + direction),
      );
      if (nextSectionIndex === currentSectionIndex) return;

      const targetMeasureIndex = overviewSections[nextSectionIndex].startIndex;
      const targetBeats = getBeatsFromMeasure(measures[targetMeasureIndex]);
      if (targetBeats.length > 0) {
        selectBeat(`${targetMeasureIndex}:0`);
      }
      jumpToMeasure(targetMeasureIndex);
    },
    [overviewSections, selection, focus.measureIndex, measures, selectBeat, jumpToMeasure],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (
          target.isContentEditable ||
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT'
        ) {
          return;
        }
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveBeatSelection(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveBeatSelection(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (event.shiftKey) moveSectionSelection(-1);
        else moveMeasureSelection(-1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (event.shiftKey) moveSectionSelection(1);
        else moveMeasureSelection(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveBeatSelection, moveMeasureSelection, moveSectionSelection]);

  const activeNotes = activeBeatIndex >= 0 ? toFretNotes(beatSequence[activeBeatIndex].beat) : [];
  const upcomingNotes = activeBeatIndex >= 0 ? toFretNotes(beatSequence[nextBeatIndex]?.beat) : [];
  const activeBeat = activeBeatIndex >= 0 ? beatSequence[activeBeatIndex] : null;

  const trackTuningMidi = payload.track.tuning ?? payload.tab_data.tuning ?? null;
  const tuningNotes = useMemo(() => trackTuningMidi ? trackTuningMidi.map((midi) => midiToNoteName(midi)) : null, [trackTuningMidi]);
  const onTabBeatClick = useCallback((_beat: TabBeat, beatId: string) => selectBeat(beatId), [selectBeat]);

  const selectedBeatId = practice.active && activeBeat ? `${activeBeat.measureIndex}:${activeBeat.beatIndex}` : selection?.type === 'beat' ? `${selection.measureIndex}:${selection.beatIndex}` : null;
  const detailMeasures = measures.slice(displayMeasureIndex, displayMeasureIndex + focus.windowSize);
  const detailEndIndex = Math.min(displayMeasureIndex + focus.windowSize, measureCount) - 1;

  const fullTabRows = useMemo(() => buildFullTabRows(overviewSections).map(row => ({ ...row, measures: measures.slice(row.startIndex, row.endIndex + 1) })), [overviewSections, measures]);

  const shapeEvents = useMemo(() => {
    const start = playbackSource === 'video' ? displayMeasureIndex : selection?.type === 'range' ? selection.startMeasureIndex : focus.measureIndex;
    const end = playbackSource === 'video' ? Math.min(displayMeasureIndex + focus.windowSize, measureCount) - 1 : selection?.type === 'range'
      ? selection.endMeasureIndex
      : Math.min(focus.measureIndex + focus.windowSize, measureCount) - 1;
    return (payload.shape_events ?? [])
      .map((event) => ({
        ...event,
        sources: event.sources.filter((source) => source.measure_index >= start && source.measure_index <= end),
      }))
      .filter((event) => event.sources.length > 0);
  }, [payload.shape_events, selection, focus.measureIndex, focus.windowSize, measureCount, playbackSource, displayMeasureIndex]);

  // The shape strip defaults to compact cards (no per-card diagram); this is
  // the one diagram shown instead, next to the fretboard, for whichever
  // shape the active beat belongs to.
  const activeShapeEvent = useMemo(() => {
    if (!activeBeat) return null;
    return (
      shapeEvents.find((event) =>
        event.sources.some(
          (source) => source.measure_index === activeBeat.measureIndex && source.beat_index === activeBeat.beatIndex,
        ),
      ) ?? null
    );
  }, [shapeEvents, activeBeat]);

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
    <div data-testid="song-study-workspace" className={practice.focused ? "flex flex-col gap-4" : "flex flex-col xl:flex-row gap-4 items-start"} style={{ background: 'var(--bg-primary)' }}>
    <div className="song-study-content flex w-full flex-col gap-4 flex-1 min-w-0">
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
          <div className="flex gap-2 flex-wrap" style={{ display: practice.focused ? 'none' : undefined }}>

            <button
              type="button"
              data-testid="song-study-toggle-full-tab"
              disabled={practice.active}
              onClick={() => setShowFullTab((v) => !v)}
              className={headerButtonClass}
              style={headerButtonStyle}
            >
              {showFullTab ? 'Show overview + focus' : 'Show full tab'}
            </button>
          </div>
        </div>
      </div>

      <label className="text-sm flex flex-wrap items-center gap-2">Playback source<select aria-label="Playback source" className="music-button" value={playbackSource} onChange={event => {
        practice.exit(); setVideoPlayhead(null); setPlaybackSource(event.target.value as 'practice' | 'video');
      }}><option value="practice">Synthesized practice</option><option value="video">YouTube recording</option></select></label>
      <div className="flex flex-wrap items-start gap-2">
      <SaveToLibrary artifact={songStudy} onSaved={async () => { onSongStudyChange(await apiClient.getSongStudy(songStudy.id)); }} />
      {!practice.active && <ExerciseComposer sourceId={songStudy.id} revision={songStudy.updated_at} selection={selection ?? { type: 'range', startMeasureIndex: focus.measureIndex, endMeasureIndex: focus.measureIndex }} steps={songDrill(payload, selection, focus)} />}
      {playbackSource === 'practice' && <PracticeControls practice={practice} available={practiceDurations.length > 0} label="selection" />}
      </div>
      <div className={playbackSource === 'video' ? 'song-video-layout' : undefined}>
    <SongVideo song={songStudy} active={playbackSource === 'video'} selection={videoSelection} onChange={onSongStudyChange} onPosition={receiveVideoPosition} />
      <div className="song-study-score flex w-full flex-col gap-4 min-w-0">
      {!practiceDurations.length && <p className="text-xs">Rhythm data is unavailable for this selection; choose a timed passage to practice.</p>}
      {practice.active && <p data-testid="practice-song-position" className="text-sm text-[var(--text-secondary)]">{practice.position.count ? 'Get ready' : `Current: measure ${(activeBeat?.measureIndex ?? 0) + 1}, event ${(activeBeat?.beatIndex ?? 0) + 1}`}{nextBeatIndex >= 0 ? ` · Next: measure ${beatSequence[nextBeatIndex].measureIndex + 1}, event ${beatSequence[nextBeatIndex].beatIndex + 1}` : ''}</p>}
      {!showFullTab || practice.active ? (() => {
        // Local consts so the same focused-passage/shapes/fretboard JSX
        // renders inside the sticky rail layout below.
        const focusedPassageBlock = (
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
                  Measures {displayMeasureIndex + 1}–{detailEndIndex + 1}
                </h3>
                {activeBeatIndex >= 0 && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Beat {beatSequence[activeBeatIndex].beatIndex + 1} of M
                    {beatSequence[activeBeatIndex].measureIndex + 1} active
                  </p>
                )}
              </div>
              <div className="flex gap-2" style={{ display: practice.focused ? 'none' : undefined }}>
                <button
                  type="button"
                  data-testid="song-study-focus-prev"
                  disabled={practice.active || focus.measureIndex === 0}
                  onClick={() => jumpToMeasure(focus.measureIndex - focus.windowSize)}
                  className={headerButtonClass}
                  style={headerButtonStyle}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  data-testid="song-study-focus-next"
                  disabled={practice.active || detailEndIndex >= measureCount - 1}
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
              startMeasureIndex={displayMeasureIndex}
              selectedBeatId={selectedBeatId}
              playheadBeatId={playbackSource === 'video' && videoPlayhead ? `${videoPlayhead.measureIndex}:${videoPlayhead.beatIndex}` : null}
              followHorizontally={playbackSource === 'video'}
              activeMeasureIndex={displayMeasureIndex}
              selectedMeasureIndices={selectedMeasureIndices}
              onBeatClick={onTabBeatClick}
              tuningNotes={tuningNotes ?? undefined}
            />
          </div>
        );

        const shapeStripBlock = (
          <SongShapeStrip
            events={shapeEvents}
            selectedMeasureIndex={activeBeat?.measureIndex}
            selectedBeatIndex={activeBeat?.beatIndex}
            tuningAvailable={Boolean(trackTuningMidi)}
            onSelect={selectShape}
            minimized={diagramsMinimized}
            onToggleMinimized={() => setDiagramsMinimized((v) => !v)}
          />
        );

        const fretboardBlock = () => (
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <div className="w-full sm:flex-1 min-w-0">
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
                />
              ) : (
                <p role="status">No tuning data for this track — showing tab only.</p>
              )}
            </div>

            {diagramsMinimized && activeShapeEvent && (
              <div
                data-testid="active-shape-diagram"
                className="rounded-lg border p-2 flex flex-col items-center gap-1"
                style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}
              >
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  {activeShapeEvent.label ?? 'Active shape'}
                </span>
                <PhysicalChordDiagram
                  positions={activeShapeEvent.positions}
                  tuning={activeShapeEvent.tuning}
                  label={activeShapeEvent.label ?? undefined}
                />
              </div>
            )}
          </div>
        );

        return (
          <div data-testid="song-study-overview-focus" className="flex flex-col md:flex-row gap-4 items-start">
            {!practice.focused && (
              <div style={{ width: 200, flexShrink: 0, position: 'sticky', top: 12 }}>
                <MeasureOverviewStrip
                  sections={overviewSections}
                  focusMeasureIndex={displayMeasureIndex}
                  selection={selection}
                  onJump={(index) => selectRange(index, index, true)}
                  onRangeSelect={selectRange}
                  enrichedRanges={payload.enrichment?.ranges ?? []}
                />
              </div>
            )}
            <div className="flex w-full flex-col gap-3 flex-1 min-w-0">
              {focusedPassageBlock}
              {shapeStripBlock}
              {fretboardBlock()}
            </div>
          </div>
        );
      })() : (
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
                <MemoMeasureGroup
                  measures={row.measures}
                  startMeasureIndex={row.startIndex}
                  selectedBeatId={selection?.type === 'beat' && selection.measureIndex >= row.startIndex && selection.measureIndex <= row.endIndex ? selectedBeatId : null}
                  playheadBeatId={playbackSource === 'video' && videoPlayhead && videoPlayhead.measureIndex >= row.startIndex && videoPlayhead.measureIndex <= row.endIndex ? `${videoPlayhead.measureIndex}:${videoPlayhead.beatIndex}` : null}
                  followHorizontally={playbackSource === 'video'}
                  activeMeasureIndex={displayMeasureIndex >= row.startIndex && displayMeasureIndex <= row.endIndex ? displayMeasureIndex : undefined}
                  selectedMeasureIndices={selectedMeasureIndices}
                  onBeatClick={onTabBeatClick}
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
      <div hidden={practice.focused}><SongEnrichmentPanel
        songStudy={songStudy}
        onChange={onSongStudyChange}
        visibleStartMeasure={focus.measureIndex + 1}
        visibleEndMeasure={detailEndIndex + 1}
      /></div>

      <div hidden={practice.focused}><SongLearningMap key={songStudy.id} song={songStudy} selection={selection} measureIndex={focus.measureIndex}
        disabled={practice.active} onSelect={(start, end) => selectRange(start, end, true)} onChange={onSongStudyChange} /></div>
      </div>
      </div>

    </div>
    </div>
  );
}
