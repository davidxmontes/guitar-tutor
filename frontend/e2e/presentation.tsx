import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CompositionView } from '../src/v2/Composition';
import type { Composition } from '../src/v2/Composition';

const fretboard = { kind: 'fretboard', config: { labels: 'notes', fret_window: [0, 12] } };
const explanation = { kind: 'explanation', config: { text: 'Listen for the notes that stay the same as the chord changes.' } };
const comparison: Composition = { pattern: 'comparison', focal: 'peers', slots: {
  peers: [{ kind: 'chord-inspector' }, { kind: 'chord-inspector' }], context: [explanation],
} };
const surfaces: Record<string, Composition> = {
  'hero-with-support': { pattern: 'hero-with-support', focal: 'hero', slots: { hero: [fretboard], support: [explanation] } },
  comparison,
  'master-detail': { pattern: 'master-detail', focal: 'detail', slots: { list: [{ kind: 'progression-idea-list' }], detail: [fretboard] } },
  'explanation-led': { pattern: 'explanation-led', focal: 'explanation', slots: { explanation: [explanation], illustration: [fretboard] } },
  nested: { pattern: 'hero-with-support', focal: 'hero', slots: { hero: [comparison], support: [explanation] } },
};
export function Demo() {
  const [turn, setTurn] = useState(0);
  const [, edit] = useState(0);
  return <>
    <h1>Hear what connects the chords</h1>
    <CompositionView composition={surfaces[new URLSearchParams(location.search).get('pattern') ?? 'hero-with-support']}
      liveTurnId={String(turn)} renderBlock={(block, _path, nudge) => {
        if (block.kind !== 'fretboard') return <p>{String(block.config?.text ?? block.kind.replaceAll('-', ' '))}</p>;
        const window = block.config?.fret_window as [number, number];
        return <>
          <p data-testid="view-config">Frets {window[0]}–{window[1]} · {String(block.config?.labels)}</p>
          <label>First fret <input type="number" min="0" max={window[1]} value={window[0]} onChange={e => nudge({ fret_window: [Number(e.target.value), window[1]] })} style={{ width: '3rem' }} /></label>
          <label>Note labels <select value={String(block.config?.labels)} onChange={e => nudge({ labels: e.target.value as 'notes' | 'degrees' })}><option>notes</option><option>degrees</option></select></label>
        </>;
      }} />
    <button onClick={() => edit(value => value + 1)}>Musical edit</button>
    <button onClick={() => setTurn(value => value + 1)}>Next turn</button>
  </>;
}
createRoot(document.getElementById('root')!).render(<Demo />);
