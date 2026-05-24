# Chord Progression Builder — Design Spec

**Date:** 2026-05-09  
**Status:** Approved

---

## Overview

A new **Progression** app mode (4th tab alongside Scale / Chord / Song) that lets users build and navigate chord sequences. Both the user and the AI tutor agent are equal-weight contributors: the user builds progressions from a key-aware diatonic palette, and the agent can prescribe full progressions with specific voicings via a new `progression.set` action.

---

## Goals

- Let users sequence chords and step through them on the fretboard
- Let the agent suggest progressions with specific voicings chosen for voice leading
- Preserve the existing `fretboard.highlight` system for non-progression educational use
- Reuse existing chord and scale API infrastructure — no new backend routes

---

## Slot Model

Every chord in a progression lives in a **slot**. A slot is one of two types:

**Open slot** (user-added): `{ root, quality }`  
The chord is fetched from the DB. Chord diagrams appear and the user picks a voicing. Their choice is remembered per slot.

**Pinned slot** (agent-added): `{ root, quality, positions: [{string, fret}...] }`  
The agent specified exact fret positions for voice leading. The fretboard shows those positions directly. No diagram picker — a small `pinned ✦` badge distinguishes this visually from open slots.

Slots can be mixed in the same progression (some pinned, some open).

---

## UI Layout

### Mode tab
"Progression" added as a 4th tab in the existing tab row.

### Control bar
- **Key selector**: root note picker + mode dropdown (all modes the scale endpoint supports: major, minor, dorian, etc.)
- **Diatonic palette**: once a key is selected, the 7 diatonic chords appear as clickable chips labeled with Roman numeral + chord name (e.g., `i Am`, `VI F`). Clicking a chip appends that chord as an open slot.
- **"+ other" button**: opens an inline root + quality picker for adding non-diatonic chords.

The key selector triggers `GET /scales/{root}/{mode}` (existing endpoint) to fetch diatonic chords. No new backend route.

### Progression timeline
A horizontal row of slot cards:
- Active slot: highlighted border, chord name prominent
- Pinned slots: `pinned ✦` badge, subdued background
- Open slots: `open` badge
- Each slot has an `×` to remove it
- A `+` card at the end to add a new slot
- ◀ / ▶ arrows for keyboard-free navigation; slot counter (e.g., `2/4`)

### Left panel (slot detail)
- **Pinned slot active**: shows the agent-chosen fret positions as a grid (string + fret pairs) with a note explaining the agent chose this for voice leading
- **Open slot active**: shows chord voicing diagrams (same component as Chord mode). User clicks a diagram to select it; selection is remembered in the slot.

### Fretboard
- **Pinned slot active**: highlights the agent-specified positions (same rendering path as `fretboard.highlight` today)
- **Open slot active**: shows the selected voicing overlay (same rendering path as Chord mode today)

---

## Zustand Slice

New `ProgressionSlice` added to `useAppStore`:

```typescript
interface ProgressionSlot {
  root: string;
  quality: string;
  positions?: { string: number; fret: number }[];  // set by agent
  selectedVoicing?: string;                          // set by user
}

interface ProgressionSlice {
  progressionKeyRoot: string | null;
  progressionKeyMode: string | null;
  diatonicChords: DiatonicChord[];          // palette source, not slots
  progressionSlots: ProgressionSlot[];
  activeSlotIndex: number;
  progressionChordData: ChordResponse | null;
  progressionChordLoading: boolean;

  setProgressionKey: (root: string, mode: string) => Promise<void>;
  addSlot: (slot: Pick<ProgressionSlot, 'root' | 'quality' | 'positions'>) => Promise<void>;
  removeSlot: (index: number) => void;
  updateSlotQuality: (index: number, quality: string) => Promise<void>;
  setActiveSlot: (index: number) => Promise<void>;
  setSlotVoicing: (index: number, voicingLabel: string) => void;
  setProgressionFromAgent: (slots: ProgressionSlot[], keyRoot?: string, keyMode?: string) => Promise<void>;
  clearProgression: () => void;
}
```

`setProgressionKey` fetches the scale (for diatonic chords) and stores them in a local `diatonicChords` field (not in the slot list — just the palette source).

`setActiveSlot` fetches chord data for the newly active slot (if open) or clears `progressionChordData` (if pinned, positions are used directly).

`setProgressionFromAgent` switches to progression mode, clears `agentHighlightGroups`, and loads the agent's slots.

---

## New Components

| Component | Location | Purpose |
|---|---|---|
| `ProgressionMode` | `components/ProgressionMode/ProgressionMode.tsx` | Mode root, wires store to children |
| `ProgressionTimeline` | `components/ProgressionMode/ProgressionTimeline.tsx` | Slot row + navigation |
| `ProgressionSlotCard` | `components/ProgressionMode/ProgressionSlotCard.tsx` | Single slot card |
| `KeyPalette` | `components/ProgressionMode/KeyPalette.tsx` | Key selector + diatonic chips |
| `SlotDetail` | `components/ProgressionMode/SlotDetail.tsx` | Left panel (pinned positions or chord diagrams) |

The `ProgressionMode` component sits in `App.tsx`'s main content area alongside the existing `appMode === 'scale'` / `appMode === 'chord'` / `appMode === 'song'` branches.

---

## Agent Integration

### New action: `progression.set`

Added to the `AgentAction` discriminated union in `backend/app/models/agent.py`:

```python
class ProgressionSlotSchema(BaseModel):
    root: str
    quality: str
    positions: Optional[List[FretboardHighlightPosition]] = None

class ProgressionSetAction(BaseModel):
    type: Literal["progression.set"]
    chords: List[ProgressionSlotSchema]
    key_root: Optional[str] = None
    key_mode: Optional[str] = None
```

### Postprocessing

`AnswerPostProcessSchema` in `agent/schemas.py` gains:

```python
progression_chords: List[dict] = Field(
    default_factory=list,
    description=(
        "When the answer presents a chord progression, list each chord with root, quality, "
        "and optionally specific fret positions for voice leading. Empty list if no progression."
    )
)
```

`_postprocess_answer` in `agent/nodes.py` builds a `progression.set` action from `progression_chords` when the list is non-empty. The agent no longer uses `fretboard.highlight` groups to represent progressions — that path is reserved for scale fragments, note identification, and fingering annotations.

### UiContext

`UiContext` in `backend/app/models/agent.py` gains:

```python
selected_progression: Optional[dict] = None
# shape: { key_root, key_mode, slots: [{root, quality}...], active_slot_index }
```

`buildUiContext()` in the frontend store includes the current progression state so the agent knows what's already loaded.

### Frontend action dispatch

`executeAgentActions` in `App.tsx` handles `progression.set`:
1. Calls `setProgressionFromAgent(chords, key_root, key_mode)`
2. That function switches `appMode` to `'progression'`, clears `agentHighlightGroups`, and loads slots

---

## Conflict Resolution: Highlights vs. Progressions

| Situation | Behaviour |
|---|---|
| Agent emits `progression.set` | Clears `agentHighlightGroups`; switches to progression mode |
| Agent emits `fretboard.highlight` while in progression mode | Highlights activate as today (suppress chord voicings). User toggles off to return to progression view. |
| User navigates progression slots | Arrow keys on slot cards step through progression. Chat-scoped arrow keys still control highlight group cycling (separate scopes, no collision). |
| `resetChat` | Clears both `agentHighlightGroups` and `progressionSlots` |

`fretboard.highlight` is reserved for: scale/mode fragments, fingering annotations, note identification, lick illustrations. It is not used for chord progressions going forward.

---

## What Is Not In Scope

- Audio playback / metronome
- Saving/naming progressions across sessions
- Drag-to-reorder slots
- Borrowed chords UI (agent can add non-diatonic chords via `progression.set`; user uses "+ other" picker)
