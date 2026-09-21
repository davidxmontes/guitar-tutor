import { useEffect, useRef, useState } from 'react';
import type { ExerciseStep } from '../types/v2';
import { playChord, playMetronomeClick } from '../utils/audio';
import { practicePosition } from './practiceTiming';

const NO_GUIDE: readonly ExerciseStep[] = [];

export function usePractice(durations: readonly number[], initialTempo = 80, guide: readonly ExerciseStep[] = NO_GUIDE) {
  const [active, setActive] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tempo, setTempo] = useState(initialTempo);
  const [loop, setLoop] = useState(true);
  const [countIn, setCountIn] = useState(4);
  const [metronome, setMetronome] = useState(true);
  const [guideEnabled, setGuideEnabled] = useState(false);
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
    // if shorter notes or tighter audio jitter are needed. Elapsed-time math avoids drift.
    let stopGuide: (() => void) | undefined;
    let sounded = '';
    const tick = () => {
      const beats = clock.current.beats + (performance.now() - clock.current.at) * tempo / 60000;
      const current = practicePosition(durations, beats, countIn, loop);
      // Render only when the visible chord/count changes; the audio clock still ticks at 25ms.
      setElapsed(previous => {
        const before = practicePosition(durations, previous, countIn, loop);
        return before.index === current.index && before.count === current.count && before.finished === current.finished ? previous : beats;
      });
      if (current.finished) { stopGuide?.(); clock.current.beats = beats; setRunning(false); return; }
      if (guideEnabled && current.index >= 0 && guide[current.index]) {
        const total = durations.reduce((sum, duration) => sum + duration, 0);
        const within = (beats - countIn) % total;
        const start = durations.slice(0, current.index).reduce((sum, duration) => sum + duration, 0);
        const key = `${Math.floor((beats - countIn) / total)}:${current.index}`;
        if (key !== sounded) {
          sounded = key;
          stopGuide?.();
          const step = guide[current.index];
          if (step.positions.length) {
            try { stopGuide = playChord(step.positions, 0, (start + step.beats - within) * 60 / tempo, step.tuning); }
            catch { setAudioError(true); }
          }
        }
      }
      const pulse = Math.floor(beats);
      if (pulse !== clock.current.pulse) {
        clock.current.pulse = pulse;
        if (metronome) click();
      }
    };
    tick();
    const timer = window.setInterval(tick, 25);
    const hide = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', hide);
    return () => { stopGuide?.(); clearInterval(timer); document.removeEventListener('visibilitychange', hide); };
    // All live transport inputs are dependencies; clock anchors survive Focus changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, tempo, loop, countIn, metronome, durations, guide, guideEnabled]);

  return {
    active, focused, tempo, loop, countIn, metronome, running, position, audioError,
    enter: () => { reset(); setActive(true); },
    exit: () => { reset(); setActive(false); setFocused(false); },
    setFocused, setLoop, setMetronome,
    guideAvailable: guide.length > 0,
    audioMode: guideEnabled ? metronome ? 'both' : 'guide' : 'metronome',
    setAudioMode: (mode: string) => { setGuideEnabled(mode !== 'metronome'); setMetronome(mode !== 'guide'); },
    setCountIn: (value: number) => { reset(); setCountIn(value); },
    setTempo: (value: number) => {
      if (!Number.isInteger(value) || value < 1 || value > 240) return;
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
