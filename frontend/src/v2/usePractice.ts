import { useEffect, useRef, useState } from 'react';
import { playMetronomeClick } from '../utils/audio';
import { practicePosition } from './practiceTiming';

export function usePractice(durations: readonly number[]) {
  const [active, setActive] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tempo, setTempo] = useState(80);
  const [loop, setLoop] = useState(true);
  const [countIn, setCountIn] = useState(4);
  const [metronome, setMetronome] = useState(true);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const clock = useRef({ beats: 0, at: 0, pulse: -1 });
  const position = practicePosition(durations, elapsed, countIn, loop);
  const nowBeats = () => clock.current.beats + (running ? (performance.now() - clock.current.at) * tempo / 60000 : 0);
  const click = () => {
    try { playMetronomeClick(); }
    catch { setAudioError(true); }
  };
  const pause = () => {
    clock.current.beats = nowBeats();
    setElapsed(clock.current.beats);
    setRunning(false);
  };
  const reset = () => {
    setRunning(false); setElapsed(0);
    clock.current = { beats: 0, at: performance.now(), pulse: -1 };
  };

  useEffect(() => {
    if (!running) return;
    // ponytail: foreground 25ms refresh; use Web Audio lookahead scheduling
    // if tighter metronome jitter is needed. Elapsed-time math avoids drift.
    const timer = window.setInterval(() => {
      const beats = clock.current.beats + (performance.now() - clock.current.at) * tempo / 60000;
      const current = practicePosition(durations, beats, countIn, loop);
      setElapsed(beats);
      if (current.finished) { clock.current.beats = beats; setRunning(false); return; }
      const pulse = Math.floor(beats);
      if (pulse !== clock.current.pulse) {
        clock.current.pulse = pulse;
        if (metronome) click();
      }
    }, 25);
    const hide = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', hide);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hide); };
    // All live transport inputs are dependencies; clock anchors survive Focus changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, tempo, loop, countIn, metronome, durations]);

  return {
    active, focused, tempo, loop, countIn, metronome, running, position, audioError,
    enter: () => { reset(); setActive(true); },
    exit: () => { reset(); setActive(false); setFocused(false); },
    setFocused, setLoop, setMetronome,
    setCountIn: (value: number) => { reset(); setCountIn(value); },
    setTempo: (value: number) => {
      if (!Number.isFinite(value) || value < 30 || value > 240) return;
      clock.current = { ...clock.current, beats: nowBeats(), at: performance.now() };
      setTempo(value);
    },
    pause, reset,
    start: () => {
      if (!durations.length) return;
      if (position.finished) { clock.current.beats = 0; setElapsed(0); }
      clock.current.at = performance.now();
      if (clock.current.beats === 0 && metronome) { click(); clock.current.pulse = 0; }
      setRunning(true);
    },
  };
}

export type PracticeState = ReturnType<typeof usePractice>;
