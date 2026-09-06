# Guitar Tutor V2 — Concept & Visualization Inventory

**Status:** Working design reference / discovery draft. Not a spec.
**Purpose:** Map what learners should achieve → the concepts that get them there → the
musical objects and visual primitives that express those concepts → which primitive is
the *hero* for each concept. Everything downstream (starters, block kinds, layouts,
Tutor recipes) should trace back to this document.
**Grounded against:** `feature/workspace-ux-cleanup` at `bc2d4ad` (2026-09-05).
**Companion docs:** `guitar_tutor_v2_composable_concept_workspace_brain_dump.md` (architecture),
`guitar_tutor_v2_concept_workspace_grill_decisions.md` (decisions), `../../CONTEXT.md` (glossary).

Glossary terms are used as defined in `CONTEXT.md`: **Entity**, **Relation**, **Block**,
**Inspection**, **ConceptWorkspace**, **Tutor Focus**.

---

## 0. How to read this

Six layers, each feeding the next:

1. **Learner & outcomes** — who this is for and what they can *do* afterward. _Owned by product; open questions below._
2. **Concept units** — the teachable atoms.
3. **Musical objects & relations** — the Entities/Relations that carry a concept.
4. **Visual primitives** — the rendering vocabulary.
5. **Concept → primitive mapping** — hero vs. support, per concept.
6. **Interaction grammar** — the verbs that apply across all of it.

Layers 2–6 are seeded here from the codebase and prior analysis. Assumptions are marked
**[ASSUMPTION]**. Layer 1 is mostly **[OPEN]**.

---

## 1. Learner & outcomes

### 1.1 Who is the learner? **[OPEN]**

Candidate profiles — we should pick a primary and maybe a secondary:

| Profile | Knows | Wants |
|---|---|---|
| **A. Advanced beginner** | open chords, a couple of strum patterns, no theory | "why do these chords go together," "what do I play over this" |
| **B. Plateaued intermediate** | many chords, some scales, plays songs | the fretboard to "click" as one system; improvise; transpose on the fly |
| **C. Returning / self-taught** | scattered knowledge, gaps | fill the holes, connect what they half-know |

**[ASSUMPTION]** The four current starters (major vs minor, why D→G, CAGED, I–V–vi–IV)
target roughly **profile B** — they presume you already play chords and want the
*why* and the *whole-neck* picture. If the real target is profile A, the starters and
their entry framing need to change (more "here's a shape, here's the sound" and less
"here's a comparison relation").

### 1.2 Target outcomes **[OPEN — needs a real list]**

Draft verbs, to be confirmed/trimmed. "The learner can…"

- …hear the difference between major and minor and name the notes that change.
- …harmonize in a key: build the I–ii–iii–IV–V–vi–vii° family and know which are major/minor.
- …explain why a V chord pulls back to I (leading tone, common tone).
- …play any major/minor chord in at least 3 places on the neck using the CAGED system.
- …take a progression and transpose it to a new key without a capo.
- …pick a scale to improvise with over a given key or progression.
- …recognize the I–V–vi–IV loop and play it as a repeating phrase.
- …read a chord diagram and a fretboard diagram and map one to the other.

### 1.3 North-star **[OPEN]**

One sentence. Something like: _"A guitarist who half-knows theory opens a question,
hears and sees the answer on their own fretboard in under a minute, then pokes at it."_
Confirm or replace.

---

## 2. Concept units

Each concept: a one-line **"understands it when…"**, the primary **Entity/Relation** that
carries it, and current **coverage** (✅ built, 🟡 partial, ⬜ not yet).

| # | Concept | Understands it when… | Carrier | Coverage |
|---|---|---|---|---|
| C1 | **Intervals / half-steps** | can say two notes are "a half step / whole step / a fifth" apart | (none yet — implicit in every view) | 🟡 shown as fret distance, never named as a primitive |
| C2 | **The major scale** | can spell a major scale from any root and number its degrees 1–7 | `Scale` | ✅ `degree_strip`, `fretboard` |
| C3 | **Minor & the modes** | knows minor = ♭3 ♭6 ♭7 vs major; knows a mode is the same notes from a new "home" | `Scale`, `Compare` | 🟡 comparison works; "same notes, new home" is never shown |
| C4 | **Pentatonic / blues** | knows these are the major/minor scale with notes removed (and blues adds ♭5) | `Scale` (modes `pentatonic_*`, `blues`) | 🟡 exist as modes; the "subset of" relationship is invisible |
| C5 | **Chord construction (triads, 7ths)** | can build a chord as stacked 3rds: 1–3–5, 1–♭3–5, +7 | `Chord` | 🟡 chord tones shown; the "stack of 3rds" idea isn't |
| C6 | **Diatonic harmony (the key family)** | can name the 7 chords in a key and which are major/minor/dim | `Key` → derived chords | 🟡 roman numerals appear in the progression; no "here's the whole family" view |
| C7 | **Function & cadence (why chords move)** | can explain tension→resolution: V→I, the leading tone, common tones | `Transition` | 🟡 movement is computed; buried in prose |
| C8 | **Keys & the circle of fifths** | knows which keys are "close," relative major/minor, sharps/flats | `Key` | ✅ `circle` block |
| C9 | **Transposition** | can move a progression to a new key and know it's the *same music* higher/lower | `Progression` (transpose action) | ✅ transpose action; "same music, shifted" not visualized |
| C10 | **The CAGED system** | can find one chord in 5 shapes up the neck and see how they overlap/chain | `Chord` (caged) | 🟡 regions + adjacency exist; "all 5 at once across the neck" not shown |
| C11 | **Voicings & voice-leading** | knows one chord has many shapes; can pick smooth motion between two chords | `Voicing`, `Transition` | 🟡 diagrams + movement exist; per-finger motion is prose |
| C12 | **Progressions as phrases** | hears 4 chords as a repeating loop, not a list; recognizes common loops | `Progression` | 🟡 chord cards exist; loop/repetition/rhythm absent |
| C13 | **The fretboard as one system** | can locate any note, sees octaves and shapes tiling the neck | `Scale`/`Chord` on `fretboard` | 🟡 windowed fretboard only; no octave/tiling story |
| C14 | **Chord–scale fit (what to play over what)** | can pick a scale that fits a chord or key for improvising | `Scale` + `Key`/`Chord` (no Relation yet) | ⬜ no Relation, no view |

**Gaps worth noting:** C1 (intervals as a first-class thing), C6 (the key family as a
view), C14 (chord–scale fit) have no home in the current model.

---

## 3. Musical objects & relations

### 3.1 Entities (current)

`Scale` · `Key` · `Chord` · `Voicing` · `Progression` — plus `NoteGroup` reserved in the
glossary but not implemented.

Backed by the theory engine: 13 scale modes (`SCALE_INTERVALS`), chord qualities
major / minor / (7ths, sus in `CHORD_INTERVALS` but ConceptWorkspace `Chord` is
restricted to major/minor), CAGED positions for major & minor.

### 3.2 Relations (current)

`Compare` (two Scales, or Chord vs Chord) · `Transition` (two Voicings + a Key).

### 3.3 Relations we're missing **[ASSUMPTION — flag for domain modeling]**

| Proposed Relation | Concept it unlocks | Example |
|---|---|---|
| **Contains** / `subset-of` | C4 pentatonic-as-subset, C3 mode-shares-notes | "A minor pentatonic ⊂ A natural minor" |
| **Diatonic-to** (Key → its 7 Chords) | C6 the key family | "these 7 chords belong to G major" |
| **Mode-of** (Scale → parent Scale) | C3 "same notes, new home" | "D dorian is C major from D" |
| **Fits-over** (Scale ↔ Key/Chord/Progression) | C14 what-to-play-over | "A minor pentatonic fits over an Am–F–C–G loop" |

Whether these become real Relations or stay derived facts is a modeling decision. The
point of listing them: today they're **implicit**, so no Block can be *bound* to them,
so the Tutor can't compose a view around them.

---

## 4. Visual primitives

The rendering vocabulary. Current **Blocks** are marked ●; proposed are ○.

| Primitive | Good at | Bad at | Status |
|---|---|---|---|
| ● **Fretboard — windowed** (`fretboard`, N-fret slice) | "where is this note near here," one position | the whole-neck picture; octaves | built |
| ○ **Fretboard — full neck** (0–15+) | C13 tiling, C10 all 5 CAGED shapes, octave shapes | detail in one spot; small screens | proposed |
| ○ **Fretboard — zoned** (colored spans over the neck) | C10 CAGED regions & their overlaps, "position playing" | precise single notes | proposed |
| ● **Chord diagram — static** (`PhysicalChordDiagram`) | one voicing, quick read | motion between chords; why | built |
| ○ **Chord diagram — editable** (click a fret to move a finger) | C11 voicing tweaks without dropdowns | — | proposed (replaces the 12-select editor) |
| ● **Degree strip** (`degree_strip`, one scale's 1..7) | C2 numbering a scale | comparison (needs two, side by side) | built |
| ○ **Degree-comparison strip** (two scales stacked per degree) | C3/C4 "these 3 notes change," major↔minor | more than 2 scales | proposed |
| ● **Circle of fifths** (`circle`) | C8 key distance, relative maj/min | C7 *why one specific chord resolves* | built |
| ○ **Key-family view** (the 7 diatonic chords in a row, I..vii°) | C6 harmonize a key at a glance | non-diatonic music | proposed |
| ○ **Movement / voice-leading diagram** (two shapes + per-string arrows) | C7/C11 "F# pulls up to G, D stays" | more than 2 chords at once | proposed (the D→G hero) |
| ○ **Loop / bar timeline** (chords as bars that visibly repeat) | C12 progression-as-phrase, rhythm | harmonic analysis | proposed (the I–V–vi–IV hero) |
| ○ **Interval ruler** (semitone strip; distance between two notes) | C1 naming intervals | chords, position | proposed |
| ● **Progression chord cards** (`progression`) | listing chords + roman numerals + a diagram each | the *loop* feeling | built |
| ○ **Piano/keyboard strip** | C5 stacked-3rds, C1 intervals for non-guitar intuition | it's a guitar app — use sparingly | maybe |

Notes:
- The **fretboard** is really 3 primitives (windowed / full / zoned) that today are collapsed into one.
- "Hear" is not a primitive but is attached to almost every one (see §6).

---

## 5. Concept → primitive mapping

**Hero** = the single visual that answers the question. **Support** = available, demoted
or collapsed by default. This table is the rule set that replaces per-flow judgement calls.

| Concept | Hero | Support | Not this |
|---|---|---|---|
| C1 Intervals | Interval ruler | windowed fretboard | circle |
| C2 Major scale | Degree strip | full-neck fretboard | — |
| C3 Minor & modes | **Degree-comparison strip** | full-neck fretboard (changed notes only), "same notes new home" callout | full chromatic fretboard dump |
| C4 Pentatonic/blues | Degree-comparison strip (vs parent scale) | zoned fretboard | — |
| C5 Chord construction | Degree strip (chord tones as 1–3–5) | chord diagram, keyboard strip | — |
| C6 Diatonic harmony | **Key-family view** | circle (relative min), progression | — |
| C7 Function & cadence | **Movement / voice-leading diagram** | key-family view (small), Hear | **circle of fifths as a peer panel** |
| C8 Keys / circle | Circle of fifths | key-family view | fretboard |
| C9 Transposition | Loop timeline with a before/after key marker | chord diagrams | — |
| C10 CAGED | **Full/zoned neck, all 5 shapes** | two adjacent chord diagrams, movement list (both on demand) | 0–5 windowed fretboard |
| C11 Voicings / voice-leading | Movement diagram | editable chord diagrams | 12 fret-selects |
| C12 Progressions as phrases | **Loop / bar timeline** | chord cards, roman numerals | — |
| C13 Fretboard system | Full neck | windowed fretboard for detail | — |
| C14 Chord–scale fit | Full neck (scale) + chord tones highlighted | Hear over the loop | — |

### 5.1 Applying this to the four starters

| Starter | Question | Concepts | Hero today | Hero it should have |
|---|---|---|---|---|
| scale-comparison | major vs minor | C3 | windowed fretboard (span 8) | degree-comparison strip |
| physical-resolution | why D→G | C7, C11 | chord diagrams + **circle (wrong)** | voice-leading movement diagram |
| caged-exploration | one chord across the neck | C10 | CAGED text panel + 2-shape fretboard | full/zoned neck, all 5 |
| four-chord-progression | 4 chords → a song | C12, C6 | chord cards | loop timeline |

Every starter also gets the same shell: **hook** (question + Hear + one-line answer) →
**hero** → **support (collapsed)** → Music bar + Tutor. "Add view" / "Remove view"
becomes a **Customize** affordance, not default chrome.

---

## 6. Interaction grammar

The verbs, and where each lives after the Music-bar consolidation (`bc2d4ad`).

| Verb | What it does | Lives in |
|---|---|---|
| **Hear** | play the scale / chord / progression / transition | hook (primary), plus per-support-view where local |
| **Inspect** | select one note/chord/region; highlight it across every compatible view | the views (click a note/card/zone) |
| **Edit source** | change root / mode / quality / key / tuning / chord | **Music bar** (one place, every flow) |
| **Edit selected** | change the currently-inspected chord/voicing | Music bar, contextual "Chord N…" section |
| **Select / navigate** | pick a CAGED region, a progression step, a fret window | the views |
| **Keep / materialize** | turn a derived thing into an editable Entity (CAGED "Keep voicing", progression "Work with these chords") | the views (it's an action on what you're looking at) |
| **Ask Tutor** | natural-language question or change request on the same state | Tutor rail |
| **Customize layout** | add/remove/rearrange support views | behind a Customize toggle (proposed) |

Principle: **source edits are central, everything else is local.** A control changes the
workspace's music → Music bar. A control changes what you're looking at or how → stays in
the view.

---

## 7. Open questions (blocking a real spec)

1. **Primary learner profile** (§1.1) — A, B, or C?
2. **The outcome list** (§1.2) — confirm/trim; this sets scope.
3. **Curriculum breadth** — is this "the 4 starters + scale explorations," or a fuller
   path through C1–C14? Determines how many heroes we build.
4. **New Relations** (§3.3) — do Contains / Diatonic-to / Mode-of / Fits-over become
   real Relations (Tutor-composable) or stay derived facts?
5. **Circle of fifths' role** — demote it out of D→G; is it the hero for a *new* "keys"
   starter, or only ever support?
6. **Hero blocks vs. composability** — are the heroes new `Block` kinds the preset places
   as primary (stays ADR-0001-composable), or is the first-run lesson explicitly curated
   and outside the block model?

---

## 8. Suggested build order (once §7 is answered)

1. Degree-comparison strip → retrofit scale-comparison. Cheapest; proves the hook→hero→support shell.
2. Voice-leading movement diagram → retrofit physical-resolution; remove circle from that flow; kill the 12 fret-selects.
3. Loop / bar timeline → retrofit four-chord-progression.
4. Full/zoned neck → retrofit caged-exploration.
5. Key-family view + a "harmonize a key" starter (new).
6. Interval ruler + chord-scale-fit (C1, C14) if the curriculum goes that wide.
