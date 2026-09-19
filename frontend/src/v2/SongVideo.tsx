import { useEffect, useMemo, useRef, useState } from 'react';
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

export function SongVideo({ song, active, selection, onChange, onPosition }: {
  song: SongStudyArtifact;
  active: boolean;
  selection: SongSelection;
  onChange(song: SongStudyArtifact): void;
  onPosition(position: VideoPosition | null): void;
}) {
  const initial = song.payload.video_alignment ?? null;
  const [draft, setDraft] = useState<SongVideoAlignment | null>(initial);
  const baseline = useRef(initial);
  const revision = useRef(song.updated_at);
  const [history, setHistory] = useState<Array<SongVideoAlignment | null>>([]);
  const [suggestions, setSuggestions] = useState<SongVideoSuggestions | null>(null);
  const [suggestionError, setSuggestionError] = useState(false);
  const [suggestionAttempt, setSuggestionAttempt] = useState(0);
  const [changingRecording, setChangingRecording] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const discover = active && (!draft || changingRecording);
  useEffect(() => {
    if (!discover) return;
    let cancelled = false;
    apiClient.getSongVideoSuggestions(song.id).then(result => {
      if (!cancelled) { setSuggestions(result); setSuggestionError(false); }
    }).catch(() => { if (!cancelled) setSuggestionError(true); });
    return () => { cancelled = true; };
  }, [discover, song.id, suggestionAttempt]);
  const [url, setUrl] = useState('');
  const [occurrence, setOccurrence] = useState('');
  const [anchorIndex, setAnchorIndex] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<YouTubeState>('loading');
  const [seconds, setSeconds] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const player = useRef<YouTubeControls>(null);
  const panel = useRef<HTMLElement>(null);
  const live = useRef(true);
  const reportedTime = useRef<number | null>(null);
  const playingState = useRef<YouTubeState>('loading');
  const playingRange = useRef<(VideoRange & { loop: boolean; seeking: boolean }) | null>(null);
  const lastPosition = useRef('');
  const previousSample = useRef<{ time: number; at: number } | null>(null);
  const timeline = useMemo(() => buildScoreTimeline(song.payload.tab_data.measures ?? []), [song.payload.tab_data.measures]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline.current);
  const passage = draft?.passages.find(p => p.id === occurrence) ?? (draft?.passages.length === 1 ? draft.passages[0] : null);
  const ranges = useMemo(() => selectionVideoRanges(timeline, draft?.passages ?? [], selection), [timeline, draft, selection]);
  const range = occurrence ? ranges.find(r => r.id === occurrence) : ranges.length === 1 ? ranges[0] : null;
  const points = selectionBoundaries(timeline, selection);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  useEffect(() => {
    if (!active) return;
    const nativeControls = () => {
      if (document.activeElement === panel.current?.querySelector('iframe')) playingRange.current = null;
    };
    window.addEventListener('blur', nativeControls);
    return () => window.removeEventListener('blur', nativeControls);
  }, [active]);

  function clearPlayback() {
    player.current?.pause();
    playingRange.current = null;
    lastPosition.current = '';
    onPosition(null);
  }
  function change(next: SongVideoAlignment | null) {
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
    attachId(id);
  }
  function attachId(id: string) {
    change({ video_id: id, recording_confirmed: false, passages: [{ id: crypto.randomUUID(), label: 'Occurrence 1', anchors: [] }] });
    setOccurrence('');
    setAnchorIndex('');
    setUrl('');
    setSeconds(null);
    setDuration(null);
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
    let currentRange = playingRange.current;
    // Native scrubbing takes ownership. Our own seeks are acknowledged by
    // reported time; ordinary clock drift and native speed changes are allowed.
    if (currentRange && !currentRange.seeking && sample) {
      const delta = time - sample.time;
      if (delta < -0.25 || delta > Math.max(1, (now - sample.at) / 250 + 0.25)
        || playingState.current === 'paused' && Math.abs(delta) > 0.05) {
        playingRange.current = null;
        currentRange = null;
      }
    }
    if (currentRange?.seeking && Math.abs(time - currentRange.start) < 2) currentRange.seeking = false;
    if (currentRange?.end != null && playingState.current === 'playing') {
      if (time >= currentRange.end && !currentRange.seeking) {
        if (currentRange.loop) {
          currentRange.seeking = true;
          player.current?.seek(currentRange.start);
          player.current?.play();
          return;
        } else {
          player.current?.pause();
          playingRange.current = null;
        }
      }
    }
    const position = draft?.recording_confirmed ? videoPosition(timeline, draft.passages, time) : null;
    const key = position ? `${position.passageId}:${position.measureIndex}:${position.beatIndex}` : '';
    if (key !== lastPosition.current) { lastPosition.current = key; onPosition(position); }
  }
  function playSelection() {
    if (!ready || !range || !draft?.recording_confirmed) return;
    panel.current?.querySelector('iframe')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    playingRange.current = { ...range, loop: loop && range.end !== null, seeking: true };
    player.current?.seek(range.start);
    player.current?.play();
  }
  async function save() {
    if (draft && !draft.recording_confirmed) { setError('Confirm that this recording matches the score arrangement before saving.'); return; }
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
    clearPlayback(); setBusy(true); setError(null);
    try {
      const saved = await apiClient.getSongStudy(song.id);
      if (!live.current) return;
      baseline.current = saved.payload.video_alignment ?? null;
      revision.current = saved.updated_at;
      setDraft(baseline.current); setHistory([]); setOccurrence(''); setAnchorIndex(''); setNotice('Loaded the saved setup.');
      onChange(saved);
    } catch { if (live.current) setError('Could not reload. Your draft is kept; try again.'); }
    finally { if (live.current) setBusy(false); }
  }

  const recordingInput = <details><summary>Paste a YouTube link instead</summary><form onSubmit={event => { event.preventDefault(); attach(); }}>
            <p>Use a finished recording, not an ongoing livestream.</p>
            <label>YouTube link or video ID<input aria-label="YouTube link or video ID" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></label>
            <button type="submit" className="music-button" disabled={!url.trim()}>{draft ? 'Replace recording and reset alignment' : 'Attach recording'}</button>
          </form></details>;
  const recordingChoices = <div className="song-video-suggestions" aria-label="Suggested recordings">
    <p>Recordings linked to this song on Songsterr. Preview and check the arrangement before confirming.</p>
    {suggestionError ? <p role="alert">Could not find recordings. <button type="button" className="music-button" onClick={() => { setSuggestionError(false); setSuggestions(null); setSuggestionAttempt(value => value + 1); }}>Retry recordings</button></p>
      : !suggestions ? <p role="status">Finding recordings…</p>
      : suggestions.candidates.length === 0 ? <p>No linked recordings found. You can paste a YouTube link below.</p>
      : <ul>{suggestions.candidates.map((candidate, index) => <li key={candidate.video_id}>
        <button type="button" className="music-button" onClick={() => attachId(candidate.video_id)} aria-label={`Preview recording ${index + 1}: ${candidate.title}`}>{candidate.title}</button>
        <p>{candidate.channel ? `${candidate.channel} · ` : ''}{candidate.kind === 'musicvideo' ? 'Music video' : candidate.kind} · {candidate.match_note}</p>
      </li>)}</ul>}
    {recordingInput}
  </div>;
  const scoreDuration = suggestions?.score_duration_seconds;
  const durationComparison = duration !== null && scoreDuration != null && scoreDuration > 0 && Number.isFinite(scoreDuration)
    ? `Video ${timeLabel(duration)} · written score estimate ${timeLabel(scoreDuration)} · ${Math.abs(duration - scoreDuration).toFixed(1)} seconds ${duration >= scoreDuration ? 'longer' : 'shorter'}.`
    : suggestions?.duration_note;

  if (!active) return null;
  return <section ref={panel} className="song-video" aria-label="Song video">
    {draft && <YouTubePlayer ref={player} videoId={draft.video_id} onReadyChange={value => {
      setReady(value);
      if (!value) setDuration(null);
      if (!value) { playingRange.current = null; previousSample.current = null; lastPosition.current = ''; onPosition(null); }
    }}
      onTime={handleTime} onStateChange={value => { playingState.current = value; setState(value); }} />}
    <div className="song-video-tools">
      {draft && <>
        {durationComparison && <p data-testid="video-duration-comparison">{durationComparison} Similar duration does not establish the same arrangement or synchronization.</p>}
        <p className="song-video-status" data-testid="song-video-position">{state === 'buffering' ? 'Buffering · ' : ''}{!draft.recording_confirmed ? 'Confirm the arrangement to follow the score.' : lastPosition.current ? (() => {
          const position = videoPosition(timeline, draft.passages, reportedTime.current ?? -1);
          return position ? `Video: M${position.measureIndex + 1}, beat ${position.beatIndex + 1} · ${draft.passages.find(p => p.id === position.passageId)?.label}` : 'Unaligned video section';
        })() : 'Unaligned video section'}</p>
        {draft.passages.length > 1 && <label>Occurrence<select aria-label="Video occurrence" value={occurrence} onChange={event => { clearPlayback(); setOccurrence(event.target.value); setAnchorIndex(''); }}>
          <option value="">Choose occurrence</option>{draft.passages.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select></label>}
        <div className="song-video-actions"><button type="button" className="music-button" disabled={!ready || !range || !draft.recording_confirmed} onClick={playSelection}>Play selection</button>
          <label><input type="checkbox" checked={loop} disabled={!range || range.end === null} onChange={event => { setLoop(event.target.checked); if (playingRange.current) playingRange.current.loop = event.target.checked && playingRange.current.end !== null; }} /> Loop selection</label></div>
        <p>Native video controls take over from selection playback.</p>
        {draft.recording_confirmed && !range && <p>{ranges.length > 1 ? 'Choose which occurrence to play.' : 'The selected start is unaligned. Add anchors or select an aligned beat.'}</p>}
        {range && range.end === null && <p>Only the start is aligned. Use native video controls; looping needs an aligned end.</p>}
      </>}
      <details open={!draft || undefined} onToggle={event => { if (event.currentTarget.open) player.current?.pause(); }}>
        <summary>{draft ? 'Calibrate recording' : 'Attach a YouTube recording'}{dirty ? ' · unsaved' : ''}</summary>
        <fieldset disabled={busy} className="song-video-calibration">
          {!draft && recordingChoices}
          {draft && <>
            <label><input type="checkbox" checked={draft.recording_confirmed} onChange={event => change({ ...draft, recording_confirmed: event.target.checked })} /> I checked that this recording matches the score arrangement.</label>
            <p>Pause at the selected score boundary, then mark it. Between-anchor timing is estimated; gaps stay unaligned. Add anchors for tempo drift and named occurrences for repeats.</p>
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
          <div className="song-video-actions">
            <button type="button" className="music-button" disabled={!history.length} onClick={() => { clearPlayback(); setDraft(history.at(-1) ?? null); setHistory(previous => previous.slice(0, -1)); setError(null); setAnchorIndex(''); }}>Undo edit</button>
            <button type="button" className="music-button" disabled={!dirty} onClick={save}>{busy ? 'Saving…' : 'Save video setup'}</button>
            <button type="button" className="music-button" onClick={discard}>Discard and reload</button>
          </div>
          {draft && <details onToggle={event => setChangingRecording(event.currentTarget.open)}><summary>Change or remove recording</summary>{recordingChoices}
            <button type="button" className="music-button" onClick={() => change(null)}>Remove recording</button>
          </details>}
        </fieldset>
      </details>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  </section>;
}
