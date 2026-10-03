import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { apiClient } from '../api/client';
import type { SongSelection, SongStudyArtifact } from '../types/v2';
import type { SongVideoAlignment, SongVideoAnchor, SongVideoSuggestions } from '../types/songVideo';
import { YouTubePlayer } from './YouTubePlayer';
import type { YouTubeControls, YouTubeState } from './YouTubePlayer';
import { buildScoreTimeline, parseYouTubeId, selectionBoundaries, selectionVideoRanges, validatePassages, videoPosition } from './songVideoTiming';
import type { VideoPosition, VideoRange } from './songVideoTiming';
import './SongVideo.css';

const timeLabel = (seconds: number) => {
  const tenths = Math.round(seconds * 10);
  return `${Math.floor(tenths / 600)}:${((tenths % 600) / 10).toFixed(1).padStart(4, '0')}`;
};
const anchorLabel = (anchor: SongVideoAnchor) => `M${anchor.measure_index + 1}, beat ${anchor.beat_index + 1} ${anchor.edge} · ${timeLabel(anchor.video_seconds)}`;

type PlayerBounds = { left: number; top: number; width: number; height: number };
type RecordingView = 'player' | 'sync' | 'change';
const PLAYER_EDGE = 12;
const PLAYER_MIN_WIDTH = 296;
const PLAYER_MIN_HEIGHT = 350;

function fitPlayer(bounds: PlayerBounds): PlayerBounds {
  const availableWidth = Math.max(0, window.innerWidth - PLAYER_EDGE * 2);
  const availableHeight = Math.max(0, window.innerHeight - PLAYER_EDGE * 2);
  const minimumWidth = Math.min(PLAYER_MIN_WIDTH, availableWidth);
  const minimumHeight = Math.min(PLAYER_MIN_HEIGHT, availableHeight);
  const width = Math.max(minimumWidth, Math.min(bounds.width, availableWidth));
  const height = Math.max(minimumHeight, Math.min(bounds.height, availableHeight));
  return {
    width,
    height,
    left: Math.max(PLAYER_EDGE, Math.min(bounds.left, window.innerWidth - width - PLAYER_EDGE)),
    top: Math.max(PLAYER_EDGE, Math.min(bounds.top, window.innerHeight - height - PLAYER_EDGE)),
  };
}

export function SongVideo({ song, active, pauseWhenCovered, selection, onSelectRange, onChange, onPosition }: {
  song: SongStudyArtifact;
  active: boolean;
  pauseWhenCovered: boolean;
  selection: SongSelection;
  onSelectRange(start: number, end: number): void;
  onChange(song: SongStudyArtifact): void;
  onPosition(position: VideoPosition | null, resumeFollowing?: boolean): void;
}) {
  const initial = song.payload.video_alignment ?? null;
  const [draft, setDraft] = useState<SongVideoAlignment | null>(initial);
  const baseline = useRef(initial);
  const revision = useRef(song.updated_at);
  const [history, setHistory] = useState<Array<SongVideoAlignment | null>>([]);
  const [suggestions, setSuggestions] = useState<SongVideoSuggestions | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionAttempt, setSuggestionAttempt] = useState(0);
  const [view, setView] = useState<RecordingView>(initial ? 'player' : 'change');
  const [duration, setDuration] = useState<number | null>(null);
  const autoSelect = useRef(!initial);
  const receiveSuggestions = useEffectEvent((result: SongVideoSuggestions) => {
    setSuggestions(result); setSuggestionError(null);
    if (autoSelect.current && result.candidates.length > 0) attachId(result.candidates[0].video_id, result.candidates[0].timing);
  });
  const discover = active && (!draft || view === 'change');
  useEffect(() => {
    if (!active) autoSelect.current = false;
    if (!discover) return;
    let cancelled = false;
    apiClient.getSongVideoSuggestions(song.id).then(result => {
      if (!cancelled) receiveSuggestions(result);
    }).catch(cause => { if (!cancelled) setSuggestionError(cause instanceof Error ? cause.message : 'Please try again.'); });
    return () => { cancelled = true; };
  }, [active, discover, song.id, suggestionAttempt]);
  const [open, setOpen] = useState(false);
  const [bounds, setBounds] = useState<PlayerBounds | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ x: number; y: number; bounds: PlayerBounds; resize: boolean } | null>(null);
  const [url, setUrl] = useState('');
  const [occurrence, setOccurrence] = useState('');
  const [anchorIndex, setAnchorIndex] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<YouTubeState>('loading');
  const [seconds, setSeconds] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState({ rate: 1, available: [1] });
  const [loop, setLoop] = useState(false);
  const [startTime, setStartTime] = useState('');
  const timingEnabled = Boolean(draft && (draft.recording_confirmed || draft.timing_source));
  const firstAnchor = useMemo(() => draft?.passages.flatMap(p => p.anchors).reduce<SongVideoAnchor | null>((first, anchor) => !first || anchor.video_seconds < first.video_seconds ? anchor : first, null) ?? null, [draft]);
  const firstTime = firstAnchor?.video_seconds ?? Infinity;
  const player = useRef<YouTubeControls>(null);
  const panel = useRef<HTMLElement>(null);
  const live = useRef(true);
  const reportedTime = useRef<number | null>(null);
  const playingState = useRef<YouTubeState>('loading');
  const playingRange = useRef<(VideoRange & { loop: boolean; seeking: boolean }) | null>(null);
  const lastPosition = useRef('');
  const previousSample = useRef<{ time: number; at: number } | null>(null);
  const pausedForTutor = useRef(false);
  const timeline = useMemo(() => buildScoreTimeline(song.payload.tab_data.measures ?? []), [song.payload.tab_data.measures]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline.current);
  const passage = draft?.passages.find(p => p.id === occurrence) ?? (draft?.passages.length === 1 ? draft.passages[0] : null);
  const ranges = useMemo(() => selectionVideoRanges(timeline, draft?.passages ?? [], selection), [timeline, draft, selection]);
  const range = occurrence ? ranges.find(r => r.id === occurrence) : ranges.length === 1 ? ranges[0] : null;
  const points = selectionBoundaries(timeline, selection);
  const selectedStart = selection.type === 'beat' ? selection.measureIndex : selection.startMeasureIndex;
  const selectedEnd = selection.type === 'beat' ? selection.measureIndex : selection.endMeasureIndex;
  const measureCount = song.payload.tab_data.measures?.length ?? 0;
  const selectionLabel = selection.type === 'beat' ? `M${selectedStart + 1} · beat ${selection.beatIndex + 1}`
    : selectedStart === selectedEnd ? `M${selectedStart + 1} (whole measure)` : `M${selectedStart + 1}–${selectedEnd + 1}`;
  const previousSelection = useRef(selection);
  const followSelection = useEffectEvent(() => {
    if (!active || !['playing', 'buffering'].includes(playingState.current)) return;
    if (!ready || !range || !timingEnabled) {
      clearPlayback();
      return;
    }
    playSelection();
  });
  useEffect(() => {
    if (previousSelection.current === selection) return;
    previousSelection.current = selection;
    followSelection();
  }, [selection]);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  useEffect(() => {
    const fit = () => setBounds(current => current && fitPlayer(current));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (!active) return;
    const nativeControls = () => {
      if (document.activeElement === panel.current?.querySelector('iframe')) playingRange.current = null;
    };
    window.addEventListener('blur', nativeControls);
    return () => window.removeEventListener('blur', nativeControls);
  }, [active]);

  useLayoutEffect(() => {
    if (!active || !pauseWhenCovered) return;
    pausedForTutor.current = playingState.current === 'playing' || playingState.current === 'buffering';
    player.current?.pause();
  }, [active, pauseWhenCovered]);

  useLayoutEffect(() => {
    panel.current?.querySelector('.song-video-body')?.scrollTo(0, 0);
  }, [view]);

  function closeRecording() {
    player.current?.pause();
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  function startGesture(event: ReactPointerEvent<HTMLButtonElement>, resize: boolean) {
    if (event.button !== 0 || !panel.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { x: event.clientX, y: event.clientY, bounds: panel.current.getBoundingClientRect(), resize };
  }
  function moveGesture(event: ReactPointerEvent<HTMLButtonElement>) {
    const from = gesture.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    const { left, top, width, height } = from.bounds;
    setBounds(fitPlayer(from.resize
      ? { left, top, width: Math.min(width + dx, window.innerWidth - left - PLAYER_EDGE), height: Math.min(height + dy, window.innerHeight - top - PLAYER_EDGE) }
      : { left: left + dx, top: top + dy, width, height }));
  }
  function keyAdjust(event: ReactKeyboardEvent<HTMLButtonElement>, resize: boolean) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key) || !panel.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Home') { setBounds(null); return; }
    const step = event.shiftKey ? 48 : 16;
    const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
    const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
    const { left, top, width, height } = panel.current.getBoundingClientRect();
    setBounds(fitPlayer(resize
      ? { left, top, width: Math.min(width + dx, window.innerWidth - left - PLAYER_EDGE), height: Math.min(height + dy, window.innerHeight - top - PLAYER_EDGE) }
      : { left: left + dx, top: top + dy, width, height }));
  }
  const handleEvents = (resize: boolean) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => startGesture(event, resize),
    onPointerMove: moveGesture,
    onPointerUp: () => { gesture.current = null; },
    onPointerCancel: () => { gesture.current = null; },
    onLostPointerCapture: () => { gesture.current = null; },
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => keyAdjust(event, resize),
    onDoubleClick: () => setBounds(null),
  });

  useEffect(() => {
    if (!active || !open || pauseWhenCovered) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector(':popover-open')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeRecording();
    };
    document.addEventListener('keydown', dismiss, true);
    return () => document.removeEventListener('keydown', dismiss, true);
  }, [active, open, pauseWhenCovered]);

  function clearPlayback() {
    player.current?.pause();
    playingRange.current = null;
    lastPosition.current = '';
    onPosition(null);
  }
  function change(next: SongVideoAlignment | null) {
    autoSelect.current = false;
    clearPlayback();
    if (!dirty) revision.current = song.updated_at;
    setHistory(previous => [...previous.slice(-49), draft]);
    setDraft(next);
    setError(null);
    setNotice('');
  }
  function attach() {
    const id = parseYouTubeId(url);
    if (!id) { setError('Enter a YouTube video link or its eleven-character video ID. Playlists and other sites are not supported.'); return; }
    attachId(id, suggestions?.estimated_timing);
  }
  function attachId(id: string, timing?: SongVideoSuggestions['candidates'][number]['timing']) {
    const validTiming = timing && !validatePassages(timeline, timing.passages) ? timing : null;
    change({ video_id: id, recording_confirmed: false, ...(validTiming ? { timing_source: validTiming.source } : {}), passages: validTiming?.passages ?? [{ id: crypto.randomUUID(), label: 'Occurrence 1', anchors: [] }] });
    setStartTime('');
    setOccurrence('');
    setAnchorIndex('');
    setUrl('');
    setSeconds(null);
    setDuration(null);
    setView(validTiming ? 'player' : 'sync');
  }
  function editAnchor(edge: 'start' | 'end', replace = false) {
    if (!draft || !passage || !points) { setError('Select a score beat or range and choose an occurrence first.'); return; }
    const now = player.current?.getCurrentTime();
    const duration = player.current?.getDuration();
    if (!ready || now == null || !Number.isFinite(now) || now < 0 || duration != null && now > duration) { setError('Wait for a valid video time, then pause at the boundary.'); return; }
    if (playingState.current === 'playing' || playingState.current === 'buffering') { setError('Pause the video before marking a boundary.'); return; }
    const selectedAnchor = replace ? passage.anchors[Number(anchorIndex)] : null;
    const point = selectedAnchor ?? points[edge === 'start' ? 0 : 1];
    const anchor: SongVideoAnchor = { ...point, video_seconds: now };
    const anchors = passage.anchors.filter(a => !(a.measure_index === anchor.measure_index && a.beat_index === anchor.beat_index && a.edge === anchor.edge));
    anchors.push(anchor);
    anchors.sort((a, b) => a.measure_index - b.measure_index || a.beat_index - b.beat_index || Number(a.edge === 'end') - Number(b.edge === 'end'));
    const passages = draft.passages.map(p => p.id === passage.id ? { ...p, anchors } : p);
    const issue = validatePassages(timeline, passages);
    if (issue) { setError(issue); return; }
    change({ ...draft, passages });
    setAnchorIndex('');
  }
  function handleTime(time: number) {
    reportedTime.current = time;
    const length = player.current?.getDuration();
    setDuration(length != null && Number.isFinite(length) && length > 0 ? length : null);
    setSeconds(previous => previous !== null && Math.floor(previous * 10) === Math.floor(time * 10) ? previous : time);
    const sample = previousSample.current;
    const now = performance.now();
    previousSample.current = { time, at: now };
    const delta = sample ? time - sample.time : 0;
    const nativeSeek = sample && (delta < -0.25 || delta > Math.max(1, (now - sample.at) / 250 + 0.25)
      || playingState.current === 'paused' && Math.abs(delta) > 0.05);
    let currentRange = playingRange.current;
    // Actual seeks resume score following; our own seeks must not release a loop.
    if (currentRange && !currentRange.seeking && nativeSeek) {
      playingRange.current = null;
      currentRange = null;
    }
    if (currentRange?.seeking && Math.abs(time - currentRange.start) < 2) currentRange.seeking = false;
    if (currentRange?.loop && currentRange.end != null && playingState.current === 'playing'
      && time >= currentRange.end && !currentRange.seeking) {
      currentRange.seeking = true;
      player.current?.seek(currentRange.start);
      player.current?.play();
      return;
    }
    const position = timingEnabled && draft ? videoPosition(timeline, draft.passages, time) : null;
    const key = position ? `${position.passageId}:${position.measureIndex}:${position.beatIndex}` : '';
    if (key !== lastPosition.current || nativeSeek) { lastPosition.current = key; onPosition(position, true); }
  }
  function playSelection() {
    if (!ready || !range || !timingEnabled) return;
    panel.current?.querySelector('.song-video-body')?.scrollTo(0, 0);
    playingRange.current = { ...range, loop: loop && range.end !== null, seeking: true };
    player.current?.seek(range.start);
    player.current?.play();
  }
  async function save() {
    if (draft && !timingEnabled) { setError('Confirm that this recording matches the score arrangement before saving.'); return; }
    const issue = draft && (draft.passages.some(p => !p.label.trim()) ? 'Give each occurrence a name.' : validatePassages(timeline, draft.passages));
    if (issue) { setError(issue); return; }
    setBusy(true); setError(null);
    try {
      const saved = await apiClient.saveSongVideoAlignment(song.id, revision.current, draft);
      if (!live.current) return;
      baseline.current = saved.payload.video_alignment ?? null;
      revision.current = saved.updated_at;
      setDraft(baseline.current); setHistory([]); setNotice('Video setup saved to My Stuff.');
      onChange(saved);
    } catch (cause) {
      if (live.current) setError(`Could not save: ${cause instanceof Error ? cause.message : 'try again'}. Your draft is kept. Discard and reload to use the latest saved version.`);
    } finally { if (live.current) setBusy(false); }
  }
  async function discard() {
    autoSelect.current = false;
    clearPlayback(); setBusy(true); setError(null);
    try {
      const saved = await apiClient.getSongStudy(song.id);
      if (!live.current) return;
      baseline.current = saved.payload.video_alignment ?? null;
      revision.current = saved.updated_at;
      setDraft(baseline.current); setHistory([]); setOccurrence(''); setAnchorIndex(''); setNotice('Loaded the saved setup.');
      if (!baseline.current) setView('change');
      onChange(saved);
    } catch { if (live.current) setError('Could not reload. Your draft is kept; try again.'); }
    finally { if (live.current) setBusy(false); }
  }
  function undo() {
    const previous = history.at(-1) ?? null;
    clearPlayback();
    setDraft(previous);
    setHistory(entries => entries.slice(0, -1));
    setError(null);
    setAnchorIndex('');
    if (!previous) setView('change');
  }

  const editActions = <div className="song-video-actions">
    <button type="button" className="music-button" disabled={!history.length} onClick={undo}>Undo edit</button>
    <button type="button" className="music-button" disabled={!dirty} onClick={save}>{busy ? 'Saving…' : 'Save video setup'}</button>
    <button type="button" className="music-button" onClick={discard}>Discard and reload</button>
  </div>;

  const recordingInput = <details><summary>Paste a YouTube link instead</summary><form onSubmit={event => { event.preventDefault(); attach(); }}>
            <p>Use a finished recording, not an ongoing livestream.</p>
            <label>YouTube link or video ID<input aria-label="YouTube link or video ID" value={url} onChange={event => { autoSelect.current = false; setUrl(event.target.value); }} placeholder="https://www.youtube.com/watch?v=…" /></label>
            <button type="submit" className="music-button" disabled={!url.trim()}>{draft ? 'Replace recording and reset alignment' : 'Attach recording'}</button>
          </form></details>;
  const recordingChoices = <div className="song-video-suggestions" aria-label="Suggested recordings">
    <p>Recordings linked to this song on Songsterr. Preview and check the arrangement before confirming.</p>
    {draft && <p>Choosing another recording resets alignment. Undo restores it.</p>}
    {suggestionError ? <p role="alert">Recording suggestions unavailable: {suggestionError} <button type="button" className="music-button" onClick={() => { setSuggestionError(null); setSuggestions(null); setSuggestionAttempt(value => value + 1); }}>Retry recordings</button></p>
      : !suggestions ? <p role="status">Finding recordings…</p>
      : suggestions.candidates.length === 0 ? <p>No linked recordings found. You can paste a YouTube link below.</p>
      : <ul>{suggestions.candidates.map((candidate, index) => <li key={candidate.video_id}>
        <button type="button" className="music-button" disabled={candidate.video_id === draft?.video_id} onClick={() => attachId(candidate.video_id, candidate.timing)} aria-label={`Preview recording ${index + 1}: ${candidate.title}`}>{candidate.title}{candidate.video_id === draft?.video_id ? " · selected" : ""}</button>
        <p>{candidate.channel ? `${candidate.channel} · ` : ''}{candidate.kind === 'musicvideo' ? 'Music video' : candidate.kind} · {candidate.match_note}</p>
      </li>)}</ul>}
    {recordingInput}
  </div>;
  const scoreDuration = suggestions?.score_duration_seconds;
  const durationComparison = duration !== null && scoreDuration != null && scoreDuration > 0 && Number.isFinite(scoreDuration)
    ? `Video ${timeLabel(duration)} · written score estimate ${timeLabel(scoreDuration)} · ${Math.abs(duration - scoreDuration).toFixed(1)} seconds ${duration >= scoreDuration ? 'longer' : 'shorter'}.`
    : suggestions?.duration_note;

  const playReason = !ready ? 'Wait for the video to load, or retry the video if loading failed.'
    : !timingEnabled ? 'Confirm this recording matches the score, then mark where your selection starts.'
    : !range ? ranges.length > 1 ? 'Choose which occurrence to play.'
      : 'The selected start is unaligned. Pause the video where this measure or beat begins, then mark selection start.'
    : null;
  function shiftStart() {
    if (!draft || !Number.isFinite(firstTime)) return;
    const desired = Number(startTime);
    if (!startTime.trim() || !Number.isFinite(desired) || desired < 0) { setError('Enter a valid nonnegative start time.'); return; }
    const passages = draft.passages.map(p => ({ ...p, anchors: p.anchors.map(a => ({ ...a, video_seconds: a.video_seconds + desired - firstTime })) }));
    const issue = validatePassages(timeline, passages);
    if (issue) { setError(issue); return; }
    change({ ...draft, passages }); setStartTime('');
  }
  function openCalibration() {
    player.current?.pause();
    setView('sync');
    requestAnimationFrame(() => backButton.current?.focus());
  }

  if (!active) return null;
  return <>
    <button ref={trigger} type="button" className="music-button song-video-launcher" aria-label="Open recording"
      aria-haspopup="dialog" aria-controls="song-recording" aria-expanded={open && !pauseWhenCovered}
      disabled={pauseWhenCovered} onClick={() => {
        if (open) { closeRecording(); return; }
        setOpen(true);
        requestAnimationFrame(() => closeButton.current?.focus());
      }}>Recording <span aria-hidden="true">↗</span></button>
    <section ref={panel} id="song-recording" className="song-video" role="dialog" aria-label="Recording"
      hidden={!open || pauseWhenCovered} data-view={view} data-has-recording={Boolean(draft)}
      style={bounds ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, right: 'auto', bottom: 'auto' } : undefined}>
    <header className="song-video-heading">
      <div className="song-video-heading-main">
      {view !== 'player' && draft && <button ref={backButton} type="button" className="song-video-back" onClick={() => setView('player')}>← Back</button>}
      <button type="button" className="song-video-move" aria-label="Move recording"
        title="Drag to move · arrow keys to adjust · Home or double-click to reset" {...handleEvents(false)}>
        <span aria-hidden="true">⠿</span><strong>{view === 'sync' ? 'Sync with score' : view === 'change' ? 'Change recording' : 'Recording'}</strong><small>{state === 'playing' ? 'Playing' : state === 'buffering' ? 'Buffering' : 'Paused'}</small>
      </button>
      </div>
      <div className="song-video-actions">
        {view === 'player' && <details className="song-video-menu"><summary aria-label="Recording options">•••</summary><div>
          <button type="button" onClick={event => { event.currentTarget.closest('details')!.open = false; openCalibration(); }}>Sync with score</button>
          <button type="button" onClick={event => { event.currentTarget.closest('details')!.open = false; player.current?.pause(); setView('change'); }}>Change recording</button>
        </div></details>}
        <button ref={closeButton} type="button" className="learning-text-button" aria-label="Close recording" onClick={closeRecording}>Close</button>
      </div>
    </header>
    <div className="song-video-body">
    <div className="song-video-primary" data-has-recording={Boolean(draft)}>
    {draft && <YouTubePlayer ref={player} videoId={draft.video_id} onReadyChange={value => {
      setReady(value);
      if (!value) { setDuration(null); setPlaybackRate({ rate: 1, available: [1] }); }
      if (!value) { playingRange.current = null; previousSample.current = null; lastPosition.current = ''; onPosition(null); }
    }}
      onTime={handleTime} onRateChange={(rate, available) => setPlaybackRate({ rate, available })} onStateChange={value => {
        playingState.current = value; setState(value);
        if (value === 'playing') {
          const time = player.current?.getCurrentTime();
          onPosition(timingEnabled && draft && time != null ? videoPosition(timeline, draft.passages, time) : null, true);
        }
      }} />}
    {view === 'player' && <div className="song-video-tools">
      {!pauseWhenCovered && pausedForTutor.current && <button type="button" className="music-button" data-testid="song-video-resume"
        onClick={() => { pausedForTutor.current = false; player.current?.play(); }}>Resume recording</button>}
      {draft && <>
        <div className="song-video-actions song-video-transport"><button type="button" className="music-button" aria-label="Play selection" disabled={playReason !== null} aria-describedby={playReason ? "song-video-play-reason" : undefined} onClick={playSelection}>Play</button>
          <label><input aria-label="Loop selection" type="checkbox" checked={loop} disabled={!range || range.end === null} onChange={event => { setLoop(event.target.checked); if (playingRange.current) playingRange.current.loop = event.target.checked && playingRange.current.end !== null; }} /> Loop</label>
          <select aria-label="Video speed" title="Only playback speeds supported by this YouTube video are available." value={playbackRate.rate} disabled={!ready || playbackRate.available.length < 2} onChange={event => player.current?.setPlaybackRate(Number(event.target.value))}>
            {playbackRate.available.map(rate => <option key={rate} value={rate}>{rate}×</option>)}
          </select></div>
        <div className="song-video-context"><span data-testid="video-selected-span">Selection: {selectionLabel}</span><span>{draft.timing_source === 'estimated' ? 'Estimated from score tempo' : draft.timing_source === 'songsterr' ? 'Songsterr timing' : draft.passages.some(item => item.anchors.length > 0) ? 'Timing calibrated' : 'Timing not set'}</span></div>
        <p className="song-video-status" data-testid="song-video-position">{state === 'buffering' ? 'Buffering · ' : ''}{!timingEnabled ? 'Confirm the arrangement to follow the score.' : lastPosition.current ? (() => {
          const position = videoPosition(timeline, draft.passages, reportedTime.current ?? -1);
          return position ? `Video: M${position.measureIndex + 1}, beat ${position.beatIndex + 1} · ${draft.passages.find(p => p.id === position.passageId)?.label}` : 'Unaligned video section';
        })() : 'Unaligned video section'}</p>
        {draft.passages.length > 1 && <label>Occurrence<select aria-label="Video occurrence" value={occurrence} onChange={event => { clearPlayback(); setOccurrence(event.target.value); setAnchorIndex(''); }}>
          <option value="">Choose occurrence</option>{draft.passages.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select></label>}
        <details className="song-video-range"><summary>Selection options</summary>
          <p>Select a beat while playing to jump. Loop repeats the selection.</p>
          {selection.type === 'beat' && <button type="button" className="music-button" onClick={() => onSelectRange(selectedStart, selectedStart)}>Whole measure</button>}
          <p><strong>Choose measures</strong></p>
          <form key={selectionLabel} className="song-video-actions" onSubmit={event => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const start = Number(values.get('start')); const end = Number(values.get('end'));
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > measureCount || start > end) { setError(`Choose measures from 1 to ${measureCount}, with the end at or after the start.`); return; }
            onSelectRange(start - 1, end - 1); setError(null);
            event.currentTarget.closest('details')!.open = false;
          }}>
            <label>From measure<input name="start" aria-label="From measure" type="number" min="1" max={measureCount} step="1" defaultValue={selectedStart + 1} required /></label>
            <label>Through measure<input name="end" aria-label="Through measure" type="number" min="1" max={measureCount} step="1" defaultValue={selectedEnd + 1} required /></label>
            <button type="submit" className="music-button">Apply range</button>
          </form>
        </details>
        {playReason && <div><p id="song-video-play-reason">{playReason}</p>{ready && (!draft.recording_confirmed || !range && ranges.length <= 1) && <button type="button" className="music-button" onClick={openCalibration}>Align selected start</button>}</div>}
        {range && range.end === null && <p>Play from this aligned start now; save later to keep it. Score following and looping need more anchors.</p>}
      </>}
    </div>}
    </div>
    {view === 'sync' && <div className="song-video-setup">
      <div className="song-video-task-heading"><p>PLAYBACK PAUSED</p><h3>Sync with score</h3><span>Use the visible video controls to seek, then mark the selected score boundary.</span></div>
      {draft && <>
        {Number.isFinite(firstTime) && <details><summary>Adjust recording start</summary>
          {draft.timing_source && <p>{suggestions?.candidates.find(candidate => candidate.video_id === draft.video_id)?.timing?.note ?? (draft.timing_source === 'estimated' ? suggestions?.estimated_timing?.note : null) ?? (draft.timing_source === 'estimated' ? 'Estimated timing from score tempo. Check the recording start; introductions, drift and arrangements may differ.' : 'Timing based on Songsterr. Check that this recording matches the score arrangement.')} Only sections between timing points are covered.</p>}
          {durationComparison && <p data-testid="video-duration-comparison">{durationComparison} Similar duration does not establish the same arrangement or synchronization.</p>}
          <form className="song-video-actions" onSubmit={event => { event.preventDefault(); shiftStart(); }}>
            <label>First aligned beat{firstAnchor ? ` (M${firstAnchor.measure_index + 1}, beat ${firstAnchor.beat_index + 1})` : ''} at (seconds)<input aria-label="First aligned beat at (seconds)" type="number" min="0" max="86400" step="0.1" value={startTime || String(firstTime)} onChange={event => setStartTime(event.target.value)} /></label>
            <button type="submit" className="music-button" disabled={!startTime || busy}>Apply start time</button>
          </form>
          <p>Moves all timing points together. Undo edit restores the previous timing.</p>
        </details>}

      </>}
      <fieldset disabled={busy} className="song-video-calibration">
          {dirty && <p>Unsaved timing changes</p>}
          {!Number.isFinite(firstTime) && durationComparison && <p data-testid="video-duration-comparison">{durationComparison} Similar duration does not establish the same arrangement or synchronization.</p>}
          {draft && <>
            <label><input type="checkbox" checked={draft.recording_confirmed} onChange={event => change({ ...draft, recording_confirmed: event.target.checked })} /> I checked that this recording matches the score arrangement.</label>
            <p>Pause at the selected score boundary, then mark it. Between-anchor timing is estimated; gaps stay unaligned. Add anchors for tempo drift and named occurrences for repeats.</p>
            {draft.passages.length > 1 && <label>Occurrence<select aria-label="Video occurrence" value={occurrence} onChange={event => { clearPlayback(); setOccurrence(event.target.value); setAnchorIndex(''); }}>
              <option value="">Choose occurrence</option>{draft.passages.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select></label>}
            <div className="song-video-actions"><button type="button" className="music-button" disabled={draft.passages.length >= 100} onClick={() => {
              const id = crypto.randomUUID(); change({ ...draft, passages: [...draft.passages, { id, label: `Occurrence ${draft.passages.length + 1}`, anchors: [] }] }); setOccurrence(id); setAnchorIndex('');
            }}>Add occurrence</button></div>
            {passage && <>
              <label>Occurrence name<input aria-label="Occurrence name" maxLength={120} value={passage.label} onChange={event => change({ ...draft, passages: draft.passages.map(p => p.id === passage.id ? { ...p, label: event.target.value } : p) })} /></label>
              <p data-testid="video-calibration-selection">{points ? `Selected: M${points[0].measure_index + 1}, beat ${points[0].beat_index + 1} start → M${points[1].measure_index + 1}, beat ${points[1].beat_index + 1} end` : 'Select a score beat or a nonempty range.'}{seconds !== null ? ` · video ${timeLabel(seconds)}` : ''}</p>
              <div className="song-video-actions"><button type="button" className="music-button" disabled={!ready || !points || passage.anchors.length >= 256} onClick={() => editAnchor('start')}>Mark selection start</button>
                <button type="button" className="music-button" disabled={!ready || !points || passage.anchors.length >= 256} onClick={() => editAnchor('end')}>Mark selection end</button></div>
              {passage.anchors.length > 0 && <>
                <label>Correct an anchor<select aria-label="Correct an anchor" value={anchorIndex} onChange={event => setAnchorIndex(event.target.value)}>
                  <option value="">Choose anchor ({passage.anchors.length})</option>{passage.anchors.map((a, i) => <option key={i} value={i}>{anchorLabel(a)}</option>)}
                </select></label>
                <div className="song-video-actions"><button type="button" className="music-button" disabled={anchorIndex === '' || !ready} onClick={() => editAnchor('start', true)}>Use current video time</button>
                  <button type="button" className="music-button" disabled={anchorIndex === ''} onClick={() => { change({ ...draft, passages: draft.passages.map(p => p.id === passage.id ? { ...p, anchors: p.anchors.filter((_, i) => i !== Number(anchorIndex)) } : p) }); setAnchorIndex(''); }}>Remove anchor</button></div>
              </>}
              <button type="button" className="music-button" onClick={() => { change({ ...draft, passages: draft.passages.filter(p => p.id !== passage.id) }); setOccurrence(''); setAnchorIndex(''); }}>Remove occurrence</button>
            </>}
          </>}
          {editActions}
      </fieldset>
    </div>}
    {view === 'change' && <div className="song-video-setup">
      <div className="song-video-task-heading"><p>PLAYBACK PAUSED</p><h3>{draft ? 'Change recording' : 'Attach a recording'}</h3><span>Preview a linked recording or paste a YouTube link. Changing it resets alignment; Undo restores it.</span></div>
      <fieldset disabled={busy} className="song-video-calibration">
        {recordingChoices}
        {draft && <button type="button" className="music-button" onClick={() => change(null)}>Remove recording</button>}
        {editActions}
      </fieldset>
    </div>}
    {error && <p className="song-video-message" role="alert">{error}</p>}
    {notice && <p className="song-video-message" role="status">{notice}</p>}
    </div>
    <button type="button" className="song-video-resize" aria-label="Resize recording"
      title="Drag to resize · arrow keys to adjust · Home or double-click to reset" {...handleEvents(true)}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13 13 3M8 13l5-5" /></svg>
    </button>
  </section>
  </>;
}
