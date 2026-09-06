# Spec draft — Re-standardize the ConceptWorkspace render model

**Status:** Draft for publishing as a GitHub `Spec:` issue + 7 sub-issues.
**Grounded against:** `feature/workspace-ux-cleanup` @ `9481536` (2026-09-05), plus
`main-v2` @ `a4cf503`.
**Design reference:** `concept-inventory.md` (this directory) — keep it linked from the
issue; it is the "why", this is the "what/how".
**Settled via:** grilling session 2026-09-05 (see conversation). Every decision below is
confirmed, not proposed.

---

## Problem

The V2 ConceptWorkspace couples the *musical subject*, its *resolved shape*, and *how
it's drawn* per entity kind. `ResolvedWorkspace` is eight per-kind `Record`s with
divergent shapes (`scales[id].positions`, `chords[id].notes` with no positions,
`caged[id].regions`, …). Every block — `ConceptWorkspaceBlocks`, `CagedWorkspaceBlock`,
`PhysicalWorkspaceBlocks`, `WorkspaceProgressionBlock` — writes bespoke code to read the
right record and flatten it, and each independently reinvents "a list of positions tagged
with a role". A block binds to exactly one `source_id`, so the Tutor can't compose one
view from several entities. There are 3–4 fretboard renderers and 2 chord-diagram
renderers, none shared.

Result: adding a concept or a view means new bespoke plumbing, and the Tutor's ability to
"compose an explanation from trusted blocks" (ADR-0001) is bottlenecked by the model.

## Goal

One uniform resolved model and one composition contract so **any block can render any
compatible musical source, and the Tutor composes freely**. Rebuild the existing blocks
on it. No half-migration — the divergence is removed at the source, not papered over in
the frontend.

## Non-goals (explicitly deferred)

- **Insight notes** (Tutor-authored callouts anchored to a block/position). Add later.
- **New block kinds** beyond `key-family`: movement diagram, interval ruler, loop
  timeline, editable chord diagram. Fast-follow once the model is proven.
- **SongStudy** model changes. It shares leaf components eventually; its artifact/resolved
  model is untouched here.
- **A data converter** for saved V2 ConceptStudies — clean break (see Migration).
- **The "home root" degree-labelling** across mixed-root layers — v1 is notes-only for
  multi-layer boards.

---

## The settled design

### 1. Uniform resolved model

`resolve_workspace` is rewritten to return:

```
resolved = {
  entities:  Record<id, ResolvedEntity>,
  relations: Record<id, ResolvedRelation>,
}
```

`ResolvedEntity` is a **discriminated union on `kind`** with a shared core:

```
{ id, kind, label, notes: WorkspaceNote[], positions: WorkspacePosition[], tuning: number[] }
```

plus typed per-kind extras:

| kind | `positions` holds | extras |
|---|---|---|
| `scale` | every fret instance of its notes, frets 0–19 | — |
| `chord` | every fret instance of its notes, 0–19 | `cagedRegions` (major/minor only), `quality` |
| `voicing` | its exact fretted positions only | `chord_id` |
| `key` | every fret instance of its 7 notes | `circle: string[]`, `diatonicChords: {numeral, root, quality}[]` |
| `noteGroup` | resolved from `NoteRef[]` | — |
| `progression` | empty | `steps: {root, quality, function, positions, tuning}[]`, `derived`, `key_id` |

`ResolvedRelation` is a union: `compare → {shared, added, removed}`,
`transition → {movement, functions, key_id}` (payloads unchanged from today).

`block_sources` leaves the resolved payload (replaced by block-declared `accepts`).

### 2. Composition contract — `block.sources: string[]`

- `block.source_id: string` → `block.sources: string[]`. Each id is an **entity or a
  relation**; mixed lists allowed.
- **No `Group` relation.** `Compare` / `Transition` stay for their semantics (and
  `Transition`'s `key_id`); a block lists raw entity ids when it just wants them drawn.
- Migration: every existing block's `source_id` → `sources: [source_id]`.

### 3. The adapter (frontend util, one pure function, tested once)

`(block, resolved) → { sources: ResolvedEntity[], relations: ResolvedRelation[], roles: Record<id, Role>, settings }`

Responsibilities:
- Resolve each `block.sources` id to a `ResolvedEntity` or `ResolvedRelation`.
- **Role inference:**

  | `sources` shape | roles |
  |---|---|
  | 1 entity | `primary` |
  | 2 entities, same kind, no explicit `roles` | `primary` + auto-diff → `shared`/`changed` on notes |
  | 2 entities, different kind | `primary` + `context` |
  | 3+ entities | first `primary`, rest `context` |
  | any + a `noteGroup` | that layer = `highlight` |
  | a `compare` relation | 2 layers, `shared`/`changed` (persistent, labelled) |
  | a `transition` relation | 2 layers, `shared`/`added`/`removed` + movement |
  | block has `roles?: Record<id, Role>` | overrides the above |

- **Tuning-conflict rule:** the primary layer's tuning wins; flag any layer whose tuning
  differs (don't silently reproject).
- Drop any source whose kind isn't in the block's `accepts` (dev warning, no error).

Closed role enum: `primary · context · shared · changed · added · removed · highlight`.
Maps to a themeable palette. Add a role only for a real new case; never a free-form string.

### 4. Blocks

Every block consumes the **same entry point** — the adapter's 4-tuple — and derives its
own view. There is *no* universal `layers` array (`layers` is a fretboard-internal
helper: `{id, label, role, positions, tuning}[]`).

Each block declares `accepts: kind[]` and silently skips sources outside it:

| Block | accepts |
|---|---|
| `fretboard` | scale, chord, voicing, key, noteGroup, compare, transition |
| `degree-strip` | scale, chord, compare |
| `chord-diagram` | voicing, chord |
| `circle` | key |
| `progression` | progression, key |
| `key-family` | key |

Rebuild in this effort: `fretboard`, `degree-strip`, `chord-diagram`, `circle`,
`progression`, **and new `key-family`**.

- **CAGED** stops being a block kind → `fretboard` with `settings.mode: 'caged'`. `mode`
  is a general optional block field; fretboard modes at launch: `notes` (default),
  `caged` (renders the resolved `cagedRegions` as layers), `shapes` (fast-follow).
- **`progression`** stays self-contained (inline `steps`); ports mostly as-is, reading the
  union variant. `inspection.kind:'step'` selects one step.
- **`degree-strip`** with 2 same-kind sources → the degree-comparison view emerges from
  auto-diff; not a separate block.
- **`chord-diagram`** bound to a `voicing` → that shape; bound to a bare `chord` → a row
  of diagrams from its `cagedRegions`.
- **`circle`** is single-key; extra sources dropped.
- **`settings.comparison: 'highlight' | 'plain' | 'shared-only'`** replaces the old
  `shared_only` boolean. Default `highlight` when the block has 2 same-kind sources.
  `plain` = show all layers, no diff colouring. Per-block, no global coupling.

### 5. Fretboard component

- **SVG.** One coordinate system for N layers; arrows/zones fall out for later blocks.
  Each note is a focusable `<g role="button">` with an accessible name
  (`VoicingComparison` skips this today — the new one won't).
- `fret_start` / `fret_end` become **nullable; null = auto-fit**. Backend field bound
  raised to 19; the 12-fret window cap is dropped for the fretboard.
- Auto-range: `start = max(0, minFret − 1)`, `end = min(19, maxFret + 1)`, **minimum
  5-fret window**, nut shown whenever `start ≤ 2`. One pure function with a `ponytail:`
  comment on the constants.
- Click a note → `inspect` (cross-view). No layer-level selection.
- Degree labels: notes-only when there is more than one layer (v1).

### 6. Inspection

**Pull-based.** One global `Inspection` pointer on the workspace. Every block re-renders
and asks "do I contain this?" against its own resolved data — nothing is injected into
other blocks. A block reacts iff it can locate the inspected thing in what it's already
showing (a `circle` showing G major can locate any of G major's diatonic chords itself).

- `Inspection.key` stays **kind-dependent**: pitch-class for `pitch`/`chord`/`region_note`
  (broad match), entity id for `voicing`/`step`/`region` (specific).
- **Clears on any source edit.**

### 7. `NoteGroup` entity

`{ id, kind: 'noteGroup', label, notes: NoteRef[] }` where
`NoteRef = { pitch_class } | { string, fret }` — pitch-class refs tile every instance,
position refs pin exactly.

- A layer source for arbitrary highlights and "unknown shapes."
- **Replaces `TutorFocus.groups`** for anything that should persist.
- Tutor creates; learner can edit or delete. Survives a subsequent Tutor change (Working
  Draft state, covered by snapshot/undo).

`TutorFocus` shrinks to **one-turn attention only** — the transient ring on notes already
visible, never persisted.

### 8. Control panel — the 3-state Music bar

The sticky Music bar (from PR #78) gains states:

1. **source controls** — always shown (roots / key / tuning / chords).
2. **selected-block settings** — when a block is selected: a `sources` chip editor
   (add / remove / reorder), `labels`, `fret range` (fretboard only), the `comparison`
   enum, remove-block. *Not* block-kind swap, *not* a per-source role UI.
3. **inspected-object editor** — when a note / chord / step is inspected (the existing
   "Chord N" contextual section generalised).

- `selectedBlockId` is **ephemeral** (like `inspection`), clears on source edit.
- **Add-block** from the bar: pick a kind; it opens with `sources` = the currently
  inspected/selected entity, or empty.
- **Mobile:** the bar becomes a bottom sheet that swaps content by state, not three
  stacked sections.

### 9. Layout / composition

`composition` (rows of `{block_id, span, priority}`, 12-col grid) is **unchanged** — it
places blocks and doesn't care what they render. `recompose` stays a whole-composition
replace.

### 10. Agent contract

| op | change |
|---|---|
| `add_block` | takes `sources: string[]` (was `source_id`), optional `roles`, optional `settings.mode` |
| `add_entity` | gains `noteGroup` kind |
| `add_relation` | unchanged — `compare` / `transition` only |
| `remove_*` | operate on the new shapes |
| `recompose` | unchanged — whole-composition replace |

No `add_note` (insight notes deferred). The Tutor system prompt and the scripted model in
`backend/tests/v2/workspace_browser_app.py` are rewritten against the new ops; the
currently-broken `workspace-tutor` / `workspace-history` / `workspace-physical` e2e specs
are fixed as part of that work.

### 11. Starters

The 4 curated presets (`scale_comparison`, `physical_resolution`, `progression_starter`,
`caged_starter`) are **ported to the new model** — same questions, new entity/block/
`sources`/composition graphs. `provenance` stays. Minimising the starters into bare seed
questions is a separate UX call, not part of this work.

---

## Migration & data loss

- `ConceptWorkspace.schema_version` 1 → 2.
- On load, a v1 `working_draft` or a v1 saved ConceptStudy payload → the existing
  "this older study is unsupported, start fresh" path. **No converter.**
- **Accepted data loss:** all saved ConceptStudy artifacts become unsupported.
  SongStudies and Progressions are unaffected.
- `resolve_workspace` is a **full rewrite**, not an incremental change — the per-kind
  shape has no clean upgrade path.

## ADR

The core of ADR-0001 (a local typed workspace of Entities / Relations / Blocks, not a
global entity graph, not every Artifact becoming a workspace) **still holds**. The
uniform resolved shape and `sources[]` are new architectural decisions — add **ADR-0004:
"ConceptWorkspace uses a uniform resolved model and multi-source blocks"** as part of
ticket 2.

---

## Tickets

Publish as sub-issues of the parent `Spec:` issue. Dependencies via GitHub `blocked_by`.
Merge **PR #78 first** (Music-bar consolidation) — it is the base for ticket 6.

### T1 — Uniform `resolve_workspace` + schema v2 + preset rewrite
**Blocked by:** none.
Rewrite `resolve_workspace` to the `{entities, relations}` union output. Add
`cagedRegions` to major/minor chords, `diatonicChords` to keys, tiled `positions` to
scales/chords/keys. Bump `schema_version` to 2; v1 payloads route to "unsupported". Port
the 4 preset builders to the new entity/block/composition shape (still `source_id` at
this point — T2 converts to `sources[]`).
**Acceptance:** backend `pytest -q` green; `resolve` returns the union shape for all 4
starters; v1 payload → unsupported response; no frontend changes yet (frontend is broken
between T1 and T2 — land them together or behind a flag).

### T2 — `block.sources[]` + the adapter + `accepts` + ADR-0004
**Blocked by:** T1.
`source_id` → `sources: string[]` in the schema and every op/validator. Build the frontend
adapter (resolution + role inference + tuning rule + `accepts` filtering) as one tested
pure function. Add `accepts` to each block kind. Write ADR-0004.
**Acceptance:** adapter unit test covering every row of the role-inference table; the 4
starters render (blocks still their old implementations, now fed via the adapter);
`lint` + `build` green.

### T3 — Canonical SVG `Fretboard` + CAGED mode
**Blocked by:** T2.
One SVG `Fretboard` off the adapter tuple. Nullable/auto fret range; the auto-range
function. `settings.mode` field; `caged` mode renders `cagedRegions` as layers. Retire the
CAGED block kind and the 3 other fretboard renderers (`ConceptWorkspaceBlocks` grid,
`CagedWorkspaceBlock` grid, keep `VoicingComparison` only if SongStudy still needs it).
Per-note a11y.
**Acceptance:** `workspace-caged` + `concept-workspace` e2e green (updated for the new
DOM); a scale, a chord, a 2-chord group, and a `caged` chord all render on the one
component; horizontal scroll works; each note focusable with an accessible name.

### T4 — Rebuild `degree-strip` / `chord-diagram` / `circle` / `progression`
**Blocked by:** T3. **Parallel with T5.**
Each block reimplemented against the adapter tuple. `degree-strip` 2-up emerges from
auto-diff. `chord-diagram` handles bare-chord (CAGED-region row) and voicing.
`comparison` enum replaces `shared_only`. `circle` single-key. `progression` ports its
step rendering.
**Acceptance:** `workspace-physical`, `workspace-progression`, `workspace-saves` e2e green
(updated); all 4 starters visually equivalent-or-better to today.

### T5 — `key-family` block + diatonic chords
**Blocked by:** T3. **Parallel with T4.**
New `key-family` block; port `components/DiatonicChordsRow` to V2. Reads
`resolved.entities[keyId].diatonicChords`. Add to `Add view`.
**Acceptance:** binding a `key-family` block to a key shows I–vii° with qualities; clicking
a numeral inspects that chord and a bound `circle`/`fretboard` reflects it.

### T6 — Selection-driven 3-state Music bar
**Blocked by:** T2 (needs `sources[]`). Base: PR #78 merged.
`selectedBlockId` state. Move all per-block view controls out of block headers into the
bar's selected-block section (sources chip editor, labels, fret range, `comparison`,
remove). Generalise the "Chord N" contextual editor to the inspected-object slot.
Add-block flow from the bar. Mobile bottom sheet.
**Acceptance:** block headers show only title + selected state; selecting fretboard A vs B
edits each independently; e2e updated for controls-in-the-bar (as the CAGED-root move
already did); mobile has no horizontal scroll.

### T7 — Agent contract + prompt + scripted model
**Blocked by:** T2. Best after T3–T5 so the ops target real blocks.
Update `workspace_changes` ops (`add_block` sources/roles/mode, `add_entity` noteGroup).
`NoteGroup` entity + resolution. `TutorFocus` shrink. Rewrite the Tutor system prompt and
`workspace_browser_app.py` scripted model against the new model.
**Acceptance:** `workspace-tutor` / `workspace-history` / `workspace-physical` scripted-
model e2e **green** (they are broken on `main-v2` today); a Tutor turn can compose a
multi-source fretboard; `NoteGroup` highlight persists across a following turn.
