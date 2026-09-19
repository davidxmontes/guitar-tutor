import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { YouTubePlayer } from '../src/v2/YouTubePlayer';
import type { YouTubeControls, YouTubeState } from '../src/v2/YouTubePlayer';

export function Demo() {
  const controls = useRef<YouTubeControls>(null);
  const [mounted, setMounted] = useState(true);
  const [videoId, setVideoId] = useState('M7lc1UVf-VE');
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<YouTubeState>('loading');
  const [time, setTime] = useState(-1);
  return <>
    <button onClick={() => setMounted(value => !value)}>Toggle player</button>
    <button onClick={() => setVideoId('abcdefghijk')}>Replace video</button>
    <button onClick={() => controls.current?.seek(6.75)}>Seek earlier</button>
    <button onClick={() => controls.current?.seek(12.5)}>Seek selection</button>
    <button onClick={() => controls.current?.play()}>Play selection</button>
    <button onClick={() => controls.current?.pause()}>Pause selection</button>
    <p>Ready: <output data-testid="ready">{String(ready)}</output>; State: <output data-testid="state">{state}</output>; Time: <output data-testid="time">{time}</output></p>
    {mounted && <YouTubePlayer ref={controls} videoId={videoId} onReadyChange={value => setReady(value)} onStateChange={value => setState(value)} onTime={value => setTime(value)} />}
    <div style={{ height: 1800 }}>Scroll space</div>
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);
