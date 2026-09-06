import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CompositionView } from '../src/v2/Composition';
import { Fretboard } from '../src/v2/Fretboard';
import { CandidateSet, ComparisonView, Explanation, NoteGroupOverlay, WorkspaceHeader } from '../src/v2/SharedBlocks';
import { useCompare } from '../src/v2/compare';
import type { NoteLayer } from '../src/v2/Fretboard';

const layers: NoteLayer[] = [
  { id: 'scale', label: 'scale', positions: [{ note: 'D', degree: '2', string: 2, fret: 3 }] },
  { id: 'chord', label: 'chord', focal: true, positions: [{ note: 'C', degree: '1', string: 2, fret: 1 }] },
];
export function Demo() {
  const [turn, setTurn] = useState(0);
  const [selected, setSelected] = useState('');
  const [count, setCount] = useState(0);
  const [action, setAction] = useState('');
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
  </>;
}
createRoot(document.getElementById('root')!).render(<Demo />);
