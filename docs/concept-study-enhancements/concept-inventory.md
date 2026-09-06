# Guitar Tutor V2 — Concept & Block Catalog

**Status:** Working design reference. Not a spec, not a curriculum.
**Grounded against:** `feature/workspace-ux-cleanup` at `bc2d4ad` (2026-09-05).
**Companion docs:** `guitar_tutor_v2_composable_concept_workspace_brain_dump.md` (architecture),
`guitar_tutor_v2_concept_workspace_grill_decisions.md` (decisions), `../../CONTEXT.md` (glossary).

Glossary terms per `CONTEXT.md`: **Entity**, **Relation**, **Block**, **Inspection**,
**ConceptWorkspace**, **Tutor**, **Tutor Focus**.

---

## 0. The model, in one paragraph

There is **no hard-coded lesson or layout per concept.** The product is:

> **a catalog of musical concepts + a catalog of visual blocks, and the Tutor has free
> rein to pick, combine, arrange, and annotate them to explain whatever the learner
> asks.**

This doc catalogs both halves and flags where the model or the blocks are too thin for
the Tutor to compose well. The four current "starters" are just seed questions — entry
points, not curated experiences.

What we build: **blocks** (§3), the **model bindings** the Tutor needs to attach blocks
to (§4), and **insight notes** (§5). Not per-concept heroes.

---

## 1. Learner & intent

**Who:** a player who can already hold a few chords and wants to **understand the theory
behind what they play** and **discover new progressions and voicings.** Late-beginner
through intermediate. Motivation is curiosity, not a course.

**Assume:** note names, basic open chords. **Don't assume:** intervals, modes, roman
numerals, the word "voicing."

**North-star:** *A workspace for exploring musical ideas — visually and by ear — not a
course. You open a question, hear and see the answer on a fretboard, change the inputs,
and follow your curiosity. The Tutor is a guide you can ask.*

**Explore areas the product owner named:** scales · triads · chords in a scale (diatonic
harmony) · voicings · progressions · CAGED · circle of fifths · (and natural neighbours:
intervals, modes, pentatonic/blues, chord–scale fit).

---

## 2. Concept catalog

Musical ideas the Tutor can build an explanation around. The **coverage** column is the
useful part: it says where today's blocks/model fall short of expressing the idea.

| # | Concept | The core idea | Coverage today |
|---|---|---|---|
| C1 | **Intervals / half-steps** | distance between two notes, named (m3, P5, tritone…) | 🟡 visible as fret gaps, never named or measurable |
| C2 | **Major scale** | 7 notes, numbered 1–7, a pattern on the neck | ✅ degree strip + fretboard |
| C3 | **Minor & modes** | minor = ♭3 ♭6 ♭7; a mode is the same notes from a new home | 🟡 compare works; "same notes, new home" unshown |
| C4 | **Pentatonic / blues** | the scale with notes removed (blues adds ♭5) | 🟡 exist as modes; "subset of" invisible |
| C5 | **Triads & 7ths** | a chord is stacked 3rds: 1–3–5 (+7); four triad qualities | 🟡 chord tones shown; stacking idea not; Chord limited to maj/min |
| C6 | **Chords in a scale (diatonic harmony)** | the 7 chords a key contains, and which are maj/min/dim | 🟡 roman numerals leak into the progression view; no "the family" view |
| C7 | **Function & cadence** | tension → resolution; V→I; leading tone; common tones | 🟡 movement computed; buried in prose |
| C8 | **Keys / circle of fifths** | key distance, relative maj/min, sharps & flats, near-by chords | ✅ circle block |
| C9 | **Transposition** | same music, moved to a new key | ✅ action exists; "same, shifted" not visualized |
| C10 | **CAGED** | one chord, five shapes, connected up the neck | 🟡 regions + adjacency exist; not "all five across the whole neck" |
| C11 | **Voicings & voice-leading** | one chord, many shapes; smooth motion between two chords | 🟡 diagrams + movement exist; per-finger motion is prose |
| C12 | **Progressions as phrases** | 4 chords heard as a repeating loop, not a list | 🟡 chord cards; no loop / repetition / rhythm |
| C13 | **The fretboard as one system** | any note, octaves, shapes tiling the neck | 🟡 windowed only; no whole-neck / tiling story |
| C14 | **Chord–scale fit** | which scale to play over a chord / key / progression | ⬜ no model binding, no view |

**Where the Tutor is currently blocked:** C6 and C14 have no Relation to bind a view to
(§4). C1, C10, C12, C13 need blocks that don't exist yet (§3).

---

## 3. Block catalog

The visual palette. `●` built, `○` proposed. "Binds to" = which Entities/Relations a
block can be attached to (drives what the Tutor can do with it).

| Block | Renders | Binds to | Strong at | Weak at |
|---|---|---|---|---|
| ● **Fretboard (windowed)** | notes of a scale/chord on an N-fret slice | scale, compare, chord, voicing, transition | "where is this, near here" | whole-neck picture, octaves |
| ○ **Fretboard (full neck)** | same, frets 0–15+, horizontal scroll, optional region tint | same | C10, C13, seeing a scale *pattern* | detail density, small screens |
| ● **Chord diagram (static)** | one voicing | voicing, chord, transition | quick read of a shape | motion, why |
| ○ **Chord diagram (editable)** | click a fret to add/move/mute a finger | voicing | C11 without dropdowns | — |
| ● **Degree strip** | one scale's notes as 1..7 | scale, compare | C2, C5 (chord tones as 1–3–5) | two-way comparison |
| ○ **Degree-comparison strip** | two scales/chords stacked per degree, diffs lit | compare, + a new "subset/mode" relation | C3, C4, major↔minor at a glance | 3+ things |
| ● **Circle of fifths** | 12 keys on a wheel, home + neighbours | key | C8, "which chords sit near home" | C7 "why *this* chord resolves" |
| ○ **Key-family strip** | the 7 diatonic chords I..vii°, qualities marked | a new Key→chords relation (§4) | C6, feeds C12 | non-diatonic music |
| ○ **Movement diagram** | two shapes side by side + per-string arrows | transition | C7, C11 per-finger motion | 3+ chords |
| ○ **Loop timeline** | chords as bars on a repeating strip, play-loops | progression | C12 phrase feel, rhythm | analysis |
| ● **Progression chord cards** | chords + roman numerals + a diagram each | key, progression | listing, roman numerals | the loop feel |
| ○ **Interval ruler** | a semitone strip; pick two notes, see the interval | any two notes (Inspection) | C1 | chords, position |
| ○ **Piano/keyboard strip** | notes on keys | scale, chord | C5 stacking, non-guitar intuition | it's a guitar app — sparing |

Notes:
- **"Fretboard"** is really 3 blocks collapsed into one today; a full-neck, tint-capable
  fretboard subsumes the proposed windowed + zoned + CAGED-neck ideas.
- **Hear** is not a block — it's a verb (§6) attached to almost every block.
- New blocks should each render a *range* of bindings, not one hard-coded case — that's
  what keeps them composable.

---

## 4. Model bindings the Tutor needs

A Block can only be placed against an Entity or a Relation. So the set of Relations
directly limits what the Tutor can compose.

### Current
`Compare` (scale↔scale, chord↔chord) · `Transition` (voicing↔voicing + key).

### Gaps (recommended additions, in priority order)

| Add | Unlocks | Example |
|---|---|---|
| **Key → diatonic chords** (a derived set, or a `Diatonic` relation) | C6 "chords in a scale" — an explore area the owner named with **zero** current coverage; feeds progressions and the circle | "the 7 chords of G major" |
| **Fits-over** (scale ↔ key / chord / progression) | C14 "what do I play over this" — pairs directly with "discover progressions" | "A minor pentatonic over Am–F–C–G" |
| **Subset / parent** (scale ↔ scale) | C3 "same notes, new home"; C4 pentatonic-as-subset | "A minor pentatonic ⊂ A natural minor" |

`Diatonic` and `Fits-over` are the two that expand the Tutor's reach into the areas the
owner cares most about. `Subset/parent` is nice-to-have.

Also worth doing: widen `Chord` beyond major/minor (the theory engine already has 7ths
and sus in `CHORD_INTERVALS`) so C5 can actually be explored.

---

## 5. Insight notes (proposed capability)

A short, Tutor-authored (or learner-authored) note **anchored to a Block, or to a
position inside one**, rendered as a small callout rather than buried prose.

- **Anchor:** a block id, optionally + a target inside it (a fret position, a scale
  degree, a chord step, a circle node).
- **Author:** `tutor` | `learner`.
- **Lifecycle:** persists with the Working Draft; learner can dismiss or keep; a kept
  note survives Tutor changes the way a kept voicing does.
- **Why:** replaces the "String-by-string movement" / "How the fingers move" disclosure
  dumps with contextual, on-the-diagram explanation the Tutor writes for *this* state.

Rough shape:

```
InsightNote {
  id
  anchor: { block_id, target?: <fret | degree | step | node> }
  text            // one or two sentences
  author: 'tutor' | 'learner'
}
```

Open: does it live on the ConceptWorkspace (persisted, editable) or on the Tutor Turn
(ephemeral, like Tutor Focus)? Leaning **workspace** — the learner should be able to keep
a good explanation.

---

## 6. Interaction grammar

| Verb | What it does | Lives in |
|---|---|---|
| **Hear** | play the scale / chord / progression / transition | a primary button + per-block where local |
| **Inspect** | select one note / chord / region; highlight across every compatible block | the blocks |
| **Edit source** | root / mode / quality / key / tuning / chord list | the **Music bar** (one place, every flow) |
| **Edit selected** | change the currently-inspected chord / voicing | Music bar, contextual section |
| **Select / navigate** | pick a region, a step, a fret window | the blocks |
| **Keep / materialize** | turn a derived thing into an editable Entity | the blocks |
| **Annotate** | attach an insight note to a block or a position (§5) | Tutor mainly; learner optionally |
| **Ask Tutor** | natural-language question or change on the same state | Tutor rail |
| **Compose** | add / remove / rearrange blocks | Tutor freely; learner via a Customize affordance |

Principle: **source edits are central; everything else is local to the block.**

---

## 7. What to build (priority)

Not "a hero per concept." Expand the palette and the model so the Tutor can explain
freely.

1. **Full-neck, tint-capable fretboard.** Highest leverage: upgrades every scale/chord
   view, *is* the CAGED picture (C10), and gives C13 a home. Subsumes 3 proposed blocks.
2. **Key → diatonic chords binding + Key-family strip.** Opens "chords in a scale" (C6),
   an explore area with zero current coverage; feeds progressions.
3. **Insight notes (§5).** Cross-cutting; lets the Tutor stop dumping prose and start
   annotating the actual visuals. Pairs with everything above.
4. **Degree-comparison strip.** Cheap; fixes the major/minor entry (C3/C4).
5. **Movement diagram** + kill the 12 fret-selects (C7/C11).
6. **Loop timeline** (C12); **Fits-over** binding + chord–scale view (C14); **interval
   ruler** (C1) — as the workspace grows.

Each item is a self-contained block or model change the Tutor gains access to — none of
it prescribes a layout.

---

## 8. Decisions log

- **2026-09-05** — Not a curriculum. Explore workspace; Tutor composes; no hard-coded
  per-concept lessons or layouts. This doc reframed from "hero per concept" to "concept
  catalog + block catalog + agent free rein."
- **2026-09-05** — Circle of fifths: keep, but it is *support* for most things and only a
  lead visual for keys / how-progressions-are-built. Remove it from the D→G entry.
- **2026-09-05** — Insight notes: adopt as a capability (§5); default to workspace-persisted.
