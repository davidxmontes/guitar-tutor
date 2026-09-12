import { useState } from 'react';
import { Hear } from './Fretboard';
import { physicalVoicing } from './harmony';
import type { ChordRef, HarmonyResolved } from './harmony';
import type { ComparePeer } from './compare';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';

export function ChordInspector({ context, chord, notes, functionLabel, hasKey, onExplore, onReplace }: {
  context: 'harmony' | 'progression'; chord: ChordRef; notes: { note: string; degree: string }[];
  functionLabel: string | null; hasKey: boolean; onExplore?: () => void; onReplace?: () => void;
}) {
  return <section aria-label="Chord inspector" data-context={context}><h3>{chord.root} {chord.quality}</h3>
    {onExplore && <button className="music-button" onClick={onExplore}>Explore →</button>}
    {context === 'progression' && onReplace && <button className="music-button" onClick={onReplace}>Replace chord</button>}
    <p>Chord tones · notes that make this chord</p>
    <div className="learning-note-chips">{notes.map(note => <span key={note.degree} className={note.degree === '1' ? 'is-root' : ''}><strong>{note.note}</strong><small>{note.degree === '1' ? 'Root' : note.degree}</small></span>)}</div>
    {hasKey ? <p>Function in key: {functionLabel ?? 'No function label for this scale or chord'}</p> : context === 'progression' && <p>Set a key</p>}
  </section>;
}

export function VoicingExplorer({ chord, data, tuning, initialView, busy, edit, compare }: {
  chord: ChordRef; data: HarmonyResolved; tuning: number[]; initialView?: unknown; busy: boolean;
  edit: (fields: Record<string, unknown>) => Promise<void>; compare: (peer: ComparePeer) => void;
}) {
  const [view, setView] = useState(initialView === 'caged' ? 'caged' : 'list');
  const options = view === 'caged' ? data.caged_regions.map(region => ({ ...region, tuning })) : data.voicings;
  return <section aria-label="Voicing explorer"><h3>{view === 'caged' ? 'One chord, five connected shapes' : 'Find a shape you can play'}</h3>
    <p className="learning-hint">{view === 'caged' ? 'CAGED connects movable C, A, G, E and D shapes. The shape name changes; the chord stays the same. Try two neighbouring shapes and listen for the same chord tones.' : 'A voicing is a way to arrange the notes of a chord. Hear a shape, select it to see its notes, or pin it for later.'}</p>
    <label>Voicing view <select value={view} onChange={event => setView(event.target.value)}><option value="list">Chord shapes</option><option value="caged">CAGED</option></select></label>
    {!options.length && <p>No {view === 'caged' ? 'CAGED shapes' : 'voicings'} available for this chord and tuning.</p>}
    <div className="learning-shapes">{options.map((option, index) => {
      const voicing = physicalVoicing(option);
      const selected = voicing.positions.length === data.voicing_positions.length && voicing.positions.every(note => data.voicing_positions.some(other => note.string === other.string && note.fret === other.fret));
      return <div className="learning-shape" data-selected={selected} key={`${view}:${index}`} role="group" aria-label={option.label}>
        <h4>{option.label}</h4><PhysicalChordDiagram positions={voicing.positions} tuning={tuning} label={`${chord.root} ${chord.quality} · ${option.label}`} />
        <p className="learning-hint">{voicing.positions.length} strings · frets {Math.min(...voicing.positions.map(note => note.fret))}–{Math.max(...voicing.positions.map(note => note.fret))}</p><div className="music-controls">
          <button className="music-button" aria-pressed={selected} disabled={busy} onClick={() => void edit({ focus: { kind: 'voicing', chord, voicing } })}>Select {option.label}</button>
          <Hear voicing={voicing} />
          <button className="music-button" disabled={busy} onClick={() => void edit({ pin: { chord, voicing } })}>Pin {option.label}</button>
          <button className="music-button" onClick={() => compare({ kind: 'voicing', id: JSON.stringify(voicing), label: `${chord.root} ${option.label}`, positions: option.positions })}>Compare {option.label}</button>
        </div>
      </div>;
    })}</div>
    {options.length > 0 && <p className="learning-hint">Read diagrams from the thickest string on the left to the thinnest on the right. ○ open string · × do not play.</p>}
  </section>;
}
