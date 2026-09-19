import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { ForwardedRef } from 'react';
import './YouTubePlayer.css';

export type YouTubeState = 'loading' | 'unstarted' | 'cued' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error' | 'blocked';
export interface YouTubeControls {
  getCurrentTime(): number | null;
  getDuration(): number | null;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
}
interface Props {
  videoId: string;
  onReadyChange(ready: boolean): void;
  onTime(seconds: number): void;
  onStateChange(state: YouTubeState): void;
}
interface Player {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}
type PlayerEvent = { target: Player; data?: number };
type PlayerAPI = { Player: new (element: HTMLIFrameElement, options: { events: Record<string, (event: PlayerEvent) => void> }) => Player };
type YouTubeWindow = Window & { YT?: PlayerAPI; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<PlayerAPI> | undefined;

function loadAPI(): Promise<PlayerAPI> {
  const scope = window as YouTubeWindow;
  if (scope.YT?.Player) return Promise.resolve(scope.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previous = scope.onYouTubeIframeAPIReady;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.onerror = null;
      if (scope.onYouTubeIframeAPIReady === ready) scope.onYouTubeIframeAPIReady = previous;
      if (error) { script.remove(); apiPromise = undefined; reject(error); }
      else resolve(scope.YT!);
    };
    const ready = () => { finish(); previous?.(); };
    const timer = window.setTimeout(() => finish(new Error('YouTube took too long to load. Please try again.')), 15000);
    scope.onYouTubeIframeAPIReady = ready;
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => finish(new Error('YouTube could not load. Check your connection and try again.'));
    document.head.append(script);
  });
  return apiPromise;
}

const states: Record<number, YouTubeState> = { [-1]: 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };
const errors: Record<number, string> = {
  2: 'This YouTube video link is invalid.',
  5: 'This browser could not play the YouTube video.',
  100: 'This YouTube video is unavailable or private.',
  101: 'The owner of this video does not allow embedding.',
  150: 'The owner of this video does not allow embedding.',
  153: 'YouTube could not identify this site. Try opening the app in your browser.',
};

function seekPlayer(player: Player, seconds: number) {
  const playing = player.getPlayerState() === 1;
  // Seeking a cued/unstarted video can start it. Calibration must stay paused.
  if (!playing) player.pauseVideo();
  player.seekTo(seconds, true);
  if (!playing) player.pauseVideo();
}

function visible(iframe: HTMLIFrameElement | null) {
  if (!iframe || document.hidden) return false;
  const box = iframe.getBoundingClientRect();
  const width = Math.max(0, Math.min(box.right, window.innerWidth) - Math.max(box.left, 0));
  const height = Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0));
  return width * height > box.width * box.height / 2;
}

export const YouTubePlayer = forwardRef<YouTubeControls, Props>(function YouTubePlayer(props, ref) {
  return <PlayerInstance key={props.videoId} {...props} controlsRef={ref} />;
});

function PlayerInstance({ videoId, controlsRef, ...events }: Props & { controlsRef: ForwardedRef<YouTubeControls> }) {
  const container = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const player = useRef<Player | null>(null);
  const ready = useRef(false);
  const pendingSeek = useRef<number | null>(null);
  const callbacks = useRef(events);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState<string | null>('Loading YouTube video…');
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => { callbacks.current = events; });

  useImperativeHandle(controlsRef, () => ({
    getCurrentTime: () => ready.current && player.current ? player.current.getCurrentTime() : null,
    getDuration: () => ready.current && player.current ? player.current.getDuration() || null : null,
    play: () => { if (ready.current && visible(iframe.current)) player.current?.playVideo(); },
    pause: () => { if (ready.current) player.current?.pauseVideo(); },
    seek: seconds => {
      if (!Number.isFinite(seconds) || seconds < 0) return;
      if (ready.current && player.current) seekPlayer(player.current, seconds);
      else if (!failed) pendingSeek.current = seconds;
    },
  }), [failed]);

  useEffect(() => {
    let disposed = false;
    let instance: Player | null = null;
    let frame: HTMLIFrameElement | null = null;
    let timeout: number | undefined;
    let poll: number | undefined;
    const observer = new IntersectionObserver(() => { if (ready.current && !visible(frame)) instance?.pauseVideo(); }, { threshold: [0, 0.5, 1] });
    const pauseHidden = () => { if (document.hidden && ready.current) instance?.pauseVideo(); };
    document.addEventListener('visibilitychange', pauseHidden);
    callbacks.current.onReadyChange(false);
    callbacks.current.onStateChange('loading');
    const publishTime = () => {
      if (disposed || !ready.current || !instance) return;
      const time = instance.getCurrentTime();
      if (Number.isFinite(time) && time >= 0) callbacks.current.onTime(time);
    };
    const fail = (text: string) => {
      if (disposed) return;
      clearTimeout(timeout); clearInterval(poll);
      ready.current = false;
      pendingSeek.current = null;
      instance?.destroy(); frame?.remove(); instance = null; player.current = null;
      callbacks.current.onReadyChange(false);
      callbacks.current.onStateChange('error');
      setMessage(text); setFailed(true);
    };
    void loadAPI().then(api => {
      if (disposed) return;
      frame = document.createElement('iframe');
      frame.title = 'YouTube video player';
      frame.allow = 'autoplay; encrypted-media; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      const parameters = new URLSearchParams({ enablejsapi: '1', origin: window.location.origin, playsinline: '1', controls: '1', autoplay: '0' });
      frame.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${parameters}`;
      iframe.current = frame;
      container.current!.append(frame);
      observer.observe(frame);
      timeout = window.setTimeout(() => fail('The video took too long to become ready. Please try again.'), 15000);
      instance = new api.Player(frame, { events: {
        onReady: () => {
          if (disposed || !instance || ready.current) return;
          clearTimeout(timeout);
          ready.current = true;
          setMessage(null);
          callbacks.current.onReadyChange(true);
          callbacks.current.onStateChange(states[instance.getPlayerState()] ?? 'unstarted');
          if (pendingSeek.current !== null) { seekPlayer(instance, pendingSeek.current); pendingSeek.current = null; }
          publishTime();
          poll = window.setInterval(publishTime, 200);
        },
        onStateChange: event => {
          if (disposed || !ready.current) return;
          if (event.data === 1 && !visible(frame)) { instance?.pauseVideo(); return; }
          callbacks.current.onStateChange(states[event.data ?? -1] ?? 'unstarted');
          if (event.data === 1) setMessage(null);
          publishTime();
        },
        onError: event => fail(errors[event.data ?? 0] ?? 'YouTube could not play this video. Please try again.'),
        onAutoplayBlocked: () => {
          if (disposed || !ready.current) return;
          const text = 'Press Play in the video to start playback.';
          callbacks.current.onStateChange('blocked');
          setMessage(text);
        },
      } });
      player.current = instance;
    }).catch(error => fail(error instanceof Error ? error.message : 'YouTube could not load. Please try again.'));
    return () => {
      disposed = true;
      clearTimeout(timeout); clearInterval(poll);
      observer.disconnect(); document.removeEventListener('visibilitychange', pauseHidden);
      ready.current = false;
      player.current = null; iframe.current = null;
      instance?.destroy(); frame?.remove();
      callbacks.current.onReadyChange(false);
    };
  }, [videoId, attempt]);

  return <div className="youtube-player">
    <div ref={container} className="youtube-player-frame" />
    {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
    {failed && <button type="button" className="music-button" onClick={() => { setMessage('Loading YouTube video…'); setFailed(false); setAttempt(value => value + 1); }}>Retry video</button>}
  </div>;
}
