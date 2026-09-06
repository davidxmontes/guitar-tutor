import { useEffect, useRef, useState } from 'react';
import { playChordSequence } from '../utils/audio';
import type { ChordRef, HarmonyResolved } from './harmony';

export function ScratchSequence({ data, chord, busy, edit, develop }: {
  data: HarmonyResolved['scratch']; chord?: ChordRef; busy: boolean;
  edit: (fields: Record<string, unknown>) => Promise<void>; develop: () => Promise<void>;
}) {
  const stopAudio = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playing, setPlaying] = useState(false);
  function stop() { stopAudio.current?.(); if (timer.current) clearInterval(timer.current); timer.current = null; setPlaying(false); }
  useEffect(() => () => { stopAudio.current?.(); if (timer.current) clearInterval(timer.current); }, [data]);
  function play(loop: boolean) {
    stop();
    const chords = data.map(item => item.voicing).filter(value => value !== null);
    if (!chords.length) return;
    stopAudio.current = playChordSequence(chords); setPlaying(true);
    if (loop) timer.current = setInterval(() => { stopAudio.current = playChordSequence(chords); }, chords.length * 1200);
    else timer.current = setInterval(stop, chords.length * 1200);
  }
  function move(index: number, offset: number) {
    const ids = data.map(item => item.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    stop(); void edit({ mutation: { kind: 'scratch_reorder', ids } });
  }
  return <section aria-label="Scratch sequence"><h3>Scratch sequence</h3>
    {chord && <button className="music-button" disabled={busy} onClick={() => void edit({ mutation: { kind: 'scratch_add', chord } })}>Add focused chord</button>}
    <ol>{data.map((item, index) => <li key={item.id}><span>{item.root} {item.quality}</span><div className="music-controls">
      <button className="music-button" disabled={busy || index === 0} onClick={() => move(index, -1)}>Move up</button>
      <button className="music-button" disabled={busy || index === data.length - 1} onClick={() => move(index, 1)}>Move down</button>
      <button className="music-button" disabled={busy} onClick={() => { stop(); void edit({ mutation: { kind: 'scratch_remove', id: item.id } }); }}>Remove</button>
    </div></li>)}</ol>
    <div className="music-controls"><button className="music-button" disabled={!data.length} onClick={() => play(false)}>Play scratch</button><button className="music-button" disabled={!data.length} onClick={() => play(true)}>Loop scratch</button><button className="music-button" disabled={!playing} onClick={stop}>Stop scratch</button><button className="music-button" disabled={busy || !data.length} onClick={() => void develop()}>Develop →</button></div>
  </section>;
}
