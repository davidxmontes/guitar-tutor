import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CompositionView } from '../src/v2/Composition';
import { Fretboard, FretboardDiagram, Hear } from '../src/v2/Fretboard';
import { PhysicalChordDiagram } from '../src/v2/PhysicalChordDiagram';
import '../src/index.css';
import '../src/v2/Theme.css';
import '../src/v2/Controls.css';
import { CandidateSet, ComparisonView, Explanation, NoteGroupOverlay, WorkspaceHeader } from '../src/v2/SharedBlocks';
import { useCompare } from '../src/v2/compare';
import type { NoteLayer } from '../src/v2/Fretboard';

const layers: NoteLayer[] = [
  { id: 'scale', label: 'scale', positions: [{ note: 'D', degree: '2', string: 2, fret: 3 }] },
  { id: 'chord', label: 'chord', focal: true, positions: [{ note: 'C', degree: '1', string: 2, fret: 1 }] },
];
const cMajor = { positions: [{ string: 5, fret: 3 }, { string: 4, fret: 2 }, { string: 3, fret: 0 }, { string: 2, fret: 1 }, { string: 1, fret: 0 }], tuning: [64, 59, 55, 50, 45, 40] };

export function Demo() {
  const [turn, setTurn] = useState(0);
  const [selected, setSelected] = useState('');
  const [count, setCount] = useState(0);
  const [action, setAction] = useState('');
  const [shapeSelected, setShapeSelected] = useState(false);
  const compare = useCompare();
  return <>
    <WorkspaceHeader title="Harmony" focus="C major" onBack={() => setSelected('')}><span>C major · Standard tuning</span></WorkspaceHeader>
    <p data-testid="selected-note">{selected}</p><span data-testid="focus-count">{count}</span>
    <CompositionView liveTurnId={String(turn)} composition={{ pattern: 'hero-with-support', focal: 'hero', slots: { hero: [{ kind: 'fretboard' }], support: [{ kind: 'explanation' }] } }}
      renderBlock={(block, _path, nudge) => block.kind === 'fretboard'
        ? <NoteGroupOverlay group={{ id: 'highlight', label: 'highlight', positions: [{ note: 'G', degree: '5', string: 1, fret: 3 }] }}>{layer =>
          <Fretboard context="harmony" layers={[...layers, layer]} config={block.config} onNudge={nudge}
            onSelect={note => { setSelected(`${note.note} on string ${note.string} fret ${note.fret}`); setCount(n => n + 1); }} />}</NoteGroupOverlay>
        : <Explanation text="Hear the chord against its scale." />} />
    <button onClick={() => setTurn(turn + 1)}>Next turn</button>
    <div className="music-controls">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => compare.toggle({ kind: 'scale', id: String(n), label: `Scale ${n}` })}>Compare scale {n}</button>)}
      <button onClick={() => compare.toggle({ kind: 'chord', id: 'chord', label: 'Chord' })}>Compare chord</button></div>
    <p role="status">{compare.error}</p>
    <ComparisonView peers={compare.selection} onClear={compare.clear} renderPeer={peer => <p>{peer.label}</p>} />
    <CandidateSet candidates={[{ id: 'one', label: 'Warm voicing' }]} onPlay={() => setAction('Play')} onKeep={() => setAction('Keep')} onDevelop={() => setAction('Develop')} onDismiss={() => setAction('Dismiss')} />
    <p data-testid="candidate-action">{action}</p>
    <section aria-label="Read-only comparison">
      <Fretboard context="harmony" layers={layers} onNudge={() => {}} />
    </section>
    <section aria-label="Reusable music displays">
      <h2>Bare fretboard</h2>
      <FretboardDiagram label="C and D on the neck" layers={layers} fretWindow={[0, 5]} />
      <h2>Shape alone</h2>
      <PhysicalChordDiagram label="C major" {...cMajor} />
      <div className="music-controls" role="group" aria-label="Compact playable shape">
        <strong>C major</strong>
        <PhysicalChordDiagram label="Compact C major" {...cMajor} selected={shapeSelected} onSelect={() => setShapeSelected(value => !value)} />
        <Hear label="Hear compact C major" voicing={cMajor} />
      </div>
    </section>
  </>;
}
createRoot(document.getElementById('root')!).render(<Demo />);
