# Design: Persist Selected Voicing Positions in Progression Slots

**Date:** 2026-05-23  
**Status:** Approved

## Problem

When a user selects a voicing in progression mode, only the voicing label (e.g. `"pos2"`) is stored per slot. Resolving that label to actual fret/string positions requires `progressionChordData` to be loaded — a shared, single-slot piece of state. This means:

- Auto-play on slot click must wait for or re-use whatever `progressionChordData` is currently in memory.
- The fretboard cannot show the selected voicing immediately when navigating back to a slot.
- The label and positions can silently diverge if `progressionChordData` changes between navigation.

## Goal

Store the actual position data (string/fret pairs) directly in each slot at the moment a voicing is selected. Slots become self-contained for audio playback and immediate fretboard display.

## Out of Scope

- Changes to agent-pinned slots (`positions` field) — untouched.
- Backend changes — pure frontend state change.
- Multi-slot playback / sequencer behavior.

## Design

### Type change — `ProgressionSlot`

**File:** `frontend/src/types/index.ts`

```ts
export interface ProgressionSlot {
  root: string;
  quality: string;
  positions?: { string: number; fret: number }[];   // agent-pinned — unchanged
  selectedVoicing?: {
    label: string;
    positions: { string: number; fret: number }[];
  };
}
```

`selectedVoicing` becomes a snapshot object — label and positions are always co-located. Storing one without the other is not possible by construction.

### Store — `setSlotVoicing`

**File:** `frontend/src/stores/useAppStore.ts`

External signature stays the same: `setSlotVoicing(index: number, voicingLabel: string) => void`.

Internal implementation looks up positions from `progressionChordData` via `get()` and stores the snapshot:

```ts
setSlotVoicing: (index, voicingLabel) => {
  const { progressionChordData } = get();
  const voicing = progressionChordData?.voicings.find(v => v.label === voicingLabel);
  set((state) => {
    const slots = [...state.progressionSlots];
    if (slots[index]) {
      slots[index] = {
        ...slots[index],
        selectedVoicing: voicingLabel && voicing
          ? { label: voicingLabel, positions: voicing.positions }
          : undefined,
      };
    }
    return { progressionSlots: slots };
  });
},
```

`updateSlotQuality` already clears `selectedVoicing: undefined` — no change needed.

### SlotDetail — single-select enforcement

**File:** `frontend/src/components/ProgressionMode/SlotDetail.tsx`

Read the active voicing label for `ChordDiagramRow`:

```ts
const activeVoicings = activeSlot.selectedVoicing
  ? [activeSlot.selectedVoicing.label]
  : [];
```

`handleToggleVoicing` compares label:

```ts
const handleToggleVoicing = (label: string) => {
  const isDeselecting = activeSlot.selectedVoicing?.label === label;
  setSlotVoicing(activeSlotIndex, isDeselecting ? '' : label);
};
```

**Multi-select invariant:** `slot.selectedVoicing` stores at most one voicing. The `ChordDiagramRow`'s "Show All" button fires `onToggleVoicing` for each voicing label — in progression mode these calls overlap and the last one wins. This is acceptable; the invariant holds because `setSlotVoicing` always writes a single snapshot.

### App.tsx — fretboard

**File:** `frontend/src/App.tsx`

1. Update `progressionActiveVoicings` to read `label` from snapshot:
   ```ts
   activeProgressionSlot?.selectedVoicing
     ? [activeProgressionSlot.selectedVoicing.label]
     : []
   ```

2. Immediate fretboard highlight while `progressionChordData` is loading. Extends the existing pinned-slot highlight pattern:
   ```ts
   const progressionSelectedVoicingHighlightGroup =
     appMode === 'progression' && !isActiveSlotPinned
       && activeProgressionSlot?.selectedVoicing
       && progressionChordLoading
       ? {
           name: `${activeProgressionSlot.root} ${activeProgressionSlot.quality}`,
           positions: activeProgressionSlot.selectedVoicing.positions,
         }
       : null;
   
   const effectiveHighlightGroup =
     progressionPinnedHighlightGroup
     ?? progressionSelectedVoicingHighlightGroup
     ?? agentHighlightGroup;
   ```
   Once `progressionChordData` loads, the normal voicing-highlight path takes over automatically.

### ProgressionTimeline — auto-play

**File:** `frontend/src/components/ProgressionMode/ProgressionTimeline.tsx`

Use persisted positions directly for auto-play; no longer needs `progressionChordData`:

```ts
if (slot.selectedVoicing) {
  playChord(slot.selectedVoicing.positions.map(p => ({ string: p.string, fret: p.fret })));
} else if (voicings?.length) {
  playChord(voicings[0].positions.map(p => ({ string: p.string, fret: p.fret })));
}
```

## Files Changed

| File | Change |
|---|---|
| `frontend/src/types/index.ts` | `selectedVoicing` becomes `{ label, positions }` |
| `frontend/src/stores/useAppStore.ts` | `setSlotVoicing` stores snapshot internally |
| `frontend/src/components/ProgressionMode/SlotDetail.tsx` | Read `.label`, enforce single-select |
| `frontend/src/App.tsx` | Read `.label` for voicings; add immediate highlight |
| `frontend/src/components/ProgressionMode/ProgressionTimeline.tsx` | Use persisted positions for auto-play |

## Invariants

- `slot.selectedVoicing` is always `undefined` or a complete `{ label, positions }` — never a label without positions.
- Quality change clears `selectedVoicing` (existing `updateSlotQuality` behavior, unchanged).
- Agent-pinned slots use `slot.positions` — entirely separate path, unaffected.
