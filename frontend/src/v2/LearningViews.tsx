import { useState } from 'react';
import { Fretboard, Hear } from './Fretboard';
import type { ViewConfig } from './Composition';
import type { ChordRef, HarmonyResolved } from './harmony';
import { physicalVoicing } from './harmony';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';

export function CircleOfFifths({ keys, root, homeKey, scale, neighbours, busy, onSelect }: {
  keys: string[]; root: string; homeKey?: string; scale: string; neighbours: string[]; busy: boolean; onSelect: (root: string) => void;
}) {
  return <section className="learning-circle-panel" aria-label="Circle of fifths"><h3>Circle of fifths</h3>
    <p>Move clockwise by a fifth, or counterclockwise by a fourth. Choose a root to explore; your selected scale stays the same.</p>
    <div className="learning-circle">
      <div className="learning-circle-center"><strong>{root}</strong><span>{scale.replaceAll('_', ' ')}</span></div>
      {keys.map((key, index) => { const angle = index * Math.PI / 6 - Math.PI / 2; return <button key={key} className="music-button" disabled={busy} aria-label={`Key ${key}`} aria-pressed={(homeKey ?? root) === key} data-neighbour={neighbours.includes(key)} style={{ left: `${50 + 40 * Math.cos(angle)}%`, top: `${50 + 40 * Math.sin(angle)}%` }} onClick={() => onSelect(key)}>{key}</button>; })}
    </div>
    <p className="learning-hint">{neighbours.length > 0 ? `Neighbours of ${root}: ${neighbours.join(' and ')}. Compare their sounds using the same scale.` : 'Select a root to see its neighbours.'}</p>
    <details className="learning-details"><summary>What does the circle tell me?</summary><p>Major keys one step apart share six of their seven notes. Moving clockwise adds a sharp or removes a flat; counterclockwise does the reverse. Each major key also shares its notes with a relative minor, starting on its sixth degree: C major and A minor, for example.</p><p>The buttons above change the root of your current scale. Try the Major scale to explore those key relationships.</p></details>
  </section>;
}

export function TriadExplorer({ chord, data, busy, edit, config }: {
  chord: ChordRef; data: HarmonyResolved; busy: boolean; edit: (fields: Record<string, unknown>) => Promise<void>; config?: Record<string, unknown>;
}) {
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
    <div className="learning-shapes">{options.slice(0, limit).map(shape => { const voicing = physicalVoicing(shape); const selected = shape.positions.length === data.voicing_positions.length && shape.positions.every(note => data.voicing_positions.some(other => note.string === other.string && note.fret === other.fret)); return <article key={JSON.stringify(voicing.positions)} className="learning-shape" data-selected={selected}>
      <h4>{names[shape.inversion]}</h4><p>{shape.bass} in the bass · frets {Math.min(...shape.positions.map(p => p.fret))}–{Math.max(...shape.positions.map(p => p.fret))}</p>
      <PhysicalChordDiagram positions={shape.positions} tuning={shape.tuning} label={`${chord.root} ${chord.quality}`} />
      <div className="learning-note-chips">{[...shape.positions].sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0)).map(note => <span key={note.string} data-root={note.degree === '1'}>{note.note}<small>{note.degree === '1' ? 'root' : note.degree}</small></span>)}</div>
      <div className="music-controls"><Hear voicing={voicing} /><button className="music-button" aria-pressed={selected} disabled={busy} onClick={() => void edit({ focus: { kind: 'voicing', chord, voicing } })}>Focus shape</button><button className="music-button" disabled={busy} onClick={() => void edit({ pin: { chord, voicing } })}>Pin shape</button></div>
    </article>; })}</div>
    {limit < Math.min(options.length, 12) && <button className="music-button" onClick={() => setLimit(12)}>Show more shapes</button>}
    {options.length > 0 && <details className="learning-details"><summary>See these chord tones across the neck</summary><Fretboard context="harmony" tuning={options[0].tuning} layers={[{ id: 'triad', label: `${chord.root} ${chord.quality}`, focal: true, positions: data.chord_positions }]} config={view} onNudge={next => setView(previous => ({ ...previous, ...next }))} onSelect={() => {}} /></details>}
    {options.length > 0 && <p className="learning-hint">Diagrams run from thick strings on the left to thin strings on the right. ○ open string · × do not play. The number beside the grid is the first displayed fret.</p>}
  </section>;
}
