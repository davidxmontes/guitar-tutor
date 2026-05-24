# Karplus-Strong Guitar Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Web Audio API oscillator synthesis with Karplus-Strong physical string modeling and add an Acoustic/Electric voice selector in the ControlBar, persisted to localStorage.

**Architecture:** The Karplus-Strong algorithm pre-computes samples into a `Float32Array` ring buffer and plays them via `AudioBufferSourceNode`, bypassing `DelayNode` frequency limits. A module-level `guitarType` variable in `audio.ts` controls which voice parameters are used. The Zustand store adds `guitarType` to `ThemeSlice` (same pattern as `darkMode`) and syncs changes to the audio module.

**Tech Stack:** TypeScript, Web Audio API (`AudioContext`, `AudioBuffer`, `AudioBufferSourceNode`), Zustand, React, Tailwind CSS

---

## File Map

| File | Change |
|---|---|
| `frontend/src/utils/audio.ts` | Replace `createGuitarTone` with `createKarplusString`; add `GuitarType` type and `setGuitarType` export |
| `frontend/src/stores/useAppStore.ts` | Add `guitarType` + `setGuitarType` to `ThemeSlice` |
| `frontend/src/components/layout/ControlBar.tsx` | Add guitar type `<select>` dropdown |

---

## Task 1: Karplus-Strong engine in `audio.ts`

**Files:**
- Modify: `frontend/src/utils/audio.ts`

This task replaces `createGuitarTone` (oscillator-based) with `createKarplusString` (ring buffer KS). The public API (`playNote`, `playChord`, `playArpeggio`, `playScale`) is unchanged — only the internal synthesis function changes. Two new exports are added: `GuitarType` and `setGuitarType`.

- [ ] **Step 1: Replace the entire file contents**

Replace `frontend/src/utils/audio.ts` with:

```typescript
// Web Audio API-based guitar sound engine — Karplus-Strong synthesis

export type GuitarType = 'acoustic' | 'electric'

const VOICE_PARAMS: Record<GuitarType, { filterCoeff: number; decay: number; noiseAmp: number }> = {
  acoustic: { filterCoeff: 0.5, decay: 0.996, noiseAmp: 1.0 },
  electric: { filterCoeff: 0.4, decay: 0.999, noiseAmp: 1.2 },
}

// Note frequencies (A4 = 440Hz)
const NOTE_FREQUENCIES: Record<string, number> = {
  'C': 261.63,
  'C#': 277.18, 'Db': 277.18,
  'D': 293.66,
  'D#': 311.13, 'Eb': 311.13,
  'E': 329.63,
  'F': 349.23,
  'F#': 369.99, 'Gb': 369.99,
  'G': 392.00,
  'G#': 415.30, 'Ab': 415.30,
  'A': 440.00,
  'A#': 466.16, 'Bb': 466.16,
  'B': 493.88,
}

// Standard tuning frequencies for each string (low to high: E2, A2, D3, G3, B3, E4)
const STRING_BASE_FREQUENCIES = [
  82.41,   // String 6 (low E) - E2
  110.00,  // String 5 (A) - A2
  146.83,  // String 4 (D) - D3
  196.00,  // String 3 (G) - G3
  246.94,  // String 2 (B) - B3
  329.63,  // String 1 (high E) - E4
]

// Module-level guitar type, initialized from localStorage
let guitarType: GuitarType = (
  typeof window !== 'undefined'
    ? (localStorage.getItem('guitarType') as GuitarType) ?? 'acoustic'
    : 'acoustic'
)

export function setGuitarType(type: GuitarType): void {
  guitarType = type
}

// Get frequency for a specific string and fret
export function getFrequency(string: number, fret: number): number {
  // String is 1-indexed (1 = high E, 6 = low E)
  const baseFreq = STRING_BASE_FREQUENCIES[6 - string]
  // Each fret is a semitone (multiply by 2^(1/12))
  return baseFreq * Math.pow(2, fret / 12)
}

// Get frequency for a note name with octave adjustment
export function getNoteFrequency(note: string, octave: number = 4): number {
  const baseFreq = NOTE_FREQUENCIES[note] || NOTE_FREQUENCIES['A']
  return baseFreq * Math.pow(2, octave - 4)
}

// Audio context singleton
let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }
  return audioContext
}

// Karplus-Strong ring buffer synthesis
// Generates samples offline into an AudioBuffer and plays via BufferSourceNode.
// This avoids DelayNode's minimum-delay floor (~172 Hz at 44100 Hz sample rate),
// which would make low strings (E2=82 Hz, A2=110 Hz) sound wrong with real-time nodes.
function createKarplusString(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number = 0.5
): void {
  const sampleRate = ctx.sampleRate
  const { filterCoeff, decay, noiseAmp } = VOICE_PARAMS[guitarType]

  // Delay line length = one period at this frequency
  const N = Math.round(sampleRate / frequency)
  const totalSamples = Math.round(sampleRate * duration)

  // Seed delay line with white noise
  const delayLine = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    delayLine[i] = (Math.random() * 2 - 1) * noiseAmp
  }

  // Generate output via one-pole lowpass feedback loop
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate)
  const channelData = buffer.getChannelData(0)

  for (let i = 0; i < totalSamples; i++) {
    const idx = i % N
    const nextIdx = (idx + 1) % N
    channelData[i] = delayLine[idx] * volume
    delayLine[idx] = filterCoeff * (delayLine[idx] + delayLine[nextIdx]) * decay
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start(startTime)
}

// Position type for playing
export interface NoteToPlay {
  string: number
  fret: number
  note?: string
}

// Play a single note
export function playNote(string: number, fret: number, duration: number = 1.0): void {
  const ctx = getAudioContext()
  const frequency = getFrequency(string, fret)
  createKarplusString(ctx, frequency, ctx.currentTime, duration)
}

// Play a chord (strum style - slight delay between strings)
export function playChord(
  positions: NoteToPlay[],
  strumSpeed: number = 0.03,
  duration: number = 2.0
): void {
  const ctx = getAudioContext()
  const currentTime = ctx.currentTime

  // Sort by string (6 to 1, low to high for downstrum)
  const sorted = [...positions].sort((a, b) => b.string - a.string)

  sorted.forEach((pos, index) => {
    const frequency = getFrequency(pos.string, pos.fret)
    const startTime = currentTime + index * strumSpeed
    const volume = 0.4 / Math.sqrt(sorted.length / 4)
    createKarplusString(ctx, frequency, startTime, duration, volume)
  })
}

// Play chord arpeggiated (one note at a time)
export function playArpeggio(
  positions: NoteToPlay[],
  noteDelay: number = 0.2,
  noteDuration: number = 0.5,
  direction: 'up' | 'down' = 'up'
): void {
  const ctx = getAudioContext()
  const currentTime = ctx.currentTime

  let sorted = [...positions].sort((a, b) => b.string - a.string)
  if (direction === 'up') {
    sorted = sorted.reverse()
  }

  sorted.forEach((pos, index) => {
    const frequency = getFrequency(pos.string, pos.fret)
    const startTime = currentTime + index * noteDelay
    createKarplusString(ctx, frequency, startTime, noteDuration, 0.5)
  })
}

// Play a scale (ascending or descending)
export function playScale(
  positions: NoteToPlay[],
  noteDelay: number = 0.25,
  noteDuration: number = 0.4,
  direction: 'ascending' | 'descending' | 'both' = 'ascending'
): void {
  const ctx = getAudioContext()
  const currentTime = ctx.currentTime

  const sorted = [...positions].sort((a, b) => {
    const freqA = getFrequency(a.string, a.fret)
    const freqB = getFrequency(b.string, b.fret)
    return freqA - freqB
  })

  // Remove duplicates (same pitch from different positions)
  const unique: NoteToPlay[] = []
  let lastFreq = 0
  sorted.forEach(pos => {
    const freq = getFrequency(pos.string, pos.fret)
    if (Math.abs(freq - lastFreq) > 1) {
      unique.push(pos)
      lastFreq = freq
    }
  })

  let notesToPlay: NoteToPlay[] = []
  if (direction === 'ascending') {
    notesToPlay = unique
  } else if (direction === 'descending') {
    notesToPlay = [...unique].reverse()
  } else {
    notesToPlay = [...unique, ...unique.slice(0, -1).reverse()]
  }

  notesToPlay.forEach((pos, index) => {
    const frequency = getFrequency(pos.string, pos.fret)
    const startTime = currentTime + index * noteDelay
    createKarplusString(ctx, frequency, startTime, noteDuration, 0.5)
  })
}

// Get total duration of scale playback
export function getScaleDuration(
  positionCount: number,
  noteDelay: number = 0.25,
  noteDuration: number = 0.4,
  direction: 'ascending' | 'descending' | 'both' = 'ascending'
): number {
  const count = direction === 'both' ? positionCount * 2 - 1 : positionCount
  return count * noteDelay + noteDuration
}

// Get total duration of chord playback
export function getChordDuration(
  positionCount: number,
  strumSpeed: number = 0.03,
  duration: number = 2.0
): number {
  return positionCount * strumSpeed + duration
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors from `audio.ts`. Fix any type errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/audio.ts
git commit -m "feat(audio): replace oscillator synth with Karplus-Strong ring buffer"
```

---

## Task 2: Add `guitarType` to the Zustand store

**Files:**
- Modify: `frontend/src/stores/useAppStore.ts`

Adds `guitarType: GuitarType` and `setGuitarType` to `ThemeSlice`. Pattern mirrors `darkMode` exactly: initialize from localStorage in an IIFE, persist on every change, and sync to the audio module.

- [ ] **Step 1: Import `GuitarType` and `setGuitarType` from audio**

At the top of `useAppStore.ts`, add this import alongside the existing imports:

```typescript
import { setGuitarType as audioSetGuitarType, type GuitarType } from '../utils/audio'
```

- [ ] **Step 2: Extend `ThemeSlice` interface**

Find the `ThemeSlice` interface (around line 122) and add two fields:

```typescript
interface ThemeSlice {
  darkMode: boolean
  toggleDarkMode: () => void
  guitarType: GuitarType
  setGuitarType: (type: GuitarType) => void
}
```

- [ ] **Step 3: Add initializer and action in the store body**

Find the Theme Slice section in the `create(...)` call (around line 323). After `toggleDarkMode`, add:

```typescript
  guitarType: (() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('guitarType') as GuitarType) ?? 'acoustic'
    }
    return 'acoustic'
  })(),

  setGuitarType: (type: GuitarType) => {
    localStorage.setItem('guitarType', type)
    audioSetGuitarType(type)
    set({ guitarType: type })
  },
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. Fix any before continuing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/useAppStore.ts
git commit -m "feat(store): add guitarType preference to ThemeSlice"
```

---

## Task 3: Guitar type selector in the ControlBar

**Files:**
- Modify: `frontend/src/components/layout/ControlBar.tsx`

Adds a labelled `<select>` dropdown to the right-hand controls area of the ControlBar (alongside the Play Chord button and Clear button). The selector is always visible (not gated by `appMode`) since it's a global playback preference.

- [ ] **Step 1: Read `guitarType` and `setGuitarType` from the store**

In `ControlBar.tsx`, add `guitarType` and `setGuitarType` to the `useAppStore()` destructure (around line 24):

```typescript
  const {
    appMode,
    darkMode,
    guitarType,
    setGuitarType,
    // ... rest unchanged
  } = useAppStore();
```

- [ ] **Step 2: Add the dropdown to the right-hand controls area**

Find the `<div className="flex items-center gap-2 md:gap-3">` that contains `showPlayButton` and the Clear button (around line 155). Add the guitar selector **before** `showPlayButton`:

```tsx
              <div className="flex items-center gap-2 md:gap-3">
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[10px] md:text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Sound
                  </span>
                  <select
                    value={guitarType}
                    onChange={(e) => setGuitarType(e.target.value as 'acoustic' | 'electric')}
                    className="h-[42px] rounded-lg border px-2 py-1 text-xs md:text-sm font-medium cursor-pointer"
                    style={{
                      backgroundColor: 'var(--card-bg)',
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <option value="acoustic">Acoustic</option>
                    <option value="electric">Electric</option>
                  </select>
                </div>
                {showPlayButton && (
                  // ... existing PlayTextButton unchanged
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/ControlBar.tsx
git commit -m "feat(ui): add guitar type selector to ControlBar"
```

---

## Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev
```

Open the app in a browser at `http://localhost:5173`.

- [ ] **Step 2: Verify acoustic playback**

1. Select a chord (e.g., C major in chord mode)
2. Confirm the Sound dropdown shows "Acoustic"
3. Click "Play Chord" — should sound like a plucked acoustic guitar string, NOT a keyboard/synth tone
4. Click the play button in a chord diagram popup — same result

- [ ] **Step 3: Verify electric playback**

1. Switch Sound dropdown to "Electric"
2. Click "Play Chord" — should sound brighter with more sustain than acoustic
3. Switch back to "Acoustic" — confirm tone returns to shorter, warmer

- [ ] **Step 4: Verify localStorage persistence**

1. Set Sound to "Electric"
2. Hard-reload the page (Cmd+Shift+R)
3. Confirm the dropdown still shows "Electric" and playback still uses electric voice

- [ ] **Step 5: Verify low strings play correctly**

Select a chord that uses string 6 (E2, 82 Hz) such as an open E major or G major. Play it — the low E string should have a clear pitch, not a buzz or click. This verifies the ring buffer approach handles sub-172 Hz frequencies correctly.
