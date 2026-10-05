import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NoteLayer, PhysicalPosition } from '../types/music';
import type { RiffArtifact, RiffEvent } from '../types/v2';
import { apiClient } from '../api/client';
import { playChord, startTimedPlayback, type TimedPlayback } from '../utils/audio';
import { midiToNoteName } from '../utils/tuning';
import { FretboardDiagram } from './Fretboard';
import { editRiff, newRiff, riffScale, riffSuggestions, type RiffEdit, type RiffSuggestion, describeRiffEvent } from './riff';
import { RiffPlayAlong, RiffTimeline } from './RiffTimeline';
import './RiffEditor.css';

export function RiffEditor({ artifact, onSaved, onDirtyChange }: {
  artifact?: RiffArtifact | null; onSaved: (artifact: RiffArtifact) => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => newRiff(artifact?.payload));
  const [saved, setSaved] = useState(artifact ?? null);
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft.payload));
  const [length, setLength] = useState<RiffEvent['beats']>(.5);
  const [touchSpacing, setTouchSpacing] = useState(() => window.matchMedia('(max-width: 850px), (pointer: coarse)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 850px), (pointer: coarse)');
    const change = () => setTouchSpacing(media.matches);
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  const [region, setRegion] = useState(0), [hints, setHints] = useState(true), [loop, setLoop] = useState(true);
  const [preview, setPreview] = useState<RiffSuggestion | null>(null);
  const [playback, setPlayback] = useState<{ transport: TimedPlayback; payload: typeof draft.payload; previewAt?: number } | null>(null);
  const [pendingPlay, setPendingPlay] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null), [audioError, setAudioError] = useState(false);
  const audio = useRef<AbortController | null>(null), audition = useRef<(() => void) | null>(null), live = useRef(true);
  const dirty = JSON.stringify(draft.payload) !== baseline;
  const selected = draft.payload.events.find(event => event.id === draft.selectedId);
  const selectedIndex = draft.payload.events.findIndex(event => event.id === draft.selectedId);
  const suggestions = useMemo(() => riffSuggestions(draft.payload, length), [draft.payload, length]);
  const stop = useCallback(() => {
    audio.current?.abort(); audio.current = null; audition.current?.(); audition.current = null;
    setPlayback(null); setPendingPlay(false);
  }, []);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  useEffect(() => {
    live.current = true;
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hide);
    return () => { live.current = false; audio.current?.abort(); audition.current?.(); document.removeEventListener('visibilitychange', hide); };
  }, [stop]);
  useEffect(() => {
    if (!playback) return;
    const timer = setInterval(() => { if (playback.transport.finished()) stop(); }, 50);
    return () => clearInterval(timer);
  }, [playback, stop]);
  const change = (edit: RiffEdit) => { stop(); setPreview(null); setError(null); setDraft(current => editRiff(current, edit)); };
  const hearNote = (position: PhysicalPosition) => {
    try { audition.current = playChord([position], 0, .35, draft.payload.tuning); setAudioError(false); }
    catch { setAudioError(true); }
  };
  const enter = (position: PhysicalPosition | null) => { change({ type: 'enter', position, beats: length }); if (position) hearNote(position); };
  const play = async (suggestion?: RiffSuggestion) => {
    stop();
    const ending = suggestion ? draft.payload.events.slice(-3) : [];
    const events = suggestion ? [...ending, ...suggestion.events.map((event, i) => ({ ...event, id: `preview-${i}` }))] : draft.payload.events;
    if (!events.length) return;
    if (suggestion) setPreview(structuredClone(suggestion));
    const controller = new AbortController(); audio.current = controller; setPendingPlay(true);
    try {
      const transport = await startTimedPlayback(events.map(event => ({ positions: event.position ? [event.position] : [], tuning: draft.payload.tuning, beats: event.beats })), draft.payload.tempo, { loop: !suggestion && loop, signal: controller.signal });
      if (!controller.signal.aborted && live.current && transport) {
        setPlayback({ transport, payload: { ...draft.payload, events }, previewAt: suggestion ? ending.reduce((sum, event) => sum + event.beats, 0) : undefined }); setAudioError(false);
      }
    } catch { if (!controller.signal.aborted && live.current) setAudioError(true); }
    finally { if (!controller.signal.aborted && live.current) setPendingPlay(false); }
  };
  const save = async () => {
    if (saving) return;
    const snapshot = draft.payload; setSaving(true); setError(null);
    try {
      const result = saved ? await apiClient.updateRiff(saved.id, saved.updated_at, snapshot) : await apiClient.createRiff(snapshot);
      if (!live.current) return;
      setSaved(result); setBaseline(JSON.stringify(result.payload));
      setDraft(current => JSON.stringify(current.payload) === JSON.stringify(snapshot) ? { ...current, payload: result.payload } : current);
      onSaved(result);
    } catch (reason) { if (live.current) setError(`${reason instanceof Error ? reason.message : 'Could not save this riff.'} Your changes are still here. Try again, or reopen the saved version in My Stuff.`); }
    finally { if (live.current) setSaving(false); }
  };
  const layers = useMemo<NoteLayer[]>(() => {
    const scale = riffScale(draft.payload);
    const positions = draft.payload.tuning.flatMap((open, i) => Array.from({ length: Math.min(24, 127 - open) + 1 }, (_, fret) => ({ string: i + 1, fret, midi: open + fret, note: midiToNoteName(open + fret) })));
    return hints ? [{ id: 'scale', label: 'Scale hint', focal: true, positions: positions.filter(p => scale.has(p.midi % 12)) },
      { id: 'outside', label: 'Other note', positions: positions.filter(p => !scale.has(p.midi % 12)) }] : [{ id: 'all', label: 'Note', focal: true, positions }];
  }, [draft.payload, hints]);
  return <div className="riff-editor" data-testid="riff-editor">
    <header className="riff-header"><div className="riff-name"><h1 aria-label="Create riff"><input aria-label="Riff name" id="riff-name" maxLength={120} value={draft.payload.title} onChange={event => { stop(); setDraft(current => ({ ...current, payload: { ...current.payload, title: event.target.value } })); }} /></h1>
      <p>{draft.payload.tonal_center ? `${draft.payload.tonal_center.root} ${draft.payload.tonal_center.scale.replaceAll('_', ' ')}` : 'Original riff'} · {draft.payload.tuning.map(note => midiToNoteName(note)).join(' · ')}</p></div>
      <div className="music-controls riff-transport"><label>Tempo <input aria-label="Tempo" type="number" min={45} max={180} value={draft.payload.tempo} onChange={event => { stop(); setPreview(null); setDraft(current => ({ ...current, payload: { ...current.payload, tempo: Math.max(45, Math.min(180, Math.trunc(Number(event.target.value) || 45))) } })); }} /> BPM</label>
        <label><input type="checkbox" checked={loop} onChange={event => { stop(); setLoop(event.target.checked); }} />Loop</label>
        <button className="music-button" disabled={!draft.payload.events.length && !pendingPlay} onClick={() => playback || pendingPlay ? stop() : void play()}>{playback || pendingPlay ? 'Stop' : 'Play riff'}</button>
        <button className="music-button learning-primary" disabled={saving || !draft.payload.title.trim() || !draft.payload.events.some(event => event.position) || Boolean(saved && !dirty)} onClick={() => void save()}>{saving ? 'Saving…' : 'Save riff'}</button>
        <span role="status" data-testid="riff-save-state">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : saved ? 'Saved' : 'Not saved'}</span>
      </div>
    </header>
    {error && <p className="learning-error" role="alert">{error}</p>}{audioError && <p role="alert">Sound unavailable. Your riff is still editable.</p>}
    <div className="riff-workspace"><section className="riff-entry" aria-label="Write on the fretboard">
      <div className="riff-section-heading"><h2>Choose your notes</h2><label>Neck region <select aria-label="Neck region" value={region} onChange={event => { stop(); setRegion(Number(event.target.value)); }}><option value={0}>Frets 0–4</option><option value={5}>Frets 5–9</option><option value={10}>Frets 10–14</option><option value={15}>Frets 15–19</option><option value={20}>Frets 20–24</option></select></label></div>
      <div className="riff-entry-state" role="status">{selected ? `Editing event ${selectedIndex + 1} · ${describeRiffEvent(selected, draft.payload.tuning)}` : 'Adding at the end'}{selected && <button className="learning-text-button" onClick={() => { stop(); setDraft(current => ({ ...current, selectedId: null })); }}>Done editing</button>}</div>
      <FretboardDiagram label="Riff fretboard" layers={layers} tuning={draft.payload.tuning} fretWindow={[region, region + 4]} minimumWidth={260} stringSpacing={touchSpacing ? 44 : 34} playing={selected?.position ? { ...selected.position, note: midiToNoteName(draft.payload.tuning[selected.position.string - 1] + selected.position.fret) } : null} onSelect={note => enter({ string: note.string, fret: note.fret })} />
      <div className="music-controls riff-entry-tools"><label>Length <select aria-label="Note length" value={selected?.beats ?? length} onChange={event => { const beats = Number(event.target.value) as RiffEvent['beats']; setLength(beats); change({ type: 'length', beats }); }}><option value={.5}>½ beat</option><option value={1}>1 beat</option><option value={2}>2 beats</option></select></label>
        <button className="music-button" disabled={!selected && draft.payload.events.length >= 256} onClick={() => enter(null)}>{selected ? 'Make rest' : 'Add rest'}</button><label><input type="checkbox" checked={hints} onChange={event => setHints(event.target.checked)} />Scale hints</label>
      </div>
    </section>
    <aside className="riff-suggestions" aria-labelledby="riff-suggestion-heading"><h2 id="riff-suggestion-heading">Where next?</h2>{suggestions.map(suggestion => <article key={suggestion.label} data-preview={preview?.label === suggestion.label}>
      <div><h3>{suggestion.label}</h3><p>{suggestion.events.map(event => event.position ? midiToNoteName(draft.payload.tuning[event.position.string - 1] + event.position.fret) : 'rest').join(' · ')} · {suggestion.events.reduce((sum, event) => sum + event.beats, 0)} beats</p></div>
      <div className="music-controls"><button className="music-button" aria-label={`Hear ${suggestion.label}`} onClick={() => void play(suggestion)}>Hear</button><button className="music-button" aria-label={`Keep ${suggestion.label}`} disabled={draft.payload.events.length + suggestion.events.length > 256} onClick={() => change({ type: 'keep', events: preview?.label === suggestion.label ? preview.events : suggestion.events })}>Keep</button></div>
    </article>)}{preview && <div className="riff-preview-state"><span>Preview · not added</span><button className="learning-text-button" onClick={() => { stop(); setPreview(null); }}>Dismiss</button></div>}</aside></div>
    <div className="riff-edit-tools music-controls"><span data-testid="riff-event-count">{draft.payload.events.length} {draft.payload.events.length === 1 ? 'event' : 'events'}</span><button className="music-button" disabled={!draft.undo.length} onClick={() => change({ type: 'undo' })}>Undo</button><button className="music-button" aria-label="Delete selected event" disabled={!selected} onClick={() => change({ type: 'delete' })}>Delete</button></div>
    {playback ? <RiffPlayAlong payload={playback.payload} transport={playback.transport} previewAt={playback.previewAt} /> : <RiffTimeline payload={draft.payload} selectedId={draft.selectedId} preview={preview?.events ?? []} onSelect={id => { stop(); setDraft(current => ({ ...current, selectedId: id })); const event = draft.payload.events.find(event => event.id === id); if (event?.position) { setRegion(Math.floor(event.position.fret / 5) * 5); hearNote(event.position); } }} />}
  </div>;
}
