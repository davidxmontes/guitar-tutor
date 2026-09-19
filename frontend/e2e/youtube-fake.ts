import type { Page } from '@playwright/test';

type FakeOptions = { autoReady?: boolean; failLoads?: number };
type PlayerEvent = { target: FakePlayer; data?: number };
type Events = Record<string, (event: PlayerEvent) => void>;
interface FakePlayer {
  time: number;
  state: number;
  duration: number;
  destroyed: boolean;
  reads: number;
  ready(): void;
  emitState(state: number): void;
  fail(code: number): void;
  block(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}

declare global {
  interface Window {
    youtubeFake: { players: FakePlayer[]; active: FakePlayer };
  }
}

// Served in place of the remote script; the real React boundary still runs.
function fakeScript(options: FakeOptions) {
  const players: FakePlayer[] = [];
  class Player implements FakePlayer {
    time = 0;
    state = -1;
    duration = 120;
    destroyed = false;
    reads = 0;
    iframe: HTMLIFrameElement;
    events: Events;
    constructor(iframe: HTMLIFrameElement, config: { events: Events }) {
      this.iframe = iframe;
      this.events = config.events;
      players.push(this);
      if (options.autoReady !== false) setTimeout(() => this.ready(), 0);
    }
    ready() { this.events.onReady?.({ target: this }); }
    emitState(state: number) { this.state = state; this.events.onStateChange?.({ target: this, data: state }); }
    fail(code: number) { this.events.onError?.({ target: this, data: code }); }
    block() { this.events.onAutoplayBlocked?.({ target: this }); }
    getCurrentTime() { this.reads++; return this.time; }
    getDuration() { return this.duration; }
    getPlayerState() { return this.state; }
    playVideo() { this.emitState(1); }
    pauseVideo() { this.emitState(2); }
    seekTo(seconds: number) { this.time = seconds; if (this.state !== 2) this.emitState(1); }
    destroy() { this.destroyed = true; this.iframe.remove(); }
  }
  Object.assign(window, { youtubeFake: { players, get active() { return players[players.length - 1]; } }, YT: { Player } });
  (window as Window & { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady?.();
}

export async function installYouTubeFake(page: Page, options: FakeOptions = {}) {
  let requests = 0;
  await page.route('https://www.youtube.com/iframe_api', async route => {
    requests++;
    if (requests <= (options.failLoads ?? 0)) return route.abort();
    await route.fulfill({ contentType: 'text/javascript', body: `(${fakeScript.toString()})(${JSON.stringify(options)});` });
  });
  await page.route('https://www.youtube.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Fake YouTube video</p>' }));
  return { scriptRequests: () => requests };
}
