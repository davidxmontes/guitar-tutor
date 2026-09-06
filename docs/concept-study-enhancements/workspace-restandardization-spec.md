# Spec draft — Re-standardize the ConceptWorkspace render model

**Status:** Published — spec #79, tickets T1–T7 = #80–#86 (`blocked_by` ordered).
**Grounded against:** `feature/workspace-ux-cleanup` @ `9481536` (2026-09-05), plus
`main-v2` @ `a4cf503`.
**Design reference:** `concept-inventory.md` (this directory) — keep it linked from the
issue; it is the "why", this is the "what/how".
**Settled via:** grilling session 2026-09-05 (see conversation). Every decision below is
confirmed, not proposed. Architectural review folded in 2026-09-05: split `sourceRoles`
from `comparison` (§3), typed `Inspection` union + `materialize` op (§6/§6a), write-time
compatibility (§3a), two-policy auto-range (§5), Tutor composition policy (§10a),
`NoteGroup` moved to T1, T1+T2 atomic.

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
- **Cross-block playback state** — a shared play-head every block responds to. The
  architecture makes this the obvious fast-follow (all blocks over one subject), but it
  is not in this refactor.
- **Tuning reprojection** — recomputing a source's positions for a different target
  tuning. Mixed-tuning sources are allowed in the model; the fretboard refuses to overlay
  them (§5) rather than reproject.

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
| `scale` | every fret instance of its notes, frets 0–19, computed against `workspace.tuning` | — |
| `chord` | every fret instance of its notes, 0–19, against `workspace.tuning` | `cagedRegions` (major/minor only), `quality` |
| `voicing` | its exact fretted positions only, in its **own** `tuning` | `chord_id` |
| `key` | every fret instance of its 7 notes, against `workspace.tuning` | `circle: string[]`, `diatonicChords: {numeral, root, quality}[]` |
| `noteGroup` | resolved from `NoteRef[]` (pitch-class refs → against `workspace.tuning`; position refs → literal) | — |
| `progression` | empty | `steps: {root, quality, function, positions, tuning}[]`, `derived`, `key_id` |

Only `voicing` (and literal `noteGroup` positions) carry a tuning other than
`workspace.tuning`, so the only mixed-tuning case a block can hit is a voicing next to a
theory source — handled at §5.

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

```
(block, resolved) → {
  sources:     ResolvedEntity[],
  relations:   ResolvedRelation[],
  sourceRoles: Record<SourceId, 'primary' | 'context' | 'highlight'>,
  comparison?: { shared: number[], changed?: number[], added?: number[], removed?: number[] },  // pitch classes
  conflicts:   { tuningMismatch: SourceId[], skipped: SourceId[] },
  settings,
}
```

**Two separate axes** — a persistent source-of-confusion in the earlier draft:

- **`sourceRoles`** describes each *layer* — which one is the subject (`primary`), which
  are backdrop (`context`), which is agent attention (`highlight`). Closed set of 3.
- **`comparison`** describes *notes inside a comparison* — which pitch classes are
  `shared` / `changed` / `added` / `removed`. It mirrors the existing
  `resolved.comparisons[id]` shape exactly. Present only when the block compares two
  same-kind entities or binds a `compare`/`transition` relation, and `settings.comparison
  !== 'plain'`.

They do not share a type. `Record<id, Role>` conflating both is gone.

Responsibilities:

- Resolve each `block.sources` id to a `ResolvedEntity` or `ResolvedRelation`.
- **`sourceRoles` inference:**

  | `sources` shape | `sourceRoles` | `comparison` |
  |---|---|---|
  | 1 entity | `primary` | — |
  | 2 entities, same kind | both `primary` (siblings) | auto-computed from the two note sets |
  | 2 entities, different kind | first `primary`, second `context` | — |
  | 3+ entities | first `primary`, rest `context` | — |
  | any + a `noteGroup` | the noteGroup layer `highlight` | unchanged |
  | a `compare` relation | its two members `primary` | from the relation payload |
  | a `transition` relation | its two members `primary` | from the relation payload (+ `movement`) |
  | block carries `sourceRoles?: Record<SourceId, Role>` | overrides inference | unchanged |

- **Tuning:** the fretboard **does not overlay sources with different tunings**. The
  adapter reports every non-primary source whose tuning differs from the primary's in
  `conflicts.tuningMismatch`; the block renders a "these use different tunings" state for
  those layers rather than drawing them on the primary grid. (In practice this is only a
  voicing next to a theory source — everything else resolves against `workspace.tuning`.)
  Reprojection is out of scope.
- **Incompatible sources are not silently dropped at write time.** See §3a.

Closed enums:
- **layer role:** `primary · context · highlight`
- **comparison membership:** `shared · changed · added · removed`

Each maps to a themeable palette. Extend an enum only for a real new case; never a
free-form string.

### 3a. Compatibility — no silent success

A source whose kind isn't in a block's `accepts` (§4), or a set of sources a block can't
meaningfully combine, is handled in **two tiers**:

- **Write time** (`add_block` / editing `sources` / `recompose`): the op **rejects, or
  returns a structured compatibility warning** naming the offending source and block. The
  Tutor and the source-editor UI must see that the composition is invalid — a tool that
  returns success while the UI renders nothing is a worse failure than an error.
- **Load / render time** (stale drafts, a kind removed later): **tolerate and skip** the
  unsupported source, surface it in `conflicts.skipped`, render the rest.

So the circle's source editor cannot happily accept three keys and silently ignore two —
it rejects the second and third at write time.

### 4. Blocks

Every block consumes the **same entry point** — the adapter output above — and derives its
own view. There is *no* universal `layers` array (`layers` is a fretboard-internal
helper: `{ id, label, sourceRole, positions, tuning }[]`).

Each block declares `accepts: kind[]`. Sources outside it are rejected at write time and
skipped at render time (§3a):

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
- **`circle`** is single-key; a second key is rejected at write time (§3a).
- **`settings.comparison: 'highlight' | 'plain' | 'shared-only'`** replaces the old
  `shared_only` boolean. Default `highlight` when the block has 2 same-kind sources.
  `plain` = show all layers, no diff colouring. `shared-only` = show only shared pitch
  classes. Per-block, no global coupling.

### 5. Fretboard component

- **SVG.** One coordinate system for N layers; arrows/zones fall out for later blocks.
  Each note is a focusable `<g role="button">` with an accessible name
  (`VoicingComparison` skips this today — the new one won't).
- `fret_start` / `fret_end` become **nullable; null = auto range**. Backend field bound
  raised to 19; the 12-fret window cap is dropped for the fretboard.
- **Auto range is two policies, not one algorithm** — because `scale`/`chord`/`key`
  positions are *tiled* across the whole neck (§1), so a naive min/max always returns
  0–19:

  | layer positions | policy |
  |---|---|
  | at least one **bounded** source (a `voicing`, a literal-position `noteGroup`, a `caged` region set) | **fit**: `start = max(0, minFret − 1)`, `end = min(19, maxFret + 1)`, minimum 5-fret window |
  | **only tiled** sources (scale / chord / key) | **overview**: default window `0–12`, horizontal scroll to the rest |

  One pure function, branches on "any bounded layer?", `ponytail:` comment on the constants.
- **Mixed tunings are not overlaid.** Layers in `conflicts.tuningMismatch` (§3) render as
  a separate "different tuning" strip / callout, not on the primary grid.
- Click a note → `inspect` (cross-view). No layer-level selection.
- Degree labels: notes-only when there is more than one layer (v1).

### 6. Inspection

**Pull-based.** One global `Inspection` pointer on the workspace. Every block re-renders
and asks "do I contain this?" against its own resolved data — nothing is injected into
other blocks. A block reacts iff it can locate the inspected thing in what it's already
showing (a `circle` showing G major can locate any of G major's diatonic chords itself).

**`Inspection` is a discriminated union — a pitch class is not enough to identify a
chord** (`D` major / minor / 7 / sus4 share a root pitch class):

```
| { kind: 'pitch',   pitch_class: number }
| { kind: 'chord',   root: number, quality: string }        // a derived chord (e.g. the ii of a key)
| { kind: 'chord',   entity_id: string }                    // an entity-backed Chord
| { kind: 'voicing', entity_id: string }
| { kind: 'step',    block_id: string, index: number }
| { kind: 'region' | 'region_note' | 'region_pair', ... }   // CAGED, as today
```

- A block matches by whatever it can: a fretboard matches a `chord` inspection by
  building that root+quality's pitch classes and lighting them; the circle matches by
  finding the numeral in its key's `diatonicChords`.
- **Clears on any source edit.**

**Inspecting a derived thing does not materialize it.** If you inspect the `ii` chord
(a derived object inside a key, not an entity) and then press **Add view**:
- the new block binds the **parent key**, and the inspection is preserved so the new view
  reflects `ii` immediately; **or**
- you **materialize** — see §6a.

### 6a. `materialize` — a general operation

Turning a derived object into a real Entity:

- a derived chord (`{root, quality}` from a key's `diatonicChords`, or a progression
  step) → a `Chord` entity;
- a CAGED region → a `Voicing` entity (this is today's "Keep selected voicing");
- a derived progression → concrete (today's "Work with these chords").

One op, available wherever a derived object is inspected — not a per-flow button. After
materialize the object is a normal Entity: addable to any block's `sources`, editable in
the Music bar, undoable.

### 7. `NoteGroup` entity

`{ id, kind: 'noteGroup', label, notes: NoteRef[] }` where `NoteRef` is one of:

- `{ pitch_class }` — **pitch-anchored**: tiles every instance; follows the note through a
  tuning change.
- `{ string, fret }` — **physical-anchored**: pinned to that fret; a tuning change keeps
  the *location*, not the note.

The two forms are the semantic answer to "what does this highlight mean under a retune" —
spelled out so the frontend doesn't invent an interpretation.

- A layer source for arbitrary highlights and "unknown shapes."
- **Replaces `TutorFocus.groups`** for anything that should persist.
- Tutor creates; learner can edit or delete. Survives a subsequent Tutor change (Working
  Draft state, covered by snapshot/undo).

`TutorFocus` shrinks to **one-turn attention only** — the transient ring on notes already
visible, never persisted.

### 8. Control panel — the Music bar

The sticky Music bar (from PR #78) has a **persistent section** plus **one contextual
section**:

- **Persistent — source controls**: roots / key / tuning / chords. Always shown.
- **Contextual — one of:**
  - **selected-block settings** (a block is selected): a `sources` chip editor
    (add / remove / reorder), `labels`, `fret range` (fretboard only), the `comparison`
    enum, remove-block. *Not* block-kind swap, *not* a per-source role UI.
  - **inspected-object editor** (a note / chord / step is inspected): the existing
    "Chord N" contextual section, generalised.

- `selectedBlockId` is **ephemeral** (like `inspection`), clears on source edit.
- **Contextual precedence** when both a block is selected *and* something is inspected:
  **inspected-object > selected-block > (persistent source controls always under both)**.
  A clear back/up affordance steps out one level.
- **Add-block** from the bar: pick a kind; it opens with `sources` = the currently
  inspected/selected entity, or empty. If the inspected thing is *derived* (§6),
  Add-block offers "bind the parent key" or "materialize first."
- **Mobile:** the contextual section is a bottom sheet driven by the precedence above —
  inspecting a note inside a selected block shows the inspected-object sheet, with back
  to the block sheet, with back to source controls.

### 9. Layout / composition

`composition` (rows of `{block_id, span, priority}`, 12-col grid) is **unchanged** — it
places blocks and doesn't care what they render. `recompose` stays a whole-composition
replace.

### 10. Agent contract

| op | change |
|---|---|
| `add_block` | takes `sources: string[]` (was `source_id`), optional `sourceRoles`, optional `settings.mode` |
| `add_entity` | gains `noteGroup` kind |
| `add_relation` | unchanged — `compare` / `transition` only |
| `materialize` | **new** — derived chord / region / progression → an Entity (§6a) |
| `remove_*` | operate on the new shapes |
| `recompose` | unchanged — whole-composition replace |

`add_block` and `recompose` **reject incompatible compositions at write time** (§3a) — the
Tutor gets an error or a structured warning, never a false success. No `add_note` (insight
notes deferred). The `NoteGroup` schema, resolution, and adapter support land in T1–T2
(not T7); T7 only adds the `add_entity(noteGroup)` op path, persistent-highlight
behaviour, and the `TutorFocus` shrink.

The Tutor system prompt and the scripted model in
`backend/tests/v2/workspace_browser_app.py` are rewritten against the new ops; the
currently-broken `workspace-tutor` / `workspace-history` / `workspace-physical` e2e specs
are fixed as part of that work.

### 10a. Tutor composition policy (behavioural, not schema)

The model lets the Tutor compose anything; these rules keep it a coherent app rather than
an LLM generating dashboards. They go in the Tutor prompt (T7):

- **Prefer rebinding an existing block** (change its `sources`) over adding another.
- **Preserve blocks the question didn't touch**, and their positions.
- **One anchor view + at most 1–2 supporting views** for a given answer.
- **Never show two blocks that communicate essentially the same thing.**
- **Inspect / highlight / annotate before adding a visualization** when that can answer
  the question.
- **Full `recompose` only when the learner's question materially changes subject** — not
  for an incremental follow-up.

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

**T1 and T2 land as one atomic merge.** T1 leaves the frontend non-functional; the whole
point of the project is "no half-migration," so they are separate implementation tickets
but a single PR / merge — no window where `main-v2` has the new resolver and the old
blocks.

### T1 — Uniform `resolve_workspace` + schema v2 + `NoteGroup` + preset rewrite
**Blocked by:** none.
Rewrite `resolve_workspace` to the `{entities, relations}` union output. Add
`cagedRegions` to major/minor chords, `diatonicChords` to keys, tiled `positions`
(against `workspace.tuning`) to scales/chords/keys. Add the `NoteGroup` entity kind + its
`NoteRef[]` resolution. Bump `schema_version` to 2; v1 payloads route to "unsupported".
Port the 4 preset builders to the new entity/block/composition shape (still `source_id`
at this point — T2 converts to `sources[]`).
**Acceptance:** backend `pytest -q` green; `resolve` returns the union shape for all 4
starters; a `noteGroup` entity with mixed `NoteRef`s resolves; v1 payload → unsupported
response.

### T2 — `block.sources[]` + the adapter + `accepts` + compatibility + ADR-0004
**Blocked by:** T1. **Same merge as T1.**
`source_id` → `sources: string[]` in the schema and every op/validator. Build the frontend
adapter as one tested pure function: `sources` resolution, `sourceRoles` inference,
`comparison` computation, the **no-overlay tuning rule** (`conflicts.tuningMismatch`),
`accepts` filtering (`conflicts.skipped`). Implement **§3a write-time compatibility**:
`add_block` / `sources` edits / `recompose` reject or structured-warn on an incompatible
source. Add `accepts` to each block kind. Write ADR-0004.
**Acceptance:** adapter unit test covering every row of §3's inference table + the tuning
and skip conflict paths; adding an incompatible source returns an error/warning, not
success; the 4 starters render (blocks still their old implementations, fed via the
adapter); `lint` + `build` green.

### T3 — Canonical SVG `Fretboard` + CAGED mode
**Blocked by:** T2.
One SVG `Fretboard` off the adapter output. Nullable fret range + the **two-policy
auto-range** function (bounded → fit; tiled-only → 0–12 overview + scroll). `settings.mode`
field; `caged` mode renders `cagedRegions` as layers. Render the mixed-tuning conflict
state for `conflicts.tuningMismatch` layers. Retire the CAGED block kind and the 3 other
fretboard renderers (`ConceptWorkspaceBlocks` grid, `CagedWorkspaceBlock` grid, keep
`VoicingComparison` only if SongStudy still needs it). Per-note a11y.
**Acceptance:** `workspace-caged` + `concept-workspace` e2e green (updated for the new
DOM); a scale, a chord, a 2-entity same-kind comparison, a `noteGroup`, and a `caged`
chord all render on the one component; a scale-only board opens at 0–12 and scrolls; a
voicing board fits its frets; a drop-D voicing beside a standard scale renders the
conflict state, not a mis-aligned overlay; each note focusable with an accessible name.

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

### T6 — Selection-driven Music bar + `materialize`
**Blocked by:** T2 (needs `sources[]`). Base: PR #78 merged.
`selectedBlockId` state. Move all per-block view controls out of block headers into the
bar's contextual section (sources chip editor, labels, fret range, `comparison`, remove).
Generalise the "Chord N" contextual editor to the inspected-object slot; implement the
**inspected-object > selected-block > source** precedence and back/up affordance.
Add-block flow from the bar (with the derived-object "bind parent key / materialize"
branch). Implement the `materialize` op (§6a) — frontend gesture + backend op.
Mobile bottom sheet driven by the precedence.
**Acceptance:** block headers show only title + selected state; selecting fretboard A vs B
edits each independently; inspecting a note inside a selected block shows the
inspected-object sheet with working back navigation; materializing a diatonic chord makes
it addable to a fretboard; e2e updated for controls-in-the-bar (as the CAGED-root move
already did); mobile has no horizontal scroll.

### T7 — Agent contract + composition policy + prompt + scripted model
**Blocked by:** T2. Best after T3–T5 so the ops target real blocks.
Update `workspace_changes` ops (`add_block` sources/sourceRoles/mode; `add_entity`
noteGroup path; `materialize` if not already landed in T6). Persistent-highlight
behaviour for `NoteGroup` (schema/resolution already in T1). `TutorFocus` shrink to
one-turn attention. Write the **§10a composition policy** into the Tutor system prompt.
Rewrite `workspace_browser_app.py` scripted model against the new model.
**Acceptance:** `workspace-tutor` / `workspace-history` / `workspace-physical` scripted-
model e2e **green** (they are broken on `main-v2` today); a Tutor turn composes a
multi-source fretboard; an incompatible `add_block` returns a warning, not success; a
`NoteGroup` highlight persists across a following turn.

---

## Fast-follow (not this effort, but the model enables them cheaply)

- **Cross-block playback** — one play-head every block responds to, now that they can all
  render the same subject.
- **Movement / voice-leading diagram** — SVG arrows between two `transition` layers.
- **Loop timeline** — a `progression` `settings.mode`.
- **Interval ruler**, **editable chord diagram**, **`shapes` fretboard mode**.
- **Insight notes** — the deferred annotation feature.
- **Tuning reprojection** — recompute a source's positions for a target tuning so mixed
  tunings *can* overlay.
