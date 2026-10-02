import type { CSSProperties } from 'react';
import { SongStudyTutor } from './SongStudyTutor';
import { SongVideo } from './SongVideo';
import type { VideoPosition } from './songVideoTiming';
import { SaveToLibrary } from './MyStuff';
import { ExerciseComposer } from './ExerciseComposer';
import { songPracticeMaterial } from './exerciseMaterial';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { midiToNoteName } from '../utils/tuning';
import { MeasureGroup } from '../components/TabViewer/MeasureGroup';
import { getBeatsFromMeasure } from '../utils/tab';
import { SongEnrichmentPanel } from './SongEnrichment';
import { SongShapeStrip } from './SongShapeStrip';
import { SongLearningMap } from './SongLearningMap';
import { buildSongSections, selectMeasureRange } from './songStudyNavigation';
import type { SongSection } from './songStudyNavigation';
import { usePractice } from './usePractice';
import { PracticeControls } from './PracticeControls';
import { useTutorDock } from './useTutorDock';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import type { SongSearchResult, TabBeat, TabNote, TrackSummary } from '../types';
import type { SongDerivedRange, SongFocus, SongSelection, SongShapeSource, SongStudyArtifact, V2Branch } from '../types/v2';
import './SongStudy.css';

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

const NOTE_TECHNIQUES: Array<[keyof TabNote, string]> = [
  ['slide', 'slide'], ['bend', 'bend'], ['hp', 'hammer-on / pull-off'],
  ['vibrato', 'vibrato'], ['harmonic', 'harmonic'], ['ghost', 'ghost note'],
  ['staccato', 'staccato'], ['accentuated', 'accent'],
];

function beatTechniques(beat?: TabBeat): string[] {
  if (!beat || beat.rest) return [];
  const notes = (beat.notes ?? []).filter(note => !note.rest && Number.isInteger(note.string) && note.string >= 0 && (note.dead || Number.isFinite(note.fret)));
  if (!notes.length) return [];
  const labels = notes.flatMap(note => {
    const techniques = note.dead ? ['muted note'] : NOTE_TECHNIQUES.filter(([key]) => note[key]).map(([, label]) => label);
    return techniques.length ? [`String ${note.string + 1}${note.dead ? '' : `, fret ${note.fret}`}: ${techniques.join(', ')}`] : [];
  });
  if (beat.palmMute) labels.push('Palm mute');
  if (beat.letRing) labels.push('Let ring');
  return labels;
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
const FULL_TAB_ROW_SIZE = DEFAULT_WINDOW_SIZE;

interface FullTabRow {
  sectionLabel: string;
  startIndex: number;
  endIndex: number; // inclusive
}

function buildFullTabRows(sections: SongSection[]): FullTabRow[] {
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
  activeTechniques,
  upcomingTechniques,
}: {
  tuningMidi: number[];
  tuningNotes: string[];
  activeNotes: FretNote[];
  upcomingNotes: FretNote[];
  activeTechniques: string[];
  upcomingTechniques: string[];
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
      aria-label={`Fretboard. Active: ${activeNotes.map(n => `string ${n.string} fret ${n.fret}`).join(", ") || "rest"}. Upcoming: ${upcomingNotes.map(n => `string ${n.string} fret ${n.fret}`).join(", ") || "rest"}.${activeTechniques.length ? ` Active techniques: ${activeTechniques.join("; ")}.` : ""}${upcomingTechniques.length ? ` Upcoming techniques: ${upcomingTechniques.join("; ")}.` : ""}`}
      style={{
        background: 'var(--neck-bg)',
        border: '1px solid var(--border-primary)',
        borderRadius: 12,
        overflowX: 'auto',
        padding: 6,
        width: '100%',
        maxWidth: '100%',
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
      {([['Active', activeTechniques], ['Upcoming', upcomingTechniques]] as const).map(([role, techniques]) => techniques.length > 0 && (
        <div key={role} data-testid={`fretboard-${role.toLowerCase()}-techniques`} style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
          <strong>{role === 'Active' ? '●' : '○'} {role}: </strong>{techniques.join(' · ')}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 9, color: 'var(--text-secondary)' }}>
        <span>● active beat</span>
        <span>○ upcoming beat</span>
      </div>
    </div>
  );
}

// Compact section and measure map above the score. Selection and playback
// remain separate signals; a bookmark marker only means "kept for later."

function MeasureOverviewStrip({
  sections,
  focusMeasureIndex,
  playheadMeasureIndex,
  selection,
  onJump,
  onRangeSelect,
  enrichedRanges,
  savedRanges,
  disabled,
  rangeMode,
  rangeAnchor,
  onRangeModeChange,
  onRangeAnchorChange,
}: {
  sections: SongSection[];
  focusMeasureIndex: number;
  playheadMeasureIndex?: number;
  selection: SongSelection | null;
  onJump: (measureIndex: number) => void;
  onRangeSelect: (start: number, end: number) => void;
  enrichedRanges: SongDerivedRange[];
  savedRanges: SongStudyArtifact['payload']['saved_ranges'];
  disabled: boolean;
  rangeMode: boolean;
  rangeAnchor: number | null;
  onRangeModeChange: (value: boolean) => void;
  onRangeAnchorChange: (value: number | null) => void;
}) {
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  const currentSection = sections.find(section => focusMeasureIndex >= section.startIndex && focusMeasureIndex <= section.endIndex) ?? sections[0];
  const selectionKey = selection?.type === 'range'
    ? `range:${selection.startMeasureIndex}:${selection.endMeasureIndex}`
    : selection?.type === 'beat'
      ? `beat:${selection.measureIndex}:${selection.beatIndex}`
      : `focus:${focusMeasureIndex}`;
  const rangeKey = (start: number, end: number) => `range:${start}:${end}`;
  const [page, setPage] = useState({ sectionStart: -1, start: 0, selectionKey: '' });

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const update = () => setPhone(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  if (!currentSection) return null;

  const focusPageStart = Math.floor((focusMeasureIndex - currentSection.startIndex) / 4) * 4 + currentSection.startIndex;
  const pageStart = page.sectionStart === currentSection.startIndex && page.selectionKey === selectionKey ? page.start : focusPageStart;
  const pageEnd = Math.min(pageStart + 3, currentSection.endIndex);
  const visibleStart = phone ? pageStart : currentSection.startIndex;
  const visibleEnd = phone ? pageEnd : currentSection.endIndex;
  const selectedStart = selection?.type === 'range' ? selection.startMeasureIndex : selection?.type === 'beat' ? selection.measureIndex : focusMeasureIndex;
  const selectedEnd = selection?.type === 'range' ? selection.endMeasureIndex : selectedStart;

  const handleClick = (measureIndex: number, shiftKey: boolean) => {
    const extend = shiftKey || rangeMode && rangeAnchor !== null;
    const next = selectMeasureRange(rangeAnchor, measureIndex, extend);
    setPage({ sectionStart: currentSection.startIndex, start: Math.floor((measureIndex - currentSection.startIndex) / 4) * 4 + currentSection.startIndex, selectionKey: rangeKey(next.start, next.end) });
    onRangeAnchorChange(next.anchor);
    if (extend) {
      onRangeModeChange(false);
      onRangeSelect(next.start, next.end);
    } else {
      onJump(measureIndex);
    }
  };

  return (
    <nav data-testid="song-study-overview" className="song-measure-map" aria-label="Song sections and measures">
      <div className="song-section-jumps">
        {sections.map(section => {
          const current = section === currentSection;
          return <button key={section.startIndex} type="button" data-testid="song-study-overview-section"
            aria-label={section.label} aria-pressed={current} disabled={disabled}
            onClick={() => { setPage({ sectionStart: section.startIndex, start: section.startIndex, selectionKey: rangeKey(section.startIndex, section.endIndex) }); onRangeAnchorChange(section.startIndex); onRangeModeChange(false); onRangeSelect(section.startIndex, section.endIndex); }}>
            {section.label}<small>M{section.startIndex + 1}–{section.endIndex + 1}</small>
          </button>;
        })}
      </div>
      <div className="song-measure-navigation">
        <button type="button" className="song-measure-page" data-testid="song-measure-page-previous" aria-label="Previous measures"
          disabled={disabled || pageStart <= currentSection.startIndex} onClick={() => setPage({ sectionStart: currentSection.startIndex, start: Math.max(currentSection.startIndex, pageStart - 4), selectionKey })}>‹</button>
        <div className="song-measure-grid" role="group" aria-label={`${currentSection.label} measures`}>
          {Array.from({ length: visibleEnd - visibleStart + 1 }, (_, index) => visibleStart + index).map(measureIndex => {
            const kept = (savedRanges ?? []).some(range => measureIndex + 1 >= range.start_measure && measureIndex + 1 <= range.end_measure);
            const enriched = enrichedRanges.some(range => measureIndex + 1 >= range.start_measure && measureIndex + 1 <= range.end_measure);
            const selected = measureIndex >= selectedStart && measureIndex <= selectedEnd;
            return <button key={measureIndex} type="button" data-testid="song-study-overview-measure" data-measure-index={measureIndex}
              aria-label={`Select measure ${measureIndex + 1}${kept ? ', kept passage' : ''}`}
              aria-pressed={selected} aria-current={measureIndex === playheadMeasureIndex ? 'location' : undefined}
              disabled={disabled} onClick={event => handleClick(measureIndex, event.shiftKey)}
              title={`Measure ${measureIndex + 1} · shift-click to extend selection`}>
              {measureIndex + 1}
              {kept && <span className="song-measure-kept" aria-hidden="true" />}
              {enriched && <span className="song-measure-enriched" data-testid="song-study-enrichment-marker" aria-hidden="true" />}
            </button>;
          })}
        </div>
        <button type="button" className="song-measure-page" data-testid="song-measure-page-next" aria-label="Next measures"
          disabled={disabled || pageEnd >= currentSection.endIndex} onClick={() => setPage({ sectionStart: currentSection.startIndex, start: Math.min(currentSection.endIndex, pageStart + 4), selectionKey })}>›</button>
      </div>
    </nav>
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

export function SongStudyWorkspace({ songStudy, onSongStudyChange, ensureTutor }: {
  songStudy: SongStudyArtifact;
  onSongStudyChange: (artifact: SongStudyArtifact) => void;
  ensureTutor: () => Promise<V2Branch>;
}) {
  const payload = songStudy.payload;
  const measures = useMemo(() => payload.tab_data.measures ?? [], [payload.tab_data.measures]);
  const measureCount = measures.length;

  const [focus, setFocus] = useState<SongFocus>(
    { measureIndex: 0, windowSize: DEFAULT_WINDOW_SIZE },
  );
  const [selection, setSelection] = useState<SongSelection | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const {
    open: tutorOpen,
    setOpen: setTutorOpen,
    width: tutorWidth,
    setWidth: setTutorWidth,
    compact: tutorCompact,
    triggerRef: tutorTriggerRef,
  } = useTutorDock();
  const tutorDock = { open: tutorOpen, setOpen: setTutorOpen, width: tutorWidth, setWidth: setTutorWidth, compact: tutorCompact, triggerRef: tutorTriggerRef };
  const [mobileView, setMobileView] = useState<'score' | 'fretboard'>('score');
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
  const { sequence: beatSequence, selectedBeats: practiceBeats, durations: practiceDurations, steps: guideSteps } = useMemo(
    () => songPracticeMaterial(payload, selection, focus), [payload, selection, focus],
  );
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
  const nextBeatIndex = practice.active ? practice.position.next === null ? -1 : practiceBeats[practice.position.next]?.sequenceIndex ?? -1 : activeBeatIndex < 0 ? -1 : activeBeatIndex + 1;
  const displayMeasureIndex = (practice.active || playbackSource === 'video' && followVideo) && activeBeatIndex >= 0 ? beatSequence[activeBeatIndex].measureIndex : focus.measureIndex;

  const overviewSections = useMemo(() => buildSongSections(measures), [measures]);
  const currentSection = overviewSections.find(section => focus.measureIndex >= section.startIndex && focus.measureIndex <= section.endIndex) ?? overviewSections[0];

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
    <div data-testid="song-study-workspace" className="song-study-workspace" data-practice-focused={practice.focused}
      style={{ '--tutor-width': `${tutorWidth}px` } as CSSProperties}>
      <header className="song-study-header">
        <div className="song-study-heading">
          <h1 data-testid="song-study-title">{payload.title} <span>— {payload.artist}</span></h1>
          <p>{payload.track.name} · {payload.track.instrument} · {measureCount} measures</p>
        </div>
        <div className="song-study-header-actions" hidden={practice.focused}>
          <button type="button" data-testid="song-study-toggle-full-tab" disabled={practice.active}
            onClick={() => { setShowFullTab(value => !value); setMobileView('score'); }} className="music-button">
            {showFullTab ? 'Focused passage' : 'Full Tab'}
          </button>
          <details className="song-study-actions">
            <summary className="music-button">Song actions</summary>
            <div>
              <SaveToLibrary artifact={songStudy} onSaved={async () => { onSongStudyChange(await apiClient.getSongStudy(songStudy.id)); }} />
              {!practice.active && <details><summary>Create a separate practice drill</summary>
                <ExerciseComposer sourceId={songStudy.id} revision={songStudy.updated_at}
                  selection={selection ?? { type: 'range', startMeasureIndex: focus.measureIndex, endMeasureIndex: focus.measureIndex }} steps={guideSteps} />
              </details>}
            </div>
          </details>
          <button ref={tutorTriggerRef} type="button" className="music-button" aria-controls="workspace-tutor" aria-expanded={tutorOpen}
            onClick={() => setTutorOpen(value => !value)}>Tutor</button>
        </div>
      </header>

      <div className="song-study-desk" data-companion={!practice.focused && (playbackSource === 'video' || tutorOpen)}>
        <section className="song-study-stage" data-mobile-view={mobileView} aria-label="Song music">
          <div className="song-study-practice-bar">
            <label>Playback <select aria-label="Playback source" className="music-button" value={playbackSource} onChange={event => {
              practice.exit(); setVideoPlayhead(null); setPlaybackSource(event.target.value as 'practice' | 'video');
            }}><option value="practice">Guitar guide</option><option value="video">Recording</option></select></label>
            {playbackSource === 'practice' && <PracticeControls practice={practice} available={practiceDurations.length > 0} label="selection" />}
          </div>
          <div className="song-study-mobile-view" role="group" aria-label="Song view">
            <button type="button" className="music-button" aria-pressed={mobileView === 'score'} onClick={() => setMobileView('score')}>Score</button>
            <button type="button" className="music-button" aria-pressed={mobileView === 'fretboard'} onClick={() => { setShowFullTab(false); setMobileView('fretboard'); }}>Fretboard</button>
          </div>
          {!practice.focused && <MeasureOverviewStrip sections={overviewSections} focusMeasureIndex={focus.measureIndex}
            playheadMeasureIndex={videoPlayhead?.measureIndex} selection={selection}
            onJump={index => selectRange(index, index, true)} onRangeSelect={(start, end) => selectRange(start, end, true)}
            enrichedRanges={payload.enrichment?.ranges ?? []} savedRanges={payload.saved_ranges} disabled={practice.active}
            rangeMode={rangeMode} rangeAnchor={rangeAnchor} onRangeModeChange={setRangeMode} onRangeAnchorChange={setRangeAnchor} />}
          {!practice.focused && <SongLearningMap key={songStudy.id} song={songStudy} selection={selection} measureIndex={focus.measureIndex}
            sectionLabel={currentSection?.label ?? 'Passage'} disabled={practice.active}
            rangeMode={rangeMode} rangeAnchor={rangeAnchor} onToggleRange={() => { setRangeMode(value => !value); setRangeAnchor(null); }}
            onSelect={(start, end) => selectRange(start, end, true)} onChange={onSongStudyChange} />}
          <div className="song-study-score">
      {!practiceDurations.length && <p className="text-xs">Rhythm data is unavailable for this selection; choose a timed passage to practice.</p>}
      {practice.active && <p data-testid="practice-song-position" className="text-sm text-[var(--text-secondary)]">{practice.position.count ? 'Get ready' : `Current: measure ${(activeBeat?.measureIndex ?? 0) + 1}, event ${(activeBeat?.beatIndex ?? 0) + 1}`}{nextBeatIndex >= 0 ? ` · Next: measure ${beatSequence[nextBeatIndex].measureIndex + 1}, event ${beatSequence[nextBeatIndex].beatIndex + 1}` : ''}</p>}
      {!showFullTab || practice.active ? (() => {
        const focusedPassageBlock = (
          <div className="song-study-score-view flex flex-col gap-3">
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
          <div className="song-study-fretboard-row flex flex-col gap-3 items-start">
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
                  activeTechniques={beatTechniques(beatSequence[activeBeatIndex]?.beat)}
                  upcomingTechniques={beatTechniques(activeBeatIndex >= 0 ? beatSequence[nextBeatIndex]?.beat : undefined)}
                />
              ) : (
                <p role="status">No tuning data for this track — showing tab only.</p>
              )}
            </div>
          </div>
        );

        return (
          <div data-testid="song-study-overview-focus" className="song-study-music-rows">
            {focusedPassageBlock}
            <div className="song-study-fretboard-view">
              {fretboardBlock()}
              <details className="song-shapes-details">
                <summary>Shapes in this passage · {shapeEvents.length}</summary>
                {shapeStripBlock}
                {diagramsMinimized && activeShapeEvent && <div data-testid="active-shape-diagram"
                  className="rounded-lg border p-2 flex flex-col items-center gap-1"
                  style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{activeShapeEvent.label ?? 'Active shape'}</span>
                  <PhysicalChordDiagram positions={activeShapeEvent.positions} tuning={activeShapeEvent.tuning}
                    label={activeShapeEvent.label ?? undefined} />
                </div>}
              </details>
            </div>
          </div>
        );
      })() : (
        // Full Tab: dense, continuous whole-song reader. No permanent
        // fretboard here (mock #full: "remove the permanent fretboard...
        // give the tab the width"). A selection surfaces a dock with a
        // bridge back into Overview + Focus on exactly that range.
        <div className="song-study-score-view flex flex-col gap-3">
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
          </div>
        </section>
        <aside className="song-study-companion" hidden={practice.focused || (playbackSource !== 'video' && !tutorOpen)}>
          <SongVideo song={songStudy} active={playbackSource === 'video'} pauseWhenCovered={tutorOpen && tutorCompact}
            selection={videoSelection} onSelectRange={(start, end) => selectRange(start, end, true)}
            onChange={onSongStudyChange} onPosition={receiveVideoPosition} />
          <SongStudyTutor song={songStudy} selection={videoSelection} ensureBranch={ensureTutor} dock={tutorDock} />
        </aside>
      </div>
    </div>
  );
}
