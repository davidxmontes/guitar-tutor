import { useEffect, useRef } from 'react';
import { playChord } from '../utils/audio';
import type { ViewConfig } from './Composition';
import './Fretboard.css';

export type ResolvedNote = { string: number; fret: number; note: string; degree?: string; midi?: number; pitch_class?: number };
export type NoteLayer = { id: string; label: string; positions: ResolvedNote[]; focal?: boolean };
export type VoicingValue = { positions: { string: number; fret: number }[]; tuning: number[] };

export function Hear({ voicing, label = 'Hear' }: { voicing: VoicingValue; label?: string }) {
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => { stop.current?.(); }, []);
  return <button type="button" className="music-button" disabled={!voicing.positions.length} onClick={() => {
    stop.current?.();
    stop.current = playChord(voicing.positions, .03, 1.2, voicing.tuning);
  }}>{label}</button>;
}

/** One resolved-data fretboard for both workspace capability contexts. */
export function Fretboard({ context, layers, config = {}, onNudge, onSelect, preview }: {
  context: 'harmony' | 'progression';
  layers: NoteLayer[];
  config?: ViewConfig;
  onNudge: (value: ViewConfig) => void;
  onSelect: (note: ResolvedNote, layer: NoteLayer) => void;
  preview?: VoicingValue;
}) {
  const [first, last] = config.fret_window ?? [0, 12];
  const labels = config.labels ?? 'notes';
  const count = last - first + 1;
  const width = Math.max(360, count * 56 + 40);
  const x = (fret: number) => 40 + (fret - first + .5) * ((width - 48) / count);
  const y = (string: number) => 36 + (string - 1) * 34;
  return <div className="music-fretboard" data-context={context}>
    <div className="music-controls">
      <label>First fret <input aria-label="First fret" type="number" min="0" max={last} value={first}
        onChange={e => onNudge({ fret_window: [Number(e.target.value), last] })} /></label>
      <label>Last fret <input aria-label="Last fret" type="number" min={first} max="24" value={last}
        onChange={e => onNudge({ fret_window: [first, Number(e.target.value)] })} /></label>
      <label>Note labels <select value={labels} onChange={e => onNudge({ labels: e.target.value as 'notes' | 'degrees' })}>
        <option value="notes">Notes</option><option value="degrees">Degrees</option>
      </select></label>
      {preview && <Hear voicing={preview} label="Hear voicing" />}
    </div>
    <ul aria-label="Fretboard layers" className="music-layer-legend">
      {layers.map(layer => <li key={layer.id}>{layer.label}{layer.focal ? ' — main focus' : ' — context'}</li>)}
    </ul>
    <div className="music-neck-scroll" tabIndex={0} aria-label="Scrollable fretboard">
      <svg width={width} height="244" viewBox={`0 0 ${width} 244`} aria-label={`${context} fretboard`}>
        {Array.from({ length: 6 }, (_, index) => <g key={index} aria-hidden="true">
          <text x="8" y={y(index + 1) + 4}>{index + 1}</text>
          <line x1="32" x2={width - 8} y1={y(index + 1)} y2={y(index + 1)} stroke="currentColor" strokeWidth={.7 + index * .2} />
        </g>)}
        {Array.from({ length: count }, (_, index) => <g key={index} aria-hidden="true">
          <line x1={x(first + index) + 22} x2={x(first + index) + 22} y1="24" y2="218" stroke="currentColor" opacity=".2" />
          <text x={x(first + index)} y="238" textAnchor="middle">{first + index}</text>
        </g>)}
        {[...layers].sort((a, b) => Number(!!a.focal) - Number(!!b.focal)).map(layer => <g key={layer.id}>
          {layer.positions.filter(note => note.fret >= first && note.fret <= last).map(note => (
            <g key={`${note.string}.${note.fret}`} role="button" tabIndex={0}
              className={`music-note ${layer.focal ? 'music-note--focal' : ''}`}
              aria-label={`${note.note}, degree ${note.degree ?? 'unknown'}, string ${note.string}, fret ${note.fret}, ${layer.label}${layer.focal ? ', main focus' : ', context'}`}
              onClick={() => onSelect(note, layer)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(note, layer); } }}>
              <circle cx={x(note.fret)} cy={y(note.string)} r={layer.focal ? 15 : 12} strokeWidth={layer.focal ? 3 : 1} strokeDasharray={layer.focal ? undefined : '2 2'} />
              <text x={x(note.fret)} y={y(note.string) + 4} textAnchor="middle" aria-hidden="true">{labels === 'degrees' ? note.degree ?? '—' : note.note}</text>
            </g>
          ))}
        </g>)}
      </svg>
    </div>
  </div>;
}
