import { MusicIcon } from './MusicIcon';
import { useMusicalInteraction } from './musicalInteraction';
import { useEffect, useMemo, useRef, useState } from 'react';
import { playChord } from '../utils/audio';
import { midiToNoteName } from '../utils/tuning';
import { usePractice } from './usePractice';
import { PracticeControls } from './PracticeControls';
import type { ViewConfig } from './Composition';
import './Fretboard.css';

export type ResolvedNote = { string: number; fret: number; note: string; degree?: string; midi?: number; pitch_class?: number };
export type NoteLayer = { id: string; label: string; positions: ResolvedNote[]; focal?: boolean };
export type VoicingValue = { positions: { string: number; fret: number }[]; tuning: number[] };

export function Hear({ voicing, label = 'Hear' }: { voicing: VoicingValue; label?: string }) {
  const stop = useRef<(() => void) | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => () => { stop.current?.(); }, []);
  return <><button type="button" className="music-button music-icon-button" aria-label={label} title={label} disabled={!voicing.positions.length} onClick={() => {
    stop.current?.();
    try { stop.current = playChord(voicing.positions, .03, 1.2, voicing.tuning); setError(false); }
    catch { setError(true); }
  }}><MusicIcon name="play" /></button>{error && <span role="alert">Audio unavailable.</span>}</>;
}

/** One resolved-data fretboard for both workspace capability contexts. */
export function Fretboard({ context, layers, config = {}, onNudge, onSelect, preview, tuning, compactControls = false, fitPositions }: {
  context: 'harmony' | 'progression';
  layers: NoteLayer[];
  config?: ViewConfig;
  onNudge: (value: ViewConfig) => void;
  onSelect: (note: ResolvedNote, layer: NoteLayer) => void;
  preview?: VoicingValue;
  tuning?: number[];
  compactControls?: boolean;
  fitPositions?: ResolvedNote[];
}) {
  const interaction = useMusicalInteraction();
  const hover = interaction?.preview;
  if (hover) layers = [...layers.map(layer => ({ ...layer, focal: false })), { id: 'preview', label: hover.label, focal: true, positions: hover.voicing.positions.map(position => {
    const midi = hover.voicing.tuning[position.string - 1] + position.fret;
    const known = layers.flatMap(layer => layer.positions).find(note => note.string === position.string && note.fret === position.fret);
    return { ...position, note: known?.note ?? midiToNoteName(midi), degree: known?.degree, midi, pitch_class: midi % 12 };
  }) }];
  const [rootsOnly, setRootsOnly] = useState(false);
  const [direction, setDirection] = useState('ascending');
  const [audioError, setAudioError] = useState(false);
  const stringTuning = tuning ?? preview?.tuning;
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const [manualWindow, setManualWindow] = useState(false);
  const [first, last] = fitPositions?.length && !manualWindow
    ? [Math.max(0, Math.min(...fitPositions.map(note => note.fret)) - 1), Math.min(24, Math.max(5, ...fitPositions.map(note => note.fret)) + 1)]
    : config.fret_window ?? [0, 12];
  const labels = config.labels ?? 'notes';
  const focalNotes = (layers.find(layer => layer.focal) ?? layers[0])?.positions ?? [];
  const shapeOutsideWindow = focalNotes.length > 0 && !focalNotes.some(note => note.fret >= first && note.fret <= last);
  const neck = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  useEffect(() => {
    if (!neck.current) return;
    const observer = new ResizeObserver(entries => setAvailableWidth(Math.floor(entries[0].contentRect.width)));
    observer.observe(neck.current);
    return () => observer.disconnect();
  }, []);
  const count = last - first + 1;
  const width = Math.max(360, count * 44 + 40, availableWidth);
  const x = (fret: number) => 40 + (fret - first + .5) * ((width - 48) / count);
  const y = (string: number) => 36 + (string - 1) * 34;
  const guide = useMemo(() => {
    if (!tuning) return [];
    const notes = (layers.find(layer => layer.focal) ?? layers[0])?.positions.filter(note => note.fret >= first && note.fret <= last && (!rootsOnly || note.degree === '1')) ?? [];
    const unique = [...new Map([...notes].sort((a, b) => b.string - a.string).map(note => [tuning[note.string - 1] + note.fret, note])).entries()].sort(([a], [b]) => a - b).map(([, note]) => note);
    const sequence = direction === 'descending' ? unique.reverse() : direction === 'both' ? [...unique, ...unique.slice(0, -1).reverse()] : unique;
    return sequence.map(note => ({ label: note.note, beats: 1, positions: [note], tuning }));
  }, [layers, tuning, first, last, rootsOnly, direction]);
  const durations = useMemo(() => guide.map(step => step.beats), [guide]);
  const practice = usePractice(durations, 60, guide);
  const playing = practice.running && practice.position.index >= 0 ? guide[practice.position.index]?.positions[0] : null;
  const adjust = (value: ViewConfig) => { setManualWindow(true); practice.reset(); onNudge(value); };
  const selectNote = (note: ResolvedNote, layer: NoteLayer) => {
    practice.pause();
    if (stringTuning) { try { stop.current?.(); stop.current = playChord([note], 0, .7, stringTuning); } catch { setAudioError(true); } }
    onSelect(note, layer);
  };
  const rangeControls = <>
      <label>Neck region <select aria-label="Neck region" value={`${first}-${last}`} onChange={event => { const [start, end] = event.target.value.split('-').map(Number); adjust({ fret_window: [start, end] }); }}>
        {!['0-5', '5-9', '9-13', '0-12', '0-19'].includes(`${first}-${last}`) && <option value={`${first}-${last}`}>Custom range</option>}
        <option value="0-5">Open position · 0–5</option><option value="5-9">Middle neck · 5–9</option><option value="9-13">Upper neck · 9–13</option><option value="0-12">One octave · 0–12</option><option value="0-19">Whole neck · 0–19</option>
      </select></label>
      <label>First fret <input aria-label="First fret" type="number" min="0" max={last} value={first}
        onChange={e => adjust({ fret_window: [Number(e.target.value), last] })} /></label>
      <label>Last fret <input aria-label="Last fret" type="number" min={first} max="24" value={last}
        onChange={e => adjust({ fret_window: [first, Number(e.target.value)] })} /></label>
  </>;
  return <div className="music-fretboard" data-context={context}>
    <div className="music-controls">
      {!compactControls && rangeControls}
      <label>Note labels <select value={labels} onChange={e => onNudge({ labels: e.target.value as 'notes' | 'degrees' })}>
        <option value="notes">Notes</option><option value="degrees">Degrees</option>
      </select></label>
      <button type="button" className="music-button" aria-pressed={rootsOnly} onClick={() => { practice.reset(); setRootsOnly(!rootsOnly); }}>{rootsOnly ? 'Show all notes' : 'Find the roots'}</button>
      {preview && <Hear voicing={preview} label="Hear voicing" />}
    </div>
    {compactControls && <details className="fretboard-range"><summary>Neck range · frets {first}–{last}</summary><div className="music-controls">{rangeControls}</div></details>}
    <ul aria-label="Fretboard layers" className="music-layer-legend">
      {layers.map(layer => <li key={layer.id}>{layer.label}{layer.focal ? ' — main focus' : ' — context'}</li>)}
    </ul>
    {shapeOutsideWindow && <p className="learning-notice">These notes are outside the displayed frets. <button type="button" className="music-button" onClick={() => { const start = Math.max(0, Math.min(...focalNotes.map(note => note.fret)) - 1); adjust({ fret_window: [start, Math.min(24, Math.max(start + 4, ...focalNotes.map(note => note.fret + 1)))] }); }}>Show these notes</button></p>}
    <div ref={neck} className="music-neck-scroll" tabIndex={0} aria-label="Scrollable fretboard">
      <svg width={width} height="244" viewBox={`0 0 ${width} 244`} aria-label={`${context} fretboard`}>
        {Array.from({ length: 6 }, (_, index) => <g key={index} aria-hidden="true">
          <text x="8" y={y(index + 1) + 4}>{stringTuning ? midiToNoteName(stringTuning[index]) : index + 1}</text>
          <line x1="32" x2={width - 8} y1={y(index + 1)} y2={y(index + 1)} stroke="currentColor" strokeWidth={.7 + index * .2} />
        </g>)}
        {Array.from({ length: count }, (_, index) => <g key={index} aria-hidden="true">
          <line x1={x(first + index) + (width - 48) / count / 2} x2={x(first + index) + (width - 48) / count / 2} y1="24" y2="218" stroke="currentColor" opacity=".2" />
          <text x={x(first + index)} y="238" textAnchor="middle">{first + index}</text>
        </g>)}
        {[...layers].sort((a, b) => Number(!!a.focal) - Number(!!b.focal)).map(layer => <g key={layer.id}>
          {layer.positions.filter(note => note.fret >= first && note.fret <= last && (!rootsOnly || note.degree === '1')).map(note => (
            <g key={`${note.string}.${note.fret}`} role="button" tabIndex={0}
              className={`music-note ${layer.focal ? 'music-note--focal' : ''} ${note.degree === '1' ? 'music-note--root' : ''} ${playing?.string === note.string && playing?.fret === note.fret ? 'music-note--playing' : ''}`}
              aria-label={`${note.note}, degree ${note.degree ?? 'unknown'}, string ${note.string}, fret ${note.fret}, ${layer.label}${layer.focal ? ', main focus' : ', context'}`}
              onClick={() => selectNote(note, layer)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNote(note, layer); } }}>
              <circle cx={x(note.fret)} cy={y(note.string)} r={layer.focal ? 15 : 12} strokeWidth={layer.focal ? 3 : 1} strokeDasharray={layer.focal ? undefined : '2 2'} />
              <text x={x(note.fret)} y={y(note.string) + 4} textAnchor="middle" aria-hidden="true">{labels === 'degrees' ? note.degree ?? '—' : note.note}</text>
            </g>
          ))}
        </g>)}
      </svg>
    </div>
    <p className="learning-hint">String 1 is the thinnest, at the top. Fret 0 means an open string. <span className="learning-root-key">Root notes</span>{stringTuning && ' · Select a note to hear it.'}</p>
    {tuning && <div className="learning-pattern-practice" data-active={practice.active}><div className="music-controls"><label>Play direction<select value={direction} disabled={practice.running} onChange={event => { practice.reset(); setDirection(event.target.value); }}><option value="ascending">Ascending</option><option value="descending">Descending</option><option value="both">Up and down</option></select></label><span>{guide.length} notes · one note per beat</span></div><PracticeControls practice={{ ...practice, enter: () => { practice.setAudioMode('guide'); practice.enter(); } }} available={guide.length > 0} label="pattern" allowFocus={false} guideLabel="Listen to the highlighted notes, then try them yourself" /></div>}
    {audioError && <p role="alert">Audio is unavailable. You can still explore the notes.</p>}
  </div>;
}
