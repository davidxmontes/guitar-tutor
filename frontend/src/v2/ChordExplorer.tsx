import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import type { PhysicalPosition } from '../types/music';
import type { ShapeFocus } from '../types/v2';
import { playChord } from '../utils/audio';
import { FretboardDiagram } from './Fretboard';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import type { ChordMatch, HarmonySurface, ShapeSuggestion } from './harmony';
import './ChordExplorer.css';

export function ChordExplorer({ surface, disabled, onSurface, onPending, onKeep }: {
  surface: HarmonySurface; disabled: boolean;
  onSurface: (next: HarmonySurface) => void; onPending: (pending: boolean) => void;
  onKeep: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(surface.branch.harmony_exploration!.focus as ShapeFocus);
  const [data, setData] = useState(surface.resolved.discovery!);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [audioError, setAudioError] = useState('');
  const [history, setHistory] = useState<ShapeFocus[]>([]);
  const [preview, setPreview] = useState<ShapeSuggestion | null>(null);
  const [window, setWindow] = useState<[number, number]>([0, 12]);
  const [labels, setLabels] = useState<'notes' | 'degrees'>('notes');
  const [allMatches, setAllMatches] = useState(false);
  const server = useRef(surface);
  const pending = useRef<ShapeFocus | null>(null);
  const saving = useRef(false);
  const alive = useRef(true);
  const stop = useRef<(() => void) | null>(null);
  const tuning = surface.branch.harmony_exploration!.tuning;
  useEffect(() => { if (!saving.current && !pending.current) server.current = surface; }, [surface]);
  useEffect(() => { onPending(dirty); return () => onPending(false); }, [dirty, onPending]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop.current?.(); }; }, []);

  async function flush() {
    if (saving.current) return;
    saving.current = true; setError('');
    try {
      while (pending.current && alive.current) {
        const focus = pending.current;
        pending.current = null;
        const branch = server.current.branch;
        try {
          const next = await apiClient.editHarmony(branch.session_id, branch.id, { focus, expected_updated_at: branch.updated_at });
          if (!alive.current) return;
          server.current = next;
          onSurface(next);
          if (!pending.current) { setData(next.resolved.discovery!); setDirty(false); }
        } catch (err) {
          if (!alive.current) return;
          pending.current ??= focus;
          setError(String(err));
          break;
        }
      }
    } finally { saving.current = false; }
  }

  function change(next: ShapeFocus, remember = true) {
    if (disabled) return;
    stop.current?.(); setPreview(null); setAllMatches(false);
    if (remember) setHistory(previous => [...previous.slice(-29), draft]);
    setDraft(next); setDirty(true); pending.current = next;
    // A failed/conflicting save keeps the local shape until an explicit retry.
    if (!error) void flush();
  }
  function toggle(position: PhysicalPosition) {
    const others = draft.positions.filter(p => p.string !== position.string);
    const selected = draft.positions.some(p => p.string === position.string && p.fret === position.fret);
    change({ kind: 'shape', positions: (selected ? others : [...others, { string: position.string, fret: position.fret }]).sort((a, b) => a.string - b.string), interpretation: null });
  }
  function hear(positions: PhysicalPosition[]) {
    stop.current?.();
    try { stop.current = playChord(positions, .04, 1.8, tuning); setAudioError(''); }
    catch { setAudioError('Audio is unavailable. Try Hear again.'); }
  }
  async function reload() {
    if (!globalThis.confirm('Discard the unsaved shape and load the saved version?')) return;
    try {
      const branch = server.current.branch;
      const next = await apiClient.getHarmony(branch.session_id, branch.id);
      if (!alive.current) return;
      pending.current = null; server.current = next;
      onSurface(next);
      if (next.branch.harmony_exploration?.focus.kind === 'shape') {
        setDraft(next.branch.harmony_exploration.focus); setData(next.resolved.discovery!);
      }
      setDirty(false); setError(''); setHistory([]); setPreview(null);
    } catch (err) { if (alive.current) setError(String(err)); }
  }

  const positions = draft.positions.flatMap(p => {
    const known = (!dirty ? data.positions : data.grid).find(n => n.string === p.string && n.fret === p.fret);
    return known ? [known] : [];
  });
  const chosen = dirty ? undefined : data.matches.find(m => m.chord.root === draft.interpretation?.root && m.chord.quality === draft.interpretation.quality);
  const layers = [
    { id: 'selection', label: 'Your shape', focal: true, positions },
    ...(preview ? [{ id: 'suggestion', label: 'Suggested notes', positions: preview.notes.filter(n => !draft.positions.some(p => p.string === n.string && p.fret === n.fret)) },
      { id: 'removed', label: 'Notes to change', positions: positions.filter(n => !preview.positions.some(p => p.string === n.string && p.fret === n.fret)) }] : []),
  ];
  function inspect(option: ShapeSuggestion) { stop.current?.(); setPreview(option); }
  function result(match: ChordMatch) {
    const selected = chosen?.label === match.label;
    return <button type="button" key={match.label} className="chord-match" aria-pressed={selected} disabled={disabled || dirty}
      onClick={() => change({ ...draft, interpretation: match.chord })}>
      <strong>{match.label}</strong><span>{match.missing.length ? `Missing ${match.missing.map(n => `${n.note} (${n.degree})`).join(', ')}` : 'All chord tones present'}</span>
      {match.in_key && <small>In your key</small>}
    </button>;
  }
  function suggestions(title: string, options: ShapeSuggestion[]) {
    if (!options.length) return null;
    return <details className="chord-suggestions" open={title !== 'Other voicings'}>
      <summary>{title} <span>{options.length}</span></summary>
      <div className="chord-suggestion-list">{options.slice(0, 3).map((option, index) => <button key={index} type="button" className="chord-suggestion" disabled={disabled || dirty}
        aria-label={`Preview ${option.inversion}, ${title.toLowerCase()}, option ${index + 1}`}
        aria-pressed={preview === option} onClick={() => inspect(option)}
        onMouseEnter={() => { if (!disabled && !dirty) inspect(option); }} onFocus={() => { if (!disabled && !dirty) inspect(option); }}>
        <strong>{option.inversion}</strong><span>{option.changes.join(' · ')}</span>
      </button>)}</div>
      {options.length > 3 && <details><summary>More options</summary><div className="chord-suggestion-list">{options.slice(3).map((option, index) => <button key={index} type="button" className="chord-suggestion" disabled={disabled || dirty} onClick={() => inspect(option)}><strong>{option.inversion}</strong><span>{option.changes.join(' · ')}</span></button>)}</div></details>}
    </details>;
  }
  const exact = data.matches.filter(m => !m.missing.length);
  const incomplete = data.matches.filter(m => m.missing.length);
  return <section className="chord-explorer" aria-label="Chord Explorer">
    <header className="chord-explorer-intro"><div><span className="learning-eyebrow">Follow your fingers</span><h2>What’s in this shape?</h2><p>Select a fret on each string you want to hear. Leave the others muted.</p></div><span className="chord-save-status" role="status">{dirty ? error ? 'Not saved' : 'Saving…' : 'Saved'}</span></header>
    <div className="chord-explorer-layout"><div className="chord-explorer-instrument">
      <div className="music-controls"><button type="button" className="music-button learning-primary" disabled={!draft.positions.length || disabled} onClick={() => hear(draft.positions)}>Hear shape</button>
        <button type="button" className="music-button" disabled={!history.length || disabled} onClick={() => { const previous = history[history.length - 1]; setHistory(history.slice(0, -1)); change(previous, false); }}>Undo</button>
        <button type="button" className="learning-text-button" disabled={!draft.positions.length || disabled} onClick={() => change({ kind: 'shape', positions: [], interpretation: null })}>Clear shape</button>
        <label>Neck region <select value={window.join('-')} onChange={e => setWindow(e.target.value.split('-').map(Number) as [number, number])}><option value="0-5">Frets 0–5</option><option value="0-12">Frets 0–12</option><option value="5-17">Frets 5–17</option><option value="12-24">Frets 12–24</option><option value="0-24">Whole neck</option></select></label>
        <label>Labels <select value={labels} onChange={e => setLabels(e.target.value as 'notes' | 'degrees')}><option value="notes">Notes</option><option value="degrees">Intervals</option></select></label>
      </div>
      <FretboardDiagram label="Build your chord shape" layers={layers} tuning={tuning} fretWindow={window} labels={labels}
        editor={{ grid: data.grid, selected: draft.positions, onToggle: toggle, disabled }} />
      <div className="chord-string-notes" aria-label="Selected strings">{[6, 5, 4, 3, 2, 1].map(string => {
        const note = positions.find(p => p.string === string);
        return <span key={string}><small>String {string}</small><strong>{note?.note ?? '×'}</strong><small>{note ? note.fret === 0 ? 'Open' : `Fret ${note.fret}` : 'Muted'}</small></span>;
      })}</div>
      <p className="learning-hint">Arrow keys move between frets and strings. Enter or Space toggles a note. One fret per string; wide stretches may need a different fingering.</p>
      {error && <div role="alert" className="learning-notice"><p>Your shape is still here. {error}</p><button className="music-button" onClick={() => void flush()}>Retry save</button> <button className="music-button" onClick={() => void reload()}>Reload saved shape</button></div>}
      {audioError && <p role="alert">{audioError}</p>}
      {preview && <section className="chord-preview" aria-label="Suggestion preview"><div><span className="learning-eyebrow">Preview · your shape is unchanged</span><h3>{preview.inversion}</h3><p>{preview.changes.join(' · ')}</p><p className="learning-hint">Outlined dots add notes. Crossed dots change or mute notes.</p></div>
        <PhysicalChordDiagram positions={preview.positions} tuning={tuning} label={`Preview ${preview.inversion}`} />
        {(preview.positions.some(p => p.fret < window[0] || p.fret > window[1])) && <button className="music-button" onClick={() => setWindow([0, 24])}>Show suggested frets</button>}
        <div className="music-controls"><button className="music-button" onClick={() => hear(preview.positions)}>Hear suggestion</button><button className="music-button learning-primary" disabled={disabled || dirty} onClick={() => change({ kind: 'shape', positions: preview.positions, interpretation: preview.chord })}>Apply suggestion</button><button className="learning-text-button" onClick={() => { stop.current?.(); setPreview(null); }}>Dismiss</button></div>
      </section>}
    </div><aside className="chord-explorer-results" aria-label="Chord results" aria-busy={dirty}>
      {!draft.positions.length ? <><h3>Start with a few notes</h3><p>A full chord or a small voicing—both are welcome. Possible names will appear here.</p></> : dirty ? <p role="status">{error ? 'Save your shape to update its interpretations.' : 'Listening to your selection…'}</p> : <>
        <div className="chord-result-heading"><h3>{exact.length ? 'Your chord' : 'Possible interpretations'}</h3>{data.bass && <p>Bass: <strong>{data.bass.note}</strong>{data.interval && ` · ${data.interval}`}</p>}</div>
        {exact.map(result)}
        {!data.matches.length && <p>{draft.positions.length === 1 ? 'Add another note to explore possible chords.' : 'No exact match in the supported chord types. Your notes are still available to hear and explore.'}</p>}
        {incomplete.length > 0 && <details className="chord-partial-matches" open={!exact.length}><summary>{exact.length ? 'Other interpretations · missing tones' : 'These shapes are incomplete or ambiguous'}</summary>{(allMatches ? incomplete : incomplete.slice(0, 4)).map(result)}{incomplete.length > 4 && <button className="learning-text-button" onClick={() => setAllMatches(!allMatches)}>{allMatches ? 'Show fewer' : `Show all ${incomplete.length} possibilities`}</button>}</details>}
        {!chosen && data.matches.length > 0 && <p className="learning-hint">Choose an interpretation to explore its intervals and suggestions.</p>}
        {chosen && <><div className="learning-note-chips">{chosen.notes.map(n => <span key={n.degree} className={n.degree === '1' ? 'is-root' : ''}><strong>{n.note}</strong><small>{n.degree}{chosen.missing.some(m => m.pitch_class === n.pitch_class) ? ' · missing' : ''}</small></span>)}</div>
          <div className="music-controls chord-keep"><button className="music-button" disabled={disabled || dirty} onClick={() => void onKeep({ pin: { chord: chosen.chord, voicing: { positions: draft.positions, tuning } } })}>Pin shape</button><button className="music-button" disabled={disabled || dirty} onClick={() => void onKeep({ add_scratch: chosen.chord })}>Add chord to scratch</button></div>
          {suggestions('Complete this chord', data.completions)}{suggestions('Change its sound', data.alterations)}{suggestions('Other voicings', data.voicings)}
          {!!chosen.missing.length && !data.completions.length && <p className="learning-hint">No simple completion on the unused strings. Try another voicing or free a string.</p>}
        </>}
      </>}
    </aside></div>
  </section>;
}
