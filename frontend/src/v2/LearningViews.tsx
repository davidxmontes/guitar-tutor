import { samePositions } from './harmony';
import { MusicIcon } from './MusicIcon';
import { useMusicalInteraction } from './musicalInteraction';
import { useState } from 'react';
import { Fretboard, Hear } from './Fretboard';
import type { ViewConfig } from './Composition';
import type { HarmonyResolved } from './harmony';
import type { ChordRef } from '../types/music';
import { physicalVoicing } from './harmony';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';

export function CircleOfFifths({ keys, root, homeKey, scale, neighbours, busy, onSelect, chords = [], selectedChord, onChord }: {
  chords?: (ChordRef & { display: string; numeral: string })[]; selectedChord?: ChordRef; onChord?: (chord: ChordRef) => void;
  keys: string[]; root: string; homeKey?: string; scale: string; neighbours: string[]; busy: boolean; onSelect: (root: string) => void;
}) {
  const aliases: Record<string, string> = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb', 'Cb': 'B', 'Fb': 'E', 'E#': 'F', 'B#': 'C' };
  const canonical = (note: string) => aliases[note] ?? note;
  const point = (radius: number, angle: number) => [180 + radius * Math.cos(angle), 180 + radius * Math.sin(angle)];
  const wedge = (inner: number, outer: number, index: number) => {
    const angle = index * Math.PI / 6 - Math.PI / 2;
    const start = angle - Math.PI / 12 + .012;
    const end = angle + Math.PI / 12 - .012;
    return `M ${point(outer, start)} A ${outer} ${outer} 0 0 1 ${point(outer, end)} L ${point(inner, end)} A ${inner} ${inner} 0 0 0 ${point(inner, start)} Z`;
  };
  return <section className="learning-circle-panel" aria-label="Circle of fifths"><h3>Circle of fifths</h3>
    <p className="circle-instructions">Outer ring · change root <span>Inner ring · select chord</span></p>
    <svg className="harmonic-wheel" viewBox="0 0 360 360" aria-label="Tonal roots and diatonic chords">
      {keys.map((key, index) => {
        const angle = index * Math.PI / 6 - Math.PI / 2;
        const [x, y] = point(148, angle);
        const [cx, cy] = point(94, angle);
        const chord = chords.find(chord => canonical(chord.root) === canonical(key));
        const activate = (event: React.KeyboardEvent, action: () => void) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!busy) action(); } };
        return <g key={key}>
          <g role="button" tabIndex={busy ? -1 : 0} aria-disabled={busy} aria-label={`Key ${key}`} aria-pressed={canonical(homeKey ?? root) === canonical(key)} className="wheel-root" data-neighbour={neighbours.includes(key)}
            onClick={() => { if (!busy) onSelect(key); }} onKeyDown={event => activate(event, () => onSelect(key))}>
            <path d={wedge(124, 176, index)} /><text x={x} y={y + 6}>{key.replace('b', '♭').replace('#', '♯')}</text>
          </g>
          {chord ? <g role="button" tabIndex={busy ? -1 : 0} aria-disabled={busy} aria-label={`Circle chord ${chord.display}`} aria-pressed={selectedChord?.root === chord.root && selectedChord?.quality === chord.quality} className="wheel-chord" data-quality={chord.quality}
            onClick={() => { if (!busy) onChord?.({ root: chord.root, quality: chord.quality }); }} onKeyDown={event => activate(event, () => onChord?.({ root: chord.root, quality: chord.quality }))}>
            <path d={wedge(64, 120, index)} /><text x={cx} y={cy - 1}>{chord.display.replace('b', '♭').replace('#', '♯')}</text><text className="wheel-numeral" x={cx} y={cy + 14}>{chord.numeral}</text>
          </g> : <path className="wheel-empty" d={wedge(64, 120, index)} aria-hidden="true" />}
        </g>;
      })}
      <text className="wheel-center-root" x="180" y="176">{root.replace('b', '♭').replace('#', '♯')}</text>
      <text className="wheel-center-scale" x="180" y="199">{scale.replaceAll('_', ' ')}</text>
    </svg>
    {!chords.length && <p className="learning-hint">No diatonic chord ring for this scale.</p>}
    <details className="learning-details circle-help"><summary>How to use the rings</summary><p>Move clockwise by a fifth, or counterclockwise by a fourth. The outer ring changes the root and keeps {scale.replaceAll('_', ' ')}. The inner ring selects a chord without changing your key; its numeral shows the chord’s degree.</p><p>{neighbours.length ? `Neighbours of ${root}: ${neighbours.join(' and ')}.` : 'Choose a root to explore its neighbours.'} Major keys one step apart share six notes.</p></details>
  </section>;
}

export function TriadExplorer({ chord, data, busy, edit, config }: {
  chord: ChordRef; data: HarmonyResolved; busy: boolean; edit: (fields: Record<string, unknown>) => Promise<void>; config?: Record<string, unknown>;
}) {
  const interaction = useMusicalInteraction();
  const [strings, setStrings] = useState(Number(config?.string_set ?? 1));
  const [inversion, setInversion] = useState(String(config?.inversion ?? 'all'));
  const [limit, setLimit] = useState(Number(config?.max_shapes ?? 12));
  const [view, setView] = useState<ViewConfig>({ labels: 'degrees' });
  const options = data.triads.filter(shape => shape.strings[0] === strings && (inversion === 'all' || shape.inversion === Number(inversion)));
  const names = ['Root position', 'First inversion', 'Second inversion'];
  return <section aria-label="Triad explorer"><h3>Three notes, three inversions</h3>
    <p>A triad uses a root, third and fifth. An inversion changes the lowest note, while the root stays {chord.root}.</p>
    <div className="music-controls"><label>String set<select aria-label="String set" value={strings} onChange={event => setStrings(Number(event.target.value))}>{[1, 2, 3, 4].map(first => <option key={first} value={first}>{first} · {first + 1} · {first + 2}{first === 1 ? ' (highest strings)' : first === 4 ? ' (lowest strings)' : ''}</option>)}</select></label>
      <label>Inversion<select aria-label="Inversion" value={inversion} onChange={event => setInversion(event.target.value)}><option value="all">All inversions</option>{names.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
    </div>
    {!options.length && <p className="learning-hint">Choose a major, minor, diminished or augmented chord to explore three-note shapes.</p>}
    <div className="learning-shapes">{options.slice(0, limit).map(shape => { const voicing = physicalVoicing(shape); const selected = samePositions(shape.positions, data.voicing_positions); return <article key={JSON.stringify(voicing.positions)} className="learning-shape" data-selected={selected}>
      <h4>{names[shape.inversion]}</h4><p>{shape.bass} in the bass · frets {Math.min(...shape.positions.map(p => p.fret))}–{Math.max(...shape.positions.map(p => p.fret))}</p>
      <PhysicalChordDiagram positions={shape.positions} tuning={shape.tuning} label={`${chord.root} ${chord.quality} · ${names[shape.inversion]}`} selected={selected} disabled={busy}
        onSelect={() => interaction ? interaction.select({ type: 'voicing', chord, voicing }) : void edit({ focus: { kind: 'voicing', chord, voicing } })}
        onPreview={active => interaction?.showPreview(active ? { label: `${names[shape.inversion]} preview`, voicing } : null)} />
      <div className="learning-note-chips">{[...shape.positions].sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0)).map(note => <span key={note.string} data-root={note.degree === '1'}>{note.note}<small>{note.degree === '1' ? 'root' : note.degree}</small></span>)}</div>
      <div className="music-controls"><Hear voicing={voicing} /><button className="music-button music-icon-button" aria-label="Pin shape" title="Pin shape" disabled={busy} onClick={() => void edit({ pin: { chord, voicing } })}><MusicIcon name="pin" /></button></div>
    </article>; })}</div>
    {limit < Math.min(options.length, 12) && <button className="music-button" onClick={() => setLimit(12)}>Show more shapes</button>}
    {options.length > 0 && <details className="learning-details"><summary>See these chord tones across the neck</summary><Fretboard context="harmony" tuning={options[0].tuning} layers={[{ id: 'triad', label: `${chord.root} ${chord.quality}`, focal: true, positions: data.chord_positions }]} config={view} onNudge={next => setView(previous => ({ ...previous, ...next }))} /></details>}
    {options.length > 0 && <p className="learning-hint">Diagrams run from thick strings on the left to thin strings on the right. ○ open string · × do not play. The number beside the grid is the first displayed fret.</p>}
  </section>;
}
