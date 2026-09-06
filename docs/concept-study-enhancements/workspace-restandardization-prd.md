# PRD — Re-standardize the ConceptWorkspace render model

> **Why this file exists:** issue #79 was written in a bespoke structure. The repo's
> specs (e.g. #10) follow the `to-spec` template — Problem / Solution / User Stories /
> Implementation Decisions / Testing Decisions / Out of Scope / Further Notes. This is
> the same content in that template, produced by hand, so it can be compared against a
> real `/to-spec` run before either replaces #79. Design detail and rationale live in
> `workspace-restandardization-spec.md` and `concept-inventory.md`.

---

## Problem Statement

A learner opens an Explore question — "how does major sound different from minor?", "why
does D resolve to G?" — and gets a wall of panels that each explain a slice of the answer
in their own way, plus scattered controls for changing the music. The same fact is drawn
two or three times, nothing signals which panel is the answer, and the vocabulary ("degree
strip", "concrete music", "reference shape") is implementation language. When the learner
asks the Tutor a follow-up, the Tutor can only bind each visualization to a single musical
object, so it can't compose "these four chords over this scale on one fretboard" — it adds
another near-duplicate panel instead.

Underneath, every visualization is a bespoke renderer coupled to one entity kind, reading
one of eight differently-shaped resolved records. Adding a concept or a view means new
plumbing, and the Tutor's ability to compose an explanation from trusted pieces is
bottlenecked by that coupling. There are three or four fretboard implementations and two
chord-diagram implementations, none shared.

## Solution

One musical workspace where **any visualization can show any relevant musical thing, and
the Tutor composes the explanation** from a shared catalog of blocks. The learner:

- opens a question and sees one clear answer view, with supporting views demoted, not
  competing;
- changes the music from one place (the Music bar), regardless of which question they're on;
- clicks any note or chord and watches it light up across every view that contains it;
- asks the Tutor a follow-up and gets the *existing* views re-aimed at the new angle, not
  a pile of new panels.

Behind that, `resolve_workspace` returns one uniform model — every musical object has the
same core shape (its notes, its positions on the neck, its tuning) plus typed extras — and
a block is a view over a **list** of those objects, not one. A single adapter turns a
block's source list into what the block draws. One fretboard component, driven by that
adapter, replaces the four.

## User Stories

### The learner

1. As a learner, I want the answer to my question to be one obvious view, so that I'm not
   guessing which of three panels to read.
2. As a learner, I want supporting detail collapsed by default, so that the screen isn't
   three equally-loud explanations of the same thing.
3. As a learner comparing two scales, I want the notes that differ to be visually marked,
   so that I can see "these three notes move" at a glance instead of eyeballing two rows.
4. As a learner, I want to change the root, key, tuning, or a chord from one consistent
   place, so that I don't hunt for the control inside whichever panel happens to own it.
5. As a learner, I want to click a note on the fretboard and see the same note highlighted
   on the degree strip and the circle, so that I can connect the shapes to the theory.
6. As a learner, I want to click a chord in a key's family and see where it sits on the
   circle and the neck, so that I understand how the chord relates to the key.
7. As a learner exploring CAGED, I want all five shapes shown across the whole neck at
   once with their overlaps marked, so that I see how one chord connects up the fretboard.
8. As a learner, I want a full-neck fretboard by default for scales and chords, so that I
   see the pattern repeat rather than a five-fret window.
9. As a learner, I want to hear the scale, chord, or progression, so that the visual is
   anchored to a sound.
10. As a learner, I want a chord I've been shown (say the ii of a key) to be something I
    can pull onto its own fretboard, so that I can study it without losing my place.
11. As a learner, I want my changes autosaved and undoable, so that exploring is safe.
12. As a learner on a phone, I want the controls to appear as a bottom sheet that follows
    what I've selected, so that the small screen shows one thing at a time.
13. As a learner, I want the Tutor's follow-up answer to keep the views I was already
    looking at where they were, so that the workspace doesn't rearrange under me.

### The Tutor

14. As the Tutor, I want to bind one fretboard to several chords plus a scale, so that I
    can show a progression against its key on a single view.
15. As the Tutor, I want to highlight an arbitrary set of notes ("this shape") as a
    persistent layer, so that I can point at something that isn't a named chord or scale.
16. As the Tutor, I want to re-aim an existing block at a new subject, so that a follow-up
    question refines the current view instead of spawning another.
17. As the Tutor, I want a composition I build to be rejected at the time I build it if a
    view can't render one of the sources I gave it, so that I don't report success while
    the learner sees nothing.
18. As the Tutor, I want to turn a derived object (a diatonic chord, a CAGED region) into
    a real editable entity when the learner wants to work on it, so that "keep this" is
    one operation everywhere instead of a different button per view.
19. As the Tutor, I want one-turn "look here" attention that disappears next turn, kept
    separate from highlights the learner should be able to keep.

### The developer

20. As a developer, I want every block to read the same resolved shape, so that adding a
    view doesn't mean learning eight record formats.
21. As a developer, I want the source-list-to-layers logic in one tested pure function, so
    that role assignment and tuning handling aren't re-implemented per block.
22. As a developer, I want one fretboard component, so that CAGED, comparison, and
    physical fretboards don't drift into separate component families.
23. As a developer, I want a new visualization to declare which source kinds it accepts
    and get compatible sources filtered for it, so that I don't write defensive per-kind
    branching.

## Implementation Decisions

### Uniform resolved model

- `resolve_workspace` returns `{ entities: Record<id, ResolvedEntity>, relations:
  Record<id, ResolvedRelation> }`, replacing today's eight per-kind records.
- `ResolvedEntity` is a discriminated union on `kind` with a shared core — id, kind,
  label, notes, fretboard positions, tuning — plus typed per-kind extras (a key's circle
  order and diatonic chords, a chord's CAGED regions, a progression's steps).
- Scale, chord, and key positions are tiled across the whole neck, computed against the
  workspace tuning. Only a voicing (and a literal-position highlight) carries a different
  tuning.
- Relation payloads (compare → shared/added/removed pitch classes; transition →
  movement/functions/key) are unchanged.
- `schema_version` goes 1 → 2. A v1 payload routes to the existing "unsupported, start
  fresh" path. There is no converter; saved ConceptStudies are lost. `resolve_workspace`
  is a full rewrite, not an incremental change.

### Composable blocks

- A block binds to `sources: string[]` (was one `source_id`). Each id is an entity or a
  relation; mixed lists allowed. There is no generic "group" relation — `compare` and
  `transition` stay only for the semantics they carry.
- A frontend adapter is the single entry point every block consumes:
  `(block, resolved) → { sources, relations, sourceRoles, comparison?, conflicts, settings }`.
- **Two separate role axes** (this was conflated in the first draft):
  - `sourceRoles: Record<SourceId, 'primary' | 'context' | 'highlight'>` — describes each
    layer.
  - `comparison?: { shared, changed?, added?, removed? }` (pitch classes) — describes
    notes *inside* a comparison. Mirrors the existing `comparisons[id]` shape. Present
    only when the block compares two same-kind entities or binds a compare/transition,
    and the block's `comparison` setting isn't `plain`.
- The adapter infers `sourceRoles` from the source-list shape (1 entity → primary; 2
  same-kind → siblings + auto-computed `comparison`; 2 different-kind → primary + context;
  a noteGroup → highlight; a compare/transition relation → its members primary + payload
  `comparison`). A block may carry a sparse `sourceRoles` override.
- Each block declares `accepts: kind[]`. The adapter drops unrenderable sources at render
  time (reported in `conflicts.skipped`).
- **Compatibility is enforced at write time, not silently at render time.** `add_block`,
  editing a block's `sources`, and `recompose` reject or return a structured warning when
  a source isn't compatible with the block. Render time tolerates and skips.
- Blocks in this effort: fretboard, degree-strip, chord-diagram, circle, progression, and
  a new key-family. CAGED stops being a block kind and becomes a fretboard `mode`.

### Fretboard

- One SVG component, driven by the adapter, replacing the current windowed grid, the
  CAGED grid, and (where possible) `VoicingComparison`. Each note is a focusable element
  with an accessible name.
- Fret range is nullable. Auto range is two policies: a bounded source (voicing, literal
  highlight, CAGED regions) fits its positions with padding; a tiled-only source (scale,
  chord, key) opens at a 0–12 overview and scrolls.
- Sources with different tunings are not overlaid on one grid; the mismatched layers
  render as a separate "different tuning" state.

### Inspection

- One global pull-based pointer. Every block re-renders and asks "do I contain this?"
  against its own resolved data; nothing is injected into other blocks.
- `Inspection` is a discriminated union. A chord is identified by root + quality (a
  pitch class is not enough — D major/minor/7/sus4 share a root), or by entity id when
  it's entity-backed.
- Inspection clears on any source edit.

### `materialize`

- One operation, available wherever a derived object is inspected: a derived chord (from
  a key's family or a progression step) becomes a `Chord` entity; a CAGED region becomes
  a `Voicing`; a derived progression becomes concrete. Replaces the per-flow "Keep
  voicing" / "Work with these chords" buttons.

### `NoteGroup`

- An entity: a label plus a list of note references. A `{ pitch_class }` reference is
  pitch-anchored (tiles, follows the note through a retune); a `{ string, fret }`
  reference is physical-anchored (stays at the fret).
- The persistent home for arbitrary Tutor highlights and "unknown shapes". Replaces
  `TutorFocus.groups`. Tutor creates; learner can edit or delete; survives a following
  Tutor change.
- `TutorFocus` shrinks to one-turn attention only.

### Control panel — the Music bar

- A persistent source-controls section plus one contextual section that shows either the
  selected block's settings or the inspected object's editor.
- Contextual precedence: inspected-object over selected-block over the always-present
  source controls, with a back affordance. On mobile the contextual section is a bottom
  sheet driven by that precedence.
- All per-block view controls move out of block headers into the bar. Block headers keep
  a title and a selected state only.
- `selectedBlockId` is ephemeral, clears on source edit.

### Agent contract

- `add_block` takes `sources` and optional `sourceRoles` / `settings.mode`. `add_entity`
  gains the `noteGroup` kind. A new `materialize` op. `add_relation`, `recompose`
  (whole-composition replace), and `remove_*` are otherwise unchanged. No annotation op.
- The Tutor prompt carries a composition policy: prefer re-binding an existing block to
  adding one; preserve untouched blocks and positions; one anchor view plus at most one
  or two supporting views; never two blocks saying the same thing; prefer
  inspect/highlight over adding a view; full recompose only when the subject materially
  changes.

### Layout

- `composition` (rows of placements on a 12-column grid) is unchanged. It places blocks
  and is indifferent to what they render.

### ADR

- ADR-0001 (a local typed workspace of entities/relations/blocks) still holds. Add
  ADR-0004: "ConceptWorkspace uses a uniform resolved model and multi-source blocks".

## Testing Decisions

**What a good test asserts here:** the shape of resolved data for a known workspace; the
adapter's output for a given block and source list; and browser-level behaviour (a note
clicked in one view lights up in another; a starter renders; an incompatible composition
is refused). Not the internal structure of a component.

**Seams — as few as possible, existing preferred:**

1. **The resolve endpoint** (backend). Already a seam: `backend/tests/v2/` asserts
   resolved output today. The rewrite re-points those assertions at the union shape for
   the four starters and the new derived data (CAGED regions, diatonic chords, tiled
   positions, noteGroup resolution).
2. **The adapter** (frontend). A new seam, but the highest possible one on the frontend:
   one pure function, `(block, resolved) → adapter output`. Unit-tested against every row
   of the role-inference table plus the tuning-mismatch and skipped-source paths. This is
   the seam that keeps role/tuning logic from spreading into components.
3. **The Playwright workspace suite** (`frontend/e2e/workspace-*.spec.ts`). Already the
   top seam for this area. Each rebuilt block updates its spec for the new DOM; new
   coverage for a multi-source fretboard, the two auto-range policies, the tuning-conflict
   state, materialize, and the selection-driven bar. Prior art: the existing
   `concept-workspace`, `workspace-caged`, `workspace-physical`, `workspace-progression`
   specs.
4. **The scripted-model Tutor seam** (`backend/tests/v2/workspace_browser_app.py` +
   `workspace-tutor` / `workspace-history` / `workspace-physical` specs). Rewritten
   against the new ops. These specs are red on `main-v2` today (prompt-template drift);
   this work turns them green — a compatibility rejection surfaces to the Tutor, a
   multi-source fretboard composes, a noteGroup highlight persists across a turn.

**Coverage the developer owns per ticket** lives in each ticket's acceptance criteria.

## Out of Scope

- **Insight notes** — Tutor-authored text callouts anchored to a block or position.
  Deferred; add later.
- **New block kinds beyond key-family** — movement/voice-leading diagram, interval ruler,
  loop timeline, editable chord diagram, the `shapes` fretboard mode. Fast-follow once the
  model is proven.
- **Cross-block playback** — a shared play-head every block responds to. The obvious next
  step, not this effort.
- **Tuning reprojection** — recomputing a source's positions for a target tuning so mixed
  tunings can overlay. The fretboard refuses to overlay them instead.
- **SongStudy model changes** — it shares leaf components eventually; its
  artifact/resolved model is untouched.
- **A data converter** for saved ConceptStudies — clean break.
- **"Home root" degree labelling** across mixed-root layers — v1 is notes-only for
  multi-layer boards.
- **Minimising the starter presets** into bare seed questions — a separate UX call.

## Further Notes

- **Delivery is multi-session.** Tickets: T1 (uniform resolve + schema v2 + NoteGroup +
  presets) and T2 (`sources[]` + adapter + compatibility + ADR-0004) land as **one
  atomic merge** — T1 alone leaves the frontend non-functional and "no half-migration" is
  the thesis. T3 (SVG fretboard + CAGED mode) follows. T4 (rebuild degree-strip /
  chord-diagram / circle / progression) and T5 (key-family) run in parallel after T3. T6
  (selection-driven Music bar + materialize) and T7 (agent contract + composition policy +
  scripted model) follow T2. PR #78 (the Music-bar consolidation groundwork) merges first.
- **This spec is a snapshot.** It goes stale the first time implementation teaches
  something; durable learnings belong in `CONTEXT.md` or an ADR, not an edit here.
- The upstream reasoning — learner profile, the concept catalog, why the circle is wrong
  for "why D resolves to G", the grilling that produced these decisions — is in
  `concept-inventory.md` and the conversation of 2026-09-05.
