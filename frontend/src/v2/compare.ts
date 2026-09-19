import { useState } from 'react';
import type { Composition } from '../types/v2';

export type ComparePeer = { kind: 'scale' | 'chord' | 'voicing' | 'progression-idea'; id: string; label: string; [key: string]: unknown };

export function useCompare() {
  const [selection, setSelection] = useState<ComparePeer[]>([]);
  const [error, setError] = useState('');
  function toggle(peer: ComparePeer) {
    const exists = selection.some(value => value.id === peer.id && value.kind === peer.kind);
    if (!exists && (selection.length === 4 || (selection.length > 0 && selection[0].kind !== peer.kind))) {
      setError('Choose peers of the same kind (up to four).');
      return;
    }
    setError('');
    setSelection(exists ? selection.filter(value => value.id !== peer.id) : [...selection, peer]);
  }
  return { selection, error, toggle, clear: () => { setSelection([]); setError(''); } };
}

export function comparisonComposition(peers: ComparePeer[]): Composition {
  if (peers.length < 2 || peers.length > 4 || new Set(peers.map(peer => peer.kind)).size !== 1) {
    throw new Error('Comparison requires 2–4 same-kind peers');
  }
  return { pattern: 'comparison', focal: 'peers', slots: {
    peers: peers.map(peer => ({ kind: 'fretboard', subject: peer })),
  } };
}
