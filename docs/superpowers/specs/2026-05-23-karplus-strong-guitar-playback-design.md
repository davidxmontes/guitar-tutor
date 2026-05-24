# Karplus-Strong Guitar Playback with Voice Selection

**Date:** 2026-05-23  
**Status:** Approved

## Overview

Replace the current Web Audio API oscillator synth (triangle + sine harmonics) with Karplus-Strong physical string synthesis. Add an Acoustic / Electric voice selector in the ControlBar, persisted to localStorage.

## Problem

`createGuitarTone` in `audio.ts` stacks three oscillators to approximate a guitar. The result sounds like a keyboard. Karplus-Strong uses a noise-excited resonant delay loop that naturally produces a plucked string timbre.

## Architecture

Three files change. No new files. No callers of `playChord`/`playNote`/`playArpeggio`/`playScale` change.

### 1. `frontend/src/utils/audio.ts`

**Replace** `createGuitarTone` with a Karplus-Strong ring buffer implementation:

1. Allocate a delay line of length `N = Math.round(sampleRate / frequency)` filled with white noise.
2. Generate `totalSamples = Math.round(sampleRate * duration)` output samples via:
   ```
   out[i] = delayLine[i % N]
   delayLine[i % N] = filterCoeff * (delayLine[i % N] + delayLine[(i+1) % N]) * decay
   ```
3. Wrap samples in an `AudioBuffer` and play via `AudioBufferSourceNode`.

This bypasses the `DelayNode` minimum-delay floor (~5.8 ms at 44100 Hz = ~172 Hz), which would break low strings (E2 = 82 Hz, A2 = 110 Hz, D3 = 147 Hz).

**Voice parameters:**

| Parameter | Acoustic | Electric |
|---|---|---|
| Filter coefficient | `0.5` (equal averaging) | `0.4` (biased toward highs) |
| Decay factor | `0.996` (shorter sustain) | `0.999` (longer sustain) |
| Noise amplitude | `1.0` | `1.2` (brighter attack) |

**New exports:**
```typescript
export type GuitarType = 'acoustic' | 'electric'
export function setGuitarType(type: GuitarType): void
```

Module-level `guitarType` variable defaults to `localStorage.getItem('guitarType') ?? 'acoustic'` on load. All existing public functions (`playNote`, `playChord`, `playArpeggio`, `playScale`) read this variable internally — no signature changes.

### 2. `frontend/src/stores/useAppStore.ts`

Add `guitarType` to `ThemeSlice` (same pattern as `darkMode`):

```typescript
interface ThemeSlice {
  darkMode: boolean
  toggleDarkMode: () => void
  guitarType: GuitarType        // new
  setGuitarType: (t: GuitarType) => void  // new
}
```

Initialization (IIFE, same pattern as `darkMode`):
```typescript
guitarType: (localStorage.getItem('guitarType') as GuitarType) ?? 'acoustic'
```

`setGuitarType` action:
1. Calls `set({ guitarType: type })`
2. Writes `localStorage.setItem('guitarType', type)`
3. Calls `audioSetGuitarType(type)` (imported from `audio.ts`) to sync the audio module

### 3. `frontend/src/components/layout/ControlBar.tsx`

Add a `<select>` dropdown that reads `guitarType` from the store and calls `setGuitarType` on change. Styled to match existing ControlBar controls. Two options: `Acoustic` and `Electric`.

## Data Flow

```
User selects "Electric" in ControlBar
  → store.setGuitarType('electric')
    → localStorage.setItem('guitarType', 'electric')
    → audioSetGuitarType('electric')  [updates module-level var]
  → next playChord() call reads guitarType = 'electric'
  → Karplus-Strong runs with electric parameters
```

On page reload:
- `audio.ts` reads `localStorage.getItem('guitarType')` at module init
- Store reads same key in IIFE initializer
- Both default to `'acoustic'` if key absent

## Out of Scope

- Reverb / effects processing
- Nylon / classical voice
- Per-string volume envelopes beyond the natural KS decay
- Changes to `ChordPopup`, `ChordDiagramRow`, or `NoteCell`
