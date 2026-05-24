# Persist Selected Voicing Positions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the actual fret/string positions when a user selects a voicing in progression mode, so each slot is self-contained for audio playback and immediate fretboard display.

**Architecture:** Change `selectedVoicing` in `ProgressionSlot` from a bare label string to a `{ label, positions }` snapshot. `setSlotVoicing` in the store looks up positions from `progressionChordData` at save time. Five files touch — type definition, store, SlotDetail, App, ProgressionTimeline. All changes are in the frontend only.

**Tech Stack:** React 19, TypeScript 5.9, Zustand (via `useAppStore`)

---

## File Map

| File | Change |
|---|---|
| `frontend/src/types/index.ts` | `selectedVoicing` field type: `string` → `{ label, positions }` |
| `frontend/src/stores/useAppStore.ts` | `setSlotVoicing` stores snapshot instead of bare label |
| `frontend/src/components/ProgressionMode/SlotDetail.tsx` | Read `.label`, compare `.label` in toggle |
| `frontend/src/App.tsx` | Add `progressionChordLoading` destructure; read `.label`; add immediate highlight group |
| `frontend/src/components/ProgressionMode/ProgressionTimeline.tsx` | Auto-play reads persisted positions directly |

---

### Task 1: Update `ProgressionSlot` type

**Files:**
- Modify: `frontend/src/types/index.ts:109-114`

- [ ] **Step 1: Change `selectedVoicing` to a snapshot object**

Open `frontend/src/types/index.ts`. Replace lines 109–114:

```ts
// BEFORE
export interface ProgressionSlot {
  root: string;
  quality: string;
  positions?: { string: number; fret: number }[];
  selectedVoicing?: string;
}

// AFTER
export interface ProgressionSlot {
  root: string;
  quality: string;
  positions?: { string: number; fret: number }[];
  selectedVoicing?: { label: string; positions: { string: number; fret: number }[] };
}
```

- [ ] **Step 2: Run TypeScript to see where errors propagate**

```bash
cd /Users/davidmontesdeoca/Development/guitar-tutor/frontend && npx tsc --noEmit 2>&1 | grep "error TS"
```

Expected: errors in `App.tsx` (line ~211), `SlotDetail.tsx` (lines ~74, ~77), and `ProgressionTimeline.tsx` (lines ~26–27). These are all the consumers and will be fixed in Tasks 2–5.

Do **not** commit yet — TypeScript is currently broken.

---

### Task 2: Update `setSlotVoicing` in the store

**Files:**
- Modify: `frontend/src/stores/useAppStore.ts:1174-1182`

- [ ] **Step 1: Replace the `setSlotVoicing` implementation**

Open `frontend/src/stores/useAppStore.ts`. Replace the `setSlotVoicing` block (lines 1174–1182):

```ts
// BEFORE
setSlotVoicing: (index, voicingLabel) => {
  set((state) => {
    const slots = [...state.progressionSlots];
    if (slots[index]) {
      slots[index] = { ...slots[index], selectedVoicing: voicingLabel };
    }
    return { progressionSlots: slots };
  });
},

// AFTER
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

Note: `get()` is already in scope — this is a Zustand `StateCreator` implementation.

- [ ] **Step 2: Verify TypeScript — store error should be gone**

```bash
cd /Users/davidmontesdeoca/Development/guitar-tutor/frontend && npx tsc --noEmit 2>&1 | grep "useAppStore"
```

Expected: no errors mentioning `useAppStore.ts`.

---

### Task 3: Update `SlotDetail.tsx`

**Files:**
- Modify: `frontend/src/components/ProgressionMode/SlotDetail.tsx:74-78`

- [ ] **Step 1: Update `activeVoicings` and `handleToggleVoicing`**

Open `frontend/src/components/ProgressionMode/SlotDetail.tsx`. Replace lines 74–78:

```ts
// BEFORE
const activeVoicings = activeSlot.selectedVoicing ? [activeSlot.selectedVoicing] : [];

const handleToggleVoicing = (label: string) => {
  setSlotVoicing(activeSlotIndex, activeSlot.selectedVoicing === label ? '' : label);
};

// AFTER
const activeVoicings = activeSlot.selectedVoicing
  ? [activeSlot.selectedVoicing.label]
  : [];

const handleToggleVoicing = (label: string) => {
  const isDeselecting = activeSlot.selectedVoicing?.label === label;
  setSlotVoicing(activeSlotIndex, isDeselecting ? '' : label);
};
```

- [ ] **Step 2: Verify TypeScript — SlotDetail errors should be gone**

```bash
cd /Users/davidmontesdeoca/Development/guitar-tutor/frontend && npx tsc --noEmit 2>&1 | grep "SlotDetail"
```

Expected: no errors mentioning `SlotDetail.tsx`.

---

### Task 4: Update `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx` (three spots: line ~75 destructure, line ~210 voicings, line ~348 highlight group)

- [ ] **Step 1: Add `progressionChordLoading` to the store destructure**

Open `frontend/src/App.tsx`. The `useAppStore()` destructure block ends around line 77. Add `progressionChordLoading` to the list:

```ts
// BEFORE (lines ~73-77)
    progressionSlots,
    activeSlotIndex,
    progressionChordData,
    setProgressionFromAgent,
  } = useAppStore();

// AFTER
    progressionSlots,
    activeSlotIndex,
    progressionChordData,
    progressionChordLoading,
    setProgressionFromAgent,
  } = useAppStore();
```

- [ ] **Step 2: Update `progressionActiveVoicings` to read `.label`**

Still in `App.tsx`, update lines ~209–212:

```ts
// BEFORE
  const progressionActiveVoicings =
    appMode === 'progression' && activeProgressionSlot?.selectedVoicing
      ? [activeProgressionSlot.selectedVoicing]
      : [];

// AFTER
  const progressionActiveVoicings =
    appMode === 'progression' && activeProgressionSlot?.selectedVoicing
      ? [activeProgressionSlot.selectedVoicing.label]
      : [];
```

- [ ] **Step 3: Add the immediate-highlight group and extend `effectiveHighlightGroup`**

Still in `App.tsx`, update lines ~342–348 (the pinned slot highlight block):

```ts
// BEFORE
  // In progression mode with a pinned slot, override the highlight group with the slot's positions
  const progressionPinnedHighlightGroup =
    appMode === 'progression' && isActiveSlotPinned && activeProgressionSlot!.positions
      ? { name: `${activeProgressionSlot!.root} ${activeProgressionSlot!.quality}`, positions: activeProgressionSlot!.positions }
      : null;

  const effectiveHighlightGroup = progressionPinnedHighlightGroup ?? agentHighlightGroup;

// AFTER
  // In progression mode with a pinned slot, override the highlight group with the slot's positions
  const progressionPinnedHighlightGroup =
    appMode === 'progression' && isActiveSlotPinned && activeProgressionSlot!.positions
      ? { name: `${activeProgressionSlot!.root} ${activeProgressionSlot!.quality}`, positions: activeProgressionSlot!.positions }
      : null;

  // While progressionChordData is loading, show persisted selected voicing positions immediately
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

- [ ] **Step 4: Verify TypeScript — App.tsx errors should be gone**

```bash
cd /Users/davidmontesdeoca/Development/guitar-tutor/frontend && npx tsc --noEmit 2>&1 | grep "App.tsx"
```

Expected: no errors mentioning `App.tsx`.

---

### Task 5: Update `ProgressionTimeline.tsx` and commit

**Files:**
- Modify: `frontend/src/components/ProgressionMode/ProgressionTimeline.tsx:16-32`

- [ ] **Step 1: Update `handleSetActive` to use persisted positions for auto-play**

Open `frontend/src/components/ProgressionMode/ProgressionTimeline.tsx`. Replace the `handleSetActive` function (lines 16–32):

```ts
// BEFORE
  const handleSetActive = async (index: number) => {
    const slot = progressionSlots[index];
    await setActiveSlot(index);
    if (!autoPlay) return;
    if (slot.positions) {
      playChord(slot.positions.map(p => ({ string: p.string, fret: p.fret })));
    } else {
      const { progressionChordData } = useAppStore.getState();
      const voicings = progressionChordData?.voicings;
      if (voicings?.length) {
        const voicing = slot.selectedVoicing
          ? voicings.find(v => v.label === slot.selectedVoicing) ?? voicings[0]
          : voicings[0];
        playChord(voicing.positions.map(p => ({ string: p.string, fret: p.fret })));
      }
    }
  };

// AFTER
  const handleSetActive = async (index: number) => {
    const slot = progressionSlots[index];
    await setActiveSlot(index);
    if (!autoPlay) return;
    if (slot.positions) {
      playChord(slot.positions.map(p => ({ string: p.string, fret: p.fret })));
    } else if (slot.selectedVoicing) {
      playChord(slot.selectedVoicing.positions.map(p => ({ string: p.string, fret: p.fret })));
    } else {
      const { progressionChordData } = useAppStore.getState();
      const voicings = progressionChordData?.voicings;
      if (voicings?.length) {
        playChord(voicings[0].positions.map(p => ({ string: p.string, fret: p.fret })));
      }
    }
  };
```

- [ ] **Step 2: Verify TypeScript is fully clean**

```bash
cd /Users/davidmontesdeoca/Development/guitar-tutor/frontend && npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit all five files**

```bash
git add frontend/src/types/index.ts \
        frontend/src/stores/useAppStore.ts \
        frontend/src/components/ProgressionMode/SlotDetail.tsx \
        frontend/src/App.tsx \
        frontend/src/components/ProgressionMode/ProgressionTimeline.tsx
git commit -m "feat(progression): persist selected voicing positions in slot state"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/davidmontesdeoca/Development/guitar-tutor && docker compose up
```

Or if running frontend standalone:

```bash
cd /Users/davidmontesdeoca/Development/guitar-tutor/frontend && npm run dev
```

- [ ] **Step 2: Verify voicing selection persists across slot navigation**

1. Go to Progression mode, set a key, add 2+ slots.
2. On slot 1, open SlotDetail — select a voicing other than pos1 (e.g. pos2). The fretboard should highlight pos2.
3. Navigate to slot 2, then back to slot 1.
4. Confirm: slot 1 still shows pos2 highlighted in `ChordDiagramRow` and on the fretboard.

- [ ] **Step 3: Verify auto-play uses the persisted voicing**

1. Enable auto-play (toggle in settings).
2. With slot 1 having pos2 selected, click slot 1 in the timeline.
3. Confirm: the chord that plays sounds like pos2 (different from pos1).
4. Add a slot with no voicing selected — confirm auto-play falls back to pos1.

- [ ] **Step 4: Verify fretboard shows immediately on slot click (before chord data loads)**

1. Select a voicing on slot 1.
2. Navigate to slot 2, then rapidly click back to slot 1.
3. Confirm: the fretboard shows the previously selected voicing positions during the loading flash (before `progressionChordData` re-loads).

- [ ] **Step 5: Verify quality change clears the selection**

1. Slot 1 has pos2 selected.
2. Change the chord quality on slot 1 (e.g. major → minor).
3. Confirm: `selectedVoicing` is cleared — no voicing is highlighted, fretboard shows no selection.
