import type { ResolvedNote, NoteLayer, VoicingValue, PhysicalPosition } from '../types/music';
import { MusicIcon } from './MusicIcon';
import { useMusicalInteraction } from './musicalInteraction';
import { useEffect, useMemo, useRef, useState } from 'react';
import { playChord } from '../utils/audio';
import { midiToNoteName } from '../utils/tuning';
import { usePractice } from './usePractice';
import { PracticeControls } from './PracticeControls';
import type { ViewConfig } from './Composition';
import './Fretboard.css';


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

/** The neck alone: controlled musical data, optional note interaction, no toolbar or playback state. */
export function FretboardDiagram({ label, layers, tuning, fretWindow = [0, 12], labels = 'notes', playing, onSelect, editor }: {
  label: string;
  layers: NoteLayer[];
  tuning?: number[];
  fretWindow?: [number, number];
  labels?: 'notes' | 'degrees';
  playing?: ResolvedNote | null;
  onSelect?: (note: ResolvedNote, layer: NoteLayer) => void;
  editor?: { grid: ResolvedNote[]; selected: PhysicalPosition[]; onToggle: (note: ResolvedNote) => void; disabled?: boolean };
}) {
  const [first, last] = fretWindow;
  const visibleLayers = layers.map(layer => ({ ...layer, positions: layer.positions.filter(note => note.fret >= first && note.fret <= last) }));
  const describeNote = (note: ResolvedNote, layer: NoteLayer) => `${note.note}, degree ${note.degree ?? 'unknown'}, string ${note.string}, fret ${note.fret}, ${layer.label}${layer.focal ? ', main focus' : ', context'}`;
  const neck = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState({ string: 1, fret: first });
  const cursorFret = Math.max(first, Math.min(last, cursor.fret));
  const cells = useRef(new Map<string, SVGGElement>());
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
  const gap = editor ? 44 : 34;
  const y = (string: number) => 36 + (string - 1) * gap;
  const bottom = editor ? 268 : 218;
  const height = editor ? 294 : 244;
  return (
    <div ref={neck} className="music-neck-scroll" tabIndex={editor ? undefined : 0} aria-label="Scrollable fretboard">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role={onSelect || editor ? 'group' : 'img'} aria-label={onSelect || editor ? label : `${label}. ${visibleLayers.flatMap(layer => layer.positions.map(note => describeNote(note, layer))).join('; ')}`}>
        {Array.from({ length: 6 }, (_, index) => <g key={index} aria-hidden="true">
          <text x="8" y={y(index + 1) + 4}>{tuning ? midiToNoteName(tuning[index]) : index + 1}</text>
          <line x1="32" x2={width - 8} y1={y(index + 1)} y2={y(index + 1)} stroke="currentColor" strokeWidth={.7 + index * .2} />
        </g>)}
        {Array.from({ length: count }, (_, index) => <g key={index} aria-hidden="true">
          <line x1={x(first + index) + (width - 48) / count / 2} x2={x(first + index) + (width - 48) / count / 2} y1="24" y2={bottom} stroke="currentColor" opacity=".2" />
          <text x={x(first + index)} y={height - 6} textAnchor="middle">{first + index}</text>
        </g>)}
        {[...visibleLayers].sort((a, b) => Number(!!a.focal) - Number(!!b.focal)).map(layer => <g key={layer.id}>
          {layer.positions.map(note => (
            <g key={`${note.string}.${note.fret}`} role={onSelect && !editor ? 'button' : undefined} tabIndex={onSelect && !editor ? 0 : undefined}
              data-layer={layer.id} pointerEvents={editor ? 'none' : undefined}
              className={`music-note ${layer.focal ? 'music-note--focal' : ''} ${note.degree === '1' ? 'music-note--root' : ''} ${playing?.string === note.string && playing?.fret === note.fret ? 'music-note--playing' : ''}`}
              aria-label={describeNote(note, layer)}
              onClick={onSelect ? () => onSelect(note, layer) : undefined}
              onKeyDown={onSelect ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(note, layer); } } : undefined}>
              <circle cx={x(note.fret)} cy={y(note.string)} r={layer.focal ? 15 : 12} strokeWidth={layer.focal ? 1.5 : 1} strokeDasharray={layer.focal ? undefined : '2 2'} />
              <text x={x(note.fret)} y={y(note.string) + 4} textAnchor="middle" aria-hidden="true">{labels === 'degrees' ? note.degree ?? '—' : note.note}</text>
            </g>
          ))}
        </g>)}
        {editor && editor.grid.filter(n => n.fret >= first && n.fret <= last).map(note => {
          const selected = editor.selected.some(p => p.string === note.string && p.fret === note.fret);
          return <g key={`${note.string}.${note.fret}`} ref={node => { const key = `${note.string}.${note.fret}`; if (node) cells.current.set(key, node); else cells.current.delete(key); }}
            className="music-fret-hit" role="button" aria-pressed={selected} aria-disabled={editor.disabled}
            aria-label={`String ${note.string}, fret ${note.fret}, ${note.note}`}
            tabIndex={note.string === cursor.string && note.fret === cursorFret ? 0 : -1}
            onFocus={() => setCursor(note)} onClick={() => { if (!editor.disabled) editor.onToggle(note); }}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!editor.disabled) editor.onToggle(note); return; }
              let { string, fret } = note;
              if (event.key === 'ArrowLeft') fret--; else if (event.key === 'ArrowRight') fret++;
              else if (event.key === 'ArrowUp') string--; else if (event.key === 'ArrowDown') string++;
              else if (event.key === 'Home') fret = first; else if (event.key === 'End') fret = last; else return;
              event.preventDefault();
              const cell = cells.current.get(`${Math.max(1, Math.min(6, string))}.${Math.max(first, Math.min(last, fret))}`);
              cell?.focus(); cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }}>
            <rect x={x(note.fret) - (width - 48) / count / 2} y={y(note.string) - 22} width={(width - 48) / count} height="44" rx="6" />
            {!selected && <text x={x(note.fret)} y={y(note.string) + 4} textAnchor="middle" aria-hidden="true">{note.note}</text>}
          </g>;
        })}
      </svg>
    </div>
  );
}

/** One resolved-data fretboard for both workspace capability contexts. */
export function Fretboard({ context, layers, config = {}, onNudge, onSelect, preview, tuning, compactControls = false, fitPositions }: {
  context: 'harmony' | 'progression';
  layers: NoteLayer[];
  config?: ViewConfig;
  onNudge: (value: ViewConfig) => void;
  onSelect?: (note: ResolvedNote, layer: NoteLayer) => void;
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
    onSelect?.(note, layer);
  };
  const rangeControls = <>
      <label>Neck region <select aria-label="Neck region" value={`${first}-${last}`} onChange={event => { const [start, end] = event.target.value.split('-').map(Number); adjust({ fret_window: [start, end] }); }}>
        {!['0-5', '5-9', '9-13', '0-12', '0-19'].includes(`${first}-${last}`) && <option value={`${first}-${last}`}>Custom range</option>}
        <option value="0-5">Open position · 0–5</option><option value="5-9">Middle neck · 5–9</option><option value="9-13">Upper neck · 9–13</option><option value="0-12">One octave · 0–12</option><option value="0-19">Whole neck · 0–19</option>
      </select></label>
      <label>First fret <input aria-label="First fret" type="number" min="0" max={last} value={first}
        onChange={e => adjust({ fret_window: [Math.max(0, Math.min(last, Math.trunc(Number(e.target.value)))), last] })} /></label>
      <label>Last fret <input aria-label="Last fret" type="number" min={first} max="24" value={last}
        onChange={e => adjust({ fret_window: [first, Math.max(first, Math.min(24, Math.trunc(Number(e.target.value))))] })} /></label>
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
    <FretboardDiagram label={`${context} fretboard`} tuning={stringTuning}
      layers={rootsOnly ? layers.map(layer => ({ ...layer, positions: layer.positions.filter(note => note.degree === '1') })) : layers}
      fretWindow={[first, last]} labels={labels} playing={playing}
      onSelect={onSelect || stringTuning ? selectNote : undefined} />
    <p className="learning-hint">String 1 is the thinnest, at the top. Fret 0 means an open string. <span className="learning-root-key">Root notes</span>{stringTuning && ' · Select a note to hear it.'}</p>
    {tuning && <div className="learning-pattern-practice" data-active={practice.active}><div className="music-controls"><label>Play direction<select value={direction} disabled={practice.running} onChange={event => { practice.reset(); setDirection(event.target.value); }}><option value="ascending">Ascending</option><option value="descending">Descending</option><option value="both">Up and down</option></select></label><span>{guide.length} notes · one note per beat</span></div><PracticeControls practice={{ ...practice, enter: () => { practice.setAudioMode('guide'); practice.enter(); } }} available={guide.length > 0} label="pattern" allowFocus={false} guideLabel="Listen to the highlighted notes, then try them yourself" /></div>}
    {audioError && <p role="alert">Audio is unavailable. You can still explore the notes.</p>}
  </div>;
}
