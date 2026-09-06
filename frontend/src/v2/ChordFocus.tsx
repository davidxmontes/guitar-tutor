import { useState } from 'react';
import { Hear } from './Fretboard';
import { physicalVoicing } from './harmony';
import type { ChordRef, HarmonyResolved } from './harmony';
import type { ComparePeer } from './compare';

export function ChordInspector({ context, chord, notes, functionLabel, hasKey, onExplore, onReplace }: {
  context: 'harmony' | 'progression'; chord: ChordRef; notes: { note: string; degree: string }[];
  functionLabel: string | null; hasKey: boolean; onExplore?: () => void; onReplace?: () => void;
}) {
  return <section aria-label="Chord inspector" data-context={context}><h3>{chord.root} {chord.quality}</h3>
    {onExplore && <button className="music-button" onClick={onExplore}>Explore →</button>}
    {context === 'progression' && onReplace && <button className="music-button" onClick={onReplace}>Replace chord</button>}
    <p>Chord tones: {notes.map(note => note.note).join(' · ')}</p>
    <p>Construction: {notes.map(note => note.degree).join(' · ')}</p>
    {hasKey ? <p>Function in key: {functionLabel ?? 'Non-diatonic chord'}</p> : context === 'progression' && <p>Set a key</p>}
  </section>;
}

export function VoicingExplorer({ chord, data, tuning, initialView, busy, edit, compare }: {
  chord: ChordRef; data: HarmonyResolved; tuning: number[]; initialView?: unknown; busy: boolean;
  edit: (fields: Record<string, unknown>) => Promise<void>; compare: (peer: ComparePeer) => void;
}) {
  const [view, setView] = useState(initialView === 'caged' ? 'caged' : 'list');
  const options = view === 'caged' ? data.caged_regions.map(region => ({ ...region, tuning })) : data.voicings;
  return <section aria-label="Voicing explorer"><h3>Voicings</h3>
    <label>Voicing view <select value={view} onChange={event => setView(event.target.value)}><option value="list">List</option><option value="caged">CAGED</option></select></label>
    {!options.length && <p>No {view === 'caged' ? 'CAGED shapes' : 'voicings'} available for this chord and tuning.</p>}
    {options.map((option, index) => {
      const voicing = physicalVoicing(option);
      return <div key={`${view}:${index}`} role="group" aria-label={option.label}>
        <h4>{option.label}</h4><div className="music-controls">
          <button className="music-button" disabled={busy} onClick={() => void edit({ focus: { kind: 'voicing', chord, voicing } })}>Select {option.label}</button>
          <Hear voicing={voicing} />
          <button className="music-button" disabled={busy} onClick={() => void edit({ pin: { chord, voicing } })}>Pin {option.label}</button>
          <button className="music-button" onClick={() => compare({ kind: 'voicing', id: JSON.stringify(voicing), label: `${chord.root} ${option.label}`, positions: option.positions })}>Compare {option.label}</button>
        </div>
      </div>;
    })}
  </section>;
}
