# Guitar Tutor V2 — Composable Concept Workspace / Musical Entity Architecture Brain Dump

**Status:** Working design reference, not a final implementation spec  
**Purpose:** Preserve the product/architecture thinking from the current discussion so it can be refined into a later spec/ticket set without losing context.  
**Grounded against:** `davidxmontes/guitar-tutor` `main-v2` at commit `8c4a24b70b7253bc69c633b21fc3720649de2379` (2026-09-05)  
**Current V2 source areas reviewed:**  
- `frontend/src/v2/ConceptStudy.tsx`
- `frontend/src/v2/CircleStudy.tsx`
- `frontend/src/v2/CagedStudy.tsx`
- `frontend/src/v2/PhysicalChordDiagram.tsx`
- `frontend/src/v2/TutorChat.tsx`
- `frontend/src/v2/SongStudy.tsx`
- `frontend/src/types/v2.ts`
- `backend/app/v2/concepts.py`
- `backend/app/v2/tutor/*`
- V2 parent spec issue `#10` and later Study/visualization tickets

> **Decision update (2026-09-05):** This brain dump preserves exploratory thinking, but its candidate, audition, Keep, and Dismiss workflow is superseded. Tutor workspace changes now apply directly and atomically. Every applied Tutor mutation captures the exact pre-change state for one-click undo, while turn history supports preview and restore. The grill decision record and product spec are authoritative.

---

## 0. Why this document exists

V2 has moved beyond the original roadmap. The current branch already contains the artifact/session/branch foundation, SongStudy, ConceptStudy families, Tutor, practice, progression workspaces, cross-branch comparison, guide playback, My Stuff, and the V2-default switch.

The immediate product observation is:

- **SongStudy is mostly working as a product model.** It still needs layout refinement, but its learning flow is coherent.
- **ConceptStudy / Study is the weaker part.** The current implementation is feature-rich, but the entry experience and presentation still feel like a music-theory catalog or checklist rather than an exploratory guitar-learning environment.
- The current ConceptStudy architecture also couples the **musical subject**, **comparison state**, **visualization family**, and **view state** together in one payload. That was appropriate for fixed pages, but becomes limiting if the Tutor should creatively compose several reusable visual blocks in response to a question.

The new idea is to evolve ConceptStudy into an **AI-composed visual workspace made from trusted musical blocks**.

The Tutor should be able to choose:

1. **what musical entities are relevant,**
2. **what relationships between them matter,**
3. **which trusted visualization blocks best explain those relationships,**
4. **how important each block is in the workspace composition,**
5. and **what data/view state each block should use.**

The user can then manipulate those same entities and view parameters manually through dropdowns, buttons, ranges, selections, etc. Manual changes and Tutor changes operate on the **same workspace state**.

Good workspace compositions can later become reusable **recipes/templates**, so the system can learn from successful visual arrangements without hard-coding one page per theory concept.

The goal is **not** to let an LLM generate React, HTML, CSS, or arbitrary interfaces.

The goal is:

> **React owns trusted components and responsive rendering.  
> The application owns musical truth.  
> The Tutor composes and focuses those pieces semantically.**

---

# 1. Current V2 context we should preserve

This design is an evolution of a working V2, not a reboot.

## 1.1 V2 is already the primary product path

As of the reviewed `main-v2` head, V2 is the default with Classic as an explicit fallback.

That means this design should be introduced incrementally and should not destabilize the whole application shell.

## 1.2 The Tutor architecture is already in a good place

The V2 Tutor is already implemented as a **stateless-per-run** agent:

- persisted Branch/application messages are loaded,
- current artifact/selection/focus is loaded,
- stable instructions/tools are rebuilt,
- a fresh model + agent is constructed for the request,
- the tool loop runs,
- semantic output + usage are persisted,
- the runtime is discarded.

No provider thread or LangGraph checkpoint is required as conversation memory.

This architecture should remain.

The proposed Concept workspace would add another typed semantic output surface to the Tutor; it does **not** require changing the stateless agent principle.

## 1.3 SongStudy is substantially implemented

The current SongStudy already contains useful product structure:

- raw full-track loading,
- section-aware overview,
- focused tab window,
- beat/range selection,
- tuning-aware fretboard synchronization,
- physical chord/shape extraction,
- enrichment,
- Tutor,
- practice,
- guide playback,
- full-tab mode.

The user’s current judgment is that SongStudy is **almost there** and mostly needs better spatial hierarchy/layout.

Therefore:

> **Do not redesign SongStudy around the new generic Concept workspace just because the new abstraction exists.**

SongStudy should remain an opinionated temporal learning workspace.

## 1.4 ConceptStudy currently bundles too much together

The current ConceptStudy model is a discriminated union roughly shaped around:

- scale visualization,
- interval visualization,
- chord visualization,
- CAGED visualization,
- Circle visualization.

The payloads contain both music and presentation selections, e.g.:

- `root`
- `concept_id`
- `positions`
- `fret_start`
- `fret_end`
- `overlay`
- `comparison_id`
- `comparison_quality`
- `selected_voicing`
- `selected_region`
- `comparison_region`
- `selected_chord`
- `selected_sequence`
- `visualization`

The frontend then has a `Visualization(...)` switch that picks a mostly fixed composition for each visualization family.

This is exactly the pressure point for the new approach.

---

# 2. Product direction

## 2.1 The key product shift

Current Study communicates something like:

> Here is the catalog of theory concepts. Pick one.

The desired experience is closer to:

> What are you curious about?  
> What relationship do you want to understand?  
> Let’s build the right visual workspace for that question.

This should feel like **exploration**, not a syllabus.

Examples:

- “Why does D resolve to G?”
- “What changes between G major and G minor?”
- “How do these CAGED shapes connect?”
- “Show me the minor pentatonic around this position.”
- “Why does Mixolydian sound different from major?”
- “Give me three ways to voice this chord and show the movement.”
- “Show me the chord tones inside this scale.”
- “How is this idea different from the progression I made earlier?”

Those questions should not all open the same fixed page.

They should be able to produce different compositions from the same reusable block vocabulary.

## 2.2 Not chat-first

This is **not** a proposal for “everything is chat and visualizations appear inside messages.”

Small previews/candidates can appear in Tutor messages, but rich learning should live in a persistent visual workspace.

Mental model:

> **“I am exploring this musical idea.”**

not:

> “I am having a conversation about this musical idea.”

Tutor is a guide and composer of the workspace, not the only container for it.

## 2.3 Artifact-first remains valid

The original artifact model is still useful:

- SongStudy
- Progression
- ConceptStudy
- Exercise

The change is primarily what **ConceptStudy contains**.

Instead of “ConceptStudy = one predefined visualization payload,” ConceptStudy can evolve toward:

> **ConceptStudy = a saved exploration containing musical entities, relationships, and a semantic composition of reusable views.**

---

# 3. The architecture: separate six concerns

The most important design decision is to stop mixing all these concerns together.

We should distinguish:

1. **Artifact**
2. **Musical Entity**
3. **Relation**
4. **Projection**
5. **Block**
6. **Workspace Composition**

Conceptually:

```text
ConceptStudy Artifact
        │
        ▼
┌──────────────────────────────┐
│       Concept Workspace      │
│                              │
│  entities                    │
│  relations                   │
│  blocks                      │
│  semantic composition        │
└──────────────┬───────────────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
 Musical Entities    Relations
      │                 │
      └────────┬────────┘
               ▼
          Projections
               │
    ┌──────────┼───────────┐
    ▼          ▼           ▼
 Fretboard   Circle     Diagrams ...
    │          │           │
    └──────────┴───────────┘
               ▼
          React blocks
```

Each layer should have one job.

---

# 4. Artifact vs entity

## 4.1 Artifacts are durable user work

Artifacts remain the app-level things users save and reopen:

```ts
type ArtifactKind =
  | "song_study"
  | "progression"
  | "concept_study"
  | "exercise";
```

An artifact owns durable product state and revision/provenance behavior.

## 4.2 Entities are musical things inside an exploration

Entities are not necessarily independently saved database objects.

For the first implementation, they should usually be **local typed objects inside the ConceptStudy payload**.

Do **not** create a generic global entity database or graph table.

That would violate the spirit of the current V2 architecture and introduce complexity without a proven need.

Recommended initial concept:

```ts
type MusicEntity =
  | KeyEntity
  | ScaleEntity
  | IntervalEntity
  | ChordEntity
  | VoicingEntity
  | NoteGroupEntity;
```

Potential later additions only when earned:

```ts
| ProgressionSnapshotEntity
| SongRangeSnapshotEntity
```

The exact set should remain small.

---

# 5. Recommended entity types

## 5.1 KeyEntity

Represents harmonic context.

```ts
interface KeyEntity {
  id: EntityId;
  kind: "key";

  tonic: PitchClass;
  mode: "major" | "minor";
}
```

Derived deterministically:

- key signature / accidentals,
- relative major/minor,
- diatonic chords,
- neighboring fifths,
- I / IV / V,
- pitch collection.

A Circle of Fifths is **not** an entity.

It is a view of `KeyEntity`.

---

## 5.2 ScaleEntity

Represents a pitch collection with a root + scale system.

```ts
interface ScaleEntity {
  id: EntityId;
  kind: "scale";

  root: PitchClass;

  scaleType:
    | "major"
    | "natural_minor"
    | "dorian"
    | "phrygian"
    | "lydian"
    | "mixolydian"
    | "locrian"
    | "harmonic_minor"
    | "melodic_minor"
    | "pentatonic_major"
    | "pentatonic_minor"
    | "blues";
}
```

Do not make “Ionian page,” “Dorian page,” etc. separate UI concepts.

They are different ScaleEntity data.

---

## 5.3 IntervalEntity

Useful for current Intervals Study.

```ts
interface IntervalEntity {
  id: EntityId;
  kind: "interval";

  root: PitchClass;
  semitones: number; // 0..11
}
```

Example:

```text
A → E
perfect fifth
7 semitones
```

This can feed:

- fretboard,
- interval label,
- sound,
- comparison,
- drills.

---

## 5.4 ChordEntity

Represents abstract harmony, not a physical fingering.

```ts
interface ChordEntity {
  id: EntityId;
  kind: "chord";

  root: PitchClass;
  quality: ChordQuality;
}
```

Example:

```text
D7
```

Derived:

- chord tones,
- intervals,
- conventional name,
- optional catalog voicings.

Important distinction:

> **Chord != Voicing.**

---

## 5.5 VoicingEntity

Represents one exact physical realization.

```ts
interface VoicingEntity {
  id: EntityId;
  kind: "voicing";

  chordRef?: EntityRef<"chord">;

  tuning: MidiPitch[] | PitchClass[];

  positions: Array<{
    string: number;
    fret: number;
  }>;

  barre?: {
    fret: number;
    fromString: number;
    toString: number;
  } | null;

  fingering?: Array<{
    string: number;
    fret: number;
    finger: string | number;
    provenance: "source" | "suggested";
  }>;

  provenance?: {
    type: "catalog" | "agent" | "user" | "song" | "caged";
    label?: string;
  };
}
```

Physical positions + tuning are authoritative.

A Voicing may exist even if its chord name is uncertain.

This preserves the product principle that creative physical ideas should not require a canonical DB match.

---

## 5.6 NoteGroupEntity

This is the creative escape hatch.

```ts
interface NoteGroupEntity {
  id: EntityId;
  kind: "note_group";

  tuning?: MidiPitch[];

  pitches?: PitchClass[];

  positions?: Array<{
    string: number;
    fret: number;
  }>;

  label?: string;

  semanticKind?:
    | "shape"
    | "caged_region"
    | "target_notes"
    | "phrase_shape"
    | "custom";
}
```

This supports things that do not deserve a dedicated theory type:

- an arbitrary Tutor highlight,
- a two-note grip,
- CAGED region coverage,
- a riff shape,
- a note cluster,
- a custom arpeggio shape,
- a target-note pattern.

This is important for keeping the agent creative without exploding the type system.

---

# 6. What should NOT be entities

Avoid turning every piece of application state into an entity.

Usually not entities:

- song measure,
- tab beat,
- ChordPro line,
- Tutor message,
- branch,
- session,
- playhead,
- scroll position,
- panel size,
- zoom,
- song-map section,
- exercise metronome state.

The entity model is for **musical objects worth rendering/relating in multiple ways**.

---

# 7. CAGED is not an entity

This deserves explicit treatment.

“CAGED” is a system/view framework.

An A-major CAGED exploration could be represented by:

```text
ChordEntity: A major

NoteGroupEntity: C-shape region
NoteGroupEntity: A-shape region
NoteGroupEntity: G-shape region
NoteGroupEntity: E-shape region
NoteGroupEntity: D-shape region
```

Each region carries exact positions + semantic metadata.

Then a CAGED workspace can compare two regions using normal relation/projection machinery.

This avoids creating a special universe where CAGED has its own custom comparison model.

---

# 8. Relations are first-class

The next critical abstraction is **relationship between entities**.

Today comparison is embedded differently into Scale, Chord, and CAGED payloads.

That makes comparison a special case in each visualization family.

Instead, comparison should become an explicit relation.

Recommended initial relation set:

```ts
type MusicRelation =
  | CompareRelation
  | TransitionRelation
  | InContextRelation;
```

Keep this small.

Do not build a general theory graph.

---

## 8.1 CompareRelation

```ts
interface CompareRelation {
  id: RelationId;
  kind: "compare";

  left: EntityRef;
  right: EntityRef;
}
```

Examples:

```text
G major ↔ G natural minor
G Ionian ↔ G Mixolydian
A minor pentatonic ↔ A blues
G major chord ↔ G minor chord
Voicing A ↔ Voicing B
CAGED C-region ↔ A-region
```

The relation itself does not decide how to render the comparison.

---

## 8.2 TransitionRelation

Useful for time/movement/voice-leading.

```ts
interface TransitionRelation {
  id: RelationId;
  kind: "transition";

  from: EntityRef;
  to: EntityRef;

  context?: EntityRef<"key">;
}
```

Examples:

```text
D → G in G major
Bm9 voicing → Gmaj7 voicing
CAGED C-region → A-region
```

This can feed:

- fretboard movement,
- shared notes,
- chord diagrams,
- “what changes?”,
- practice drill,
- audio.

---

## 8.3 InContextRelation

Useful when one entity is understood inside another.

```ts
interface InContextRelation {
  id: RelationId;
  kind: "in_context";

  subject: EntityRef;
  context: EntityRef;
}
```

Examples:

```text
D chord in G major
Em in G major
G Mixolydian over G7
```

This avoids forcing everything into “comparison.”

---

# 9. Why comparison cannot be a single component

Given:

```text
Compare(G major, G minor)
```

the same relation can produce several useful projections:

### Degree comparison

```text
shared:
1, 2, 4, 5

changed:
3  → b3
6  → b6
7  → b7
```

### Fretboard comparison

```text
shared positions
major-only positions
minor-only positions
```

### Harmonic comparison

```text
G  → Gm
Am → Adim
Bm → Bb
...
```

### Audio comparison

```text
play major
play minor
play only changed notes
```

Same relationship.

Different views.

This is the reason the relation should not be owned by one React component.

---

# 10. Projections are the key reuse layer

A Projection converts an Entity or Relation into the normalized data a visual block expects.

Conceptually:

```ts
projectToFretboard(
  source: Entity | Relation,
  options: FretboardProjectionOptions
): FretboardViewModel
```

The React block should not need to know whether its notes came from:

- a scale,
- a chord,
- a voicing,
- a NoteGroup,
- a CAGED region,
- a scale comparison,
- a voicing transition,
- a Tutor-created shape.

It just renders a FretboardViewModel.

---

# 11. Generic fretboard view model

A useful common contract:

```ts
interface FretboardViewModel {
  tuning: Tuning;

  fretRange: {
    start: number;
    end: number;
  };

  groups: Array<{
    id: string;
    label?: string;

    role:
      | "primary"
      | "comparison"
      | "shared"
      | "changed"
      | "context"
      | "current"
      | "upcoming"
      | "candidate"
      | "target"
      | "tutor_focus";

    positions: Array<{
      string: number;
      fret: number;

      note?: string;
      interval?: string;
    }>;
  }>;
}
```

Then:

```text
ScaleEntity
  ↓ projectScaleToFretboard
FretboardViewModel
  ↓
FretboardBlock
```

```text
Compare(Scale, Scale)
  ↓ projectScaleComparisonToFretboard
FretboardViewModel
  ↓
FretboardBlock
```

```text
Transition(Voicing, Voicing)
  ↓ projectVoicingTransitionToFretboard
FretboardViewModel
  ↓
FretboardBlock
```

That is true component reuse.

---

# 12. Existing fretboard duplication

Current V2 has several similar fretboard implementations:

- `ConceptFretboard`
- `CagedNeck`
- `SongStudyFretboard`

They all render:

- tuning,
- string/fret grid,
- semantic groups,
- focus/comparison states.

Long-term, this is an earned extraction opportunity.

Recommended future shared leaf:

```tsx
<Fretboard
  tuning={viewModel.tuning}
  fretRange={viewModel.fretRange}
  groups={viewModel.groups}
/>
```

But:

> **Do not make SongStudy depend on the new Concept entity storage model.**

SongStudy can keep its own data and use an adapter:

```text
Tab beat / selection
  ↓ song projection adapter
FretboardViewModel
  ↓
shared Fretboard
```

ConceptStudy:

```text
Entity / Relation
  ↓ concept projection
FretboardViewModel
  ↓
shared Fretboard
```

Shared renderer, separate domain models.

---

# 13. Chord diagrams follow the same rule

`PhysicalChordDiagram` is already close to the ideal reusable leaf.

It should remain dumb:

```text
exact positions
tuning
optional barre
optional fingering
optional label
```

It should not:

- resolve a chord,
- fetch data,
- call Tutor,
- save artifacts,
- know about SongStudy/ConceptStudy/Progression.

Higher-level blocks can use it:

```text
ChordDiagramBlock
ChordDiagramGroupBlock
VoicingComparisonBlock
```

Those blocks consume projected data and render one or many `PhysicalChordDiagram`s.

---

# 14. Circle of Fifths should become a block

Current `CircleStudy` is a useful working component but currently bundles:

- wheel,
- key signature,
- diatonic chords,
- selected chord tones,
- reference chord diagram,
- common movements,
- selected sequence.

That was reasonable for a fixed Circle page.

In the composable world, the “Circle” itself is one block:

```ts
interface CircleBlockSpec {
  type: "circle";
  source: EntityRef<"key">;

  view: {
    showRelativeMinor?: boolean;
    showNeighbors?: boolean;
    emphasize?: EntityRef[];
  };
}
```

Other information can become other blocks:

- ChordFamilyBlock
- ChordDiagramBlock
- ProgressionStripBlock
- InsightBlock
- FretboardBlock

A “why does D resolve to G?” workspace might choose only:

```text
Circle
Fretboard
Chord diagrams
Insight
```

No need to show every CircleStudy sub-section.

---

# 15. Blocks

A Block is a trusted React presentation surface.

It consumes a typed source reference + view settings.

Recommended initial block set:

```ts
type WorkspaceBlock =
  | FretboardBlockSpec
  | CircleBlockSpec
  | ChordDiagramBlockSpec
  | DegreeStripBlockSpec
  | ProgressionStripBlockSpec
  | InsightBlockSpec;
```

Possibly later:

```ts
| IntervalBlockSpec
| AudioBlockSpec
| PracticeBlockSpec
| TabRangeBlockSpec
```

Start small.

The point is not to build a huge plugin framework.

---

# 16. Block source model

Blocks should reference entities/relations, not copy their music.

```ts
type BlockSource =
  | { type: "entity"; id: EntityId }
  | { type: "relation"; id: RelationId };
```

Bad:

```ts
{
  type: "fretboard",
  data: {
    root: "G",
    scale: "major",
    positions: [...]
  }
}

{
  type: "circle",
  data: {
    root: "G",
    scale: "major"
  }
}
```

Now there are multiple copies of G major.

Good:

```text
Entity e1 = G major

Fretboard → e1
Circle    → e1
Chord row → e1
```

Change e1 from G major to A major and every bound block updates.

---

# 17. Three kinds of user control

This needs to be explicit in the UI architecture.

## 17.1 Entity controls

Change musical truth.

Examples:

```text
Root: G → A
Scale: Major → Dorian
Chord quality: maj7 → m7
```

All blocks bound to the entity update.

---

## 17.2 Relation controls

Change what is being related.

Examples:

```text
Compare:
G major ↔ G minor
          ↓
G major ↔ G Mixolydian
```

or:

```text
Transition:
D → G
↓
C → G
```

All blocks bound to that relation update.

---

## 17.3 View controls

Change presentation only.

Examples:

```text
Notes / intervals
Fret range
Show changed only
Show shared only
Compact / expanded
Selected comparison layer
```

Only that block changes.

---

# 18. The user and Tutor mutate the same state

This is a central product advantage.

There should not be separate “AI UI state” and “normal UI state.”

```text
        user controls
             \
              \
          Workspace state
              /
             /
           Tutor
```

Example:

User dropdown:

```ts
patchEntity("scale-1", {
  root: "A"
});
```

Tutor request:

> “Make this A Dorian instead.”

Tutor ultimately produces the same semantic mutation:

```ts
patchEntity("scale-1", {
  root: "A",
  scaleType: "dorian"
});
```

View example:

User:

```text
Fret range → 5–17
```

Tutor:

> “Zoom in around the position you’re actually using.”

Both result in:

```ts
patchBlock("fretboard-1", {
  view: {
    fretRange: [5, 17]
  }
});
```

No LLM call is needed for ordinary manual controls.

---

# 19. Agent composition contract

The Tutor should not output arbitrary component JSON blobs with raw CSS.

It should produce a validated semantic workspace patch.

Possible shape:

```ts
interface WorkspacePatch {
  operations: WorkspaceOperation[];
}

type WorkspaceOperation =
  | {
      op: "add_entity";
      entity: MusicEntity;
    }
  | {
      op: "update_entity";
      entityId: EntityId;
      patch: EntityPatch;
    }
  | {
      op: "add_relation";
      relation: MusicRelation;
    }
  | {
      op: "update_relation";
      relationId: RelationId;
      patch: RelationPatch;
    }
  | {
      op: "add_block";
      block: WorkspaceBlockSpec;
    }
  | {
      op: "update_block_view";
      blockId: BlockId;
      patch: BlockViewPatch;
    }
  | {
      op: "remove_block";
      blockId: BlockId;
    }
  | {
      op: "recompose";
      composition: WorkspaceComposition;
    };
```

All operations are structurally validated before applying.

---

# 20. Safety / mutation behavior

Preserve the existing V2 safety principle.

## The Tutor may freely do these when they are non-destructive:

- add a temporary comparison entity,
- add a temporary relation,
- add/remove/reorder visualization blocks,
- change block view state,
- set focus/highlight,
- recompose the workspace,
- create temporary candidates.

## Durable musical changes should remain intentional:

For saved/authoritative content, use the existing semantic mutation model:

```text
Tutor proposes
→ application validates
→ user accepts / explicit command is honored
→ normal artifact persistence/revision path
```

Do not let “recompose this page” accidentally rewrite saved musical content.

---

# 21. Workspace composition

This is the part where the new idea intentionally evolves the old V2 spec.

The old rule was effectively:

> Tutor does not emit layout instructions.

The refined rule should be:

> **Tutor may choose from a bounded semantic composition language, but never emits arbitrary layout/style code.**

The user’s original idea was a grid where the agent can choose where blocks go.

We should support that without exposing raw pixel geometry.

---

# 22. Recommended layout model: rows + allowed spans

Instead of:

```ts
x: 437
y: 122
width: 843
height: 301
```

use a bounded grid composition:

```ts
interface WorkspaceComposition {
  rows: Array<{
    blocks: Array<{
      blockId: BlockId;
      span: 3 | 4 | 6 | 8 | 12;
    }>;
  }>;
}
```

Example:

```ts
{
  rows: [
    {
      blocks: [
        { blockId: "circle", span: 4 },
        { blockId: "fretboard", span: 8 }
      ]
    },
    {
      blocks: [
        { blockId: "diagrams", span: 8 },
        { blockId: "insight", span: 4 }
      ]
    }
  ]
}
```

This gives the agent meaningful placement control while keeping layout deterministic.

React handles actual CSS Grid.

---

# 23. Semantic priority

Each block can also carry:

```ts
priority:
  | "primary"
  | "supporting"
  | "reference";
```

This is useful for responsive rendering.

Desktop:

```text
Circle | Fretboard (hero)
-------|------------------
Chords | Fretboard
```

Mobile can become:

```text
Fretboard
Circle
Chords
Insight
```

because React understands that Fretboard is `primary`.

The agent should not separately design iPhone CSS.

---

# 24. What ConceptStudy should persist

The composable approach changes what counts as meaningful saved state.

## Persist

- entities,
- relations,
- block types,
- block source bindings,
- meaningful block view settings,
- semantic composition,
- block order,
- allowed grid spans,
- selected voicing/region,
- notes vs intervals if it is part of the exploration,
- provenance / created-from context.

## Do not persist by default

- scroll offset,
- exact pixel width/height,
- browser viewport,
- arbitrary CSS,
- temporary hover,
- animation state,
- transient Tutor focus,
- open dropdown state,
- actual DOM geometry.

This is a refinement of the old “do not persist layout state” decision.

The distinction is:

> **Persist intentional pedagogical composition.  
> Do not persist incidental screen geometry.**

---

# 25. Proposed ConceptStudy payload direction

Something like:

```ts
interface ConceptWorkspacePayloadV2 {
  schemaVersion: 2;

  title: string;

  entities: Record<EntityId, MusicEntity>;

  relations: Record<RelationId, MusicRelation>;

  blocks: WorkspaceBlockSpec[];

  composition: WorkspaceComposition;

  createdFrom?: {
    artifactId?: string;
    artifactKind?: ArtifactKind;
    selection?: unknown;
    note?: string;
  } | null;
}
```

This should remain typed JSON inside the existing Artifact storage strategy.

Again:

> **No global entity database is required.**

---

# 26. Templates / recipes

The user’s idea of saving successful layouts is powerful, but templates should store **composition**, not musical data.

A recipe says:

> “Here is a useful way to explain two comparable scales.”

It does not say:

> “Here is G major and G minor.”

---

## 26.1 Example: Compare two concepts

```ts
interface WorkspaceRecipe {
  id: "compare-two-scales";

  slots: {
    left: {
      accepts: ["scale"];
    };

    right: {
      accepts: ["scale"];
    };
  };

  relations: [
    {
      id: "comparison";
      kind: "compare";
      left: "$left";
      right: "$right";
    }
  ];

  blocks: [
    {
      id: "left-summary";
      type: "degree_strip";
      source: "$left";
    },
    {
      id: "right-summary";
      type: "degree_strip";
      source: "$right";
    },
    {
      id: "fretboard";
      type: "fretboard";
      source: "$comparison";
      priority: "primary";
    }
  ];
}
```

Instantiate with:

```text
G major / G minor
```

or:

```text
G Ionian / G Mixolydian
```

or:

```text
A minor pentatonic / A blues
```

---

## 26.2 Example: Understand a movement

Slots:

```text
from
to
optional harmonic context
```

Blocks:

```text
context block
fretboard transition
two chord diagrams
what-changes insight
practice action
```

Works for:

```text
D → G
G → C
Bm9 → Gmaj7
CAGED region A → G
```

---

# 27. Templates should not become rigid page types

Avoid:

```text
if scale:
  ScaleTemplate

if chord:
  ChordTemplate

if caged:
  CagedTemplate
```

That simply recreates fixed pages.

Instead:

- recipes are suggestions,
- Tutor can instantiate one,
- Tutor can omit irrelevant blocks,
- Tutor can change spans/order,
- Tutor can compose directly from blocks when no recipe fits.

Recipes encode useful teaching patterns, not the full creative ceiling.

---

# 28. Initial template persistence recommendation

Do not introduce a fifth ArtifactKind for templates.

Suggested progression:

### First
System-defined recipes in code/data.

### Then, if valuable
Allow a user to “Save this layout as a template” into a lightweight template/preferences table or workspace-template store.

This is not musical content and should not automatically appear as a ConceptStudy artifact.

Defer until users actually want to reuse layouts.

---

# 29. Block registry

A small typed registry is useful.

Not a plugin system.

Example:

```ts
const blockRegistry = {
  fretboard: {
    acceptsEntities: [
      "scale",
      "interval",
      "chord",
      "voicing",
      "note_group"
    ],

    acceptsRelations: [
      "compare",
      "transition",
      "in_context"
    ]
  },

  chord_diagrams: {
    acceptsEntities: [
      "chord",
      "voicing"
    ],

    acceptsRelations: [
      "compare",
      "transition"
    ]
  },

  circle: {
    acceptsEntities: ["key"],
    acceptsRelations: []
  },

  degree_strip: {
    acceptsEntities: ["scale"],
    acceptsRelations: ["compare"]
  }
};
```

This registry is useful for:

- runtime validation,
- TypeScript narrowing,
- telling Tutor what compositions are possible,
- preventing invalid source/block combinations.

---

# 30. No arbitrary generative UI

The agent must never produce:

- React source,
- JSX,
- HTML,
- CSS,
- Tailwind classes,
- arbitrary component names,
- arbitrary JavaScript,
- raw SVG scripts,
- raw coordinates beyond validated layout options.

Agent output should be limited to trusted enumerations and typed music data.

That preserves reliability and security.

---

# 31. Frontend component philosophy

Blocks should be controlled components.

Ideal pattern:

```tsx
<FretboardBlock
  model={projection}
  view={block.view}
  onViewChange={...}
  onEntityIntent={...}
/>
```

A block should not:

- fetch the entire ConceptStudy itself,
- call the LLM,
- own artifact persistence,
- know about Branch navigation,
- decide what music is canonical,
- implement music-theory derivation in ad hoc UI code.

---

# 32. Backend/frontend responsibility

This needs careful separation.

## Backend / deterministic domain owns

- scale formulas,
- interval math,
- chord tones,
- key relationships,
- voicing validation,
- CAGED physical source model,
- note/string/fret → pitch,
- relation analysis requiring music correctness,
- saved artifact validation.

Current `backend/app/v2/concepts.py` already contains much of this deterministic theory logic.

Keep theory correctness there.

## Frontend owns

- workspace state orchestration,
- block registry,
- block binding,
- semantic layout,
- block view state,
- responsive rendering,
- converting normalized domain outputs into renderer-specific view models where no new theory calculation is required.

Do not duplicate theory math in TS unless intentionally moved/shared.

---

# 33. Projection API options

This is still open and should be refined.

Two plausible models:

## Option A — backend resolves rich entities; frontend projects

Backend returns normalized entities containing enough deterministic music data.

Frontend maps them into block models.

Pros:
- low UI latency after load,
- fewer endpoints,
- less backend awareness of frontend block types.

Cons:
- entity payloads can become large,
- frontend adapters can accidentally accumulate theory logic.

## Option B — backend exposes relation/projector services

Frontend asks backend for normalized deterministic projection data.

Pros:
- music logic remains centralized,
- smaller semantic entity definitions.

Cons:
- more API calls,
- backend may become coupled to visual-block vocabulary.

### Current leaning

Use a hybrid:

> **Backend owns musical derivation; frontend owns presentation projection.**

For example:

Backend ScaleEntity resolution:

```text
root
scaleType
notes
intervals
validated physical positions
```

Frontend Fretboard projector only groups/labels those existing positions.

Do not ask frontend to calculate scale theory.

---

# 34. Agent output and projectors

The Tutor should ideally reason in terms of:

```text
entities
relations
blocks
composition
```

not raw fretboard coordinates when deterministic data can resolve them.

But preserve creative freedom:

- arbitrary physical VoicingEntity is valid,
- arbitrary NoteGroupEntity is valid,
- uncertain theory naming does not block physical display.

This keeps the previous V2 rule:

> deterministic code supplies facts; model supplies creativity and pedagogy.

---

# 35. How this maps to current `main-v2`

## 35.1 `ConceptStudy.tsx`

Current role:

- catalog selection,
- root state,
- comparisons,
- selected voicing/region,
- visualization switch,
- persistence,
- Tutor.

Target evolution:

```text
ConceptStudyPicker / current fixed shell
            ↓
Explore entry + ConceptWorkspace shell
            ↓
entities / relations / blocks / composition
```

This is the primary rework target.

---

## 35.2 `ConceptFretboard`

Current role:

- renders ConceptStudy positions,
- comparison positions,
- Tutor focus.

Target:

- evolve/extract toward generic `Fretboard`,
- source-independent view model,
- keep current semantics as one adapter.

---

## 35.3 `CagedStudy`

Current role:

- selected CAGED region,
- comparison region,
- neck,
- diagrams,
- overlap summary.

Short-term:

- can remain a composite block while the workspace system is proved.

Later, if useful:

```text
CAGED resolver
→ NoteGroup/Voicing entities
→ Fretboard block
→ Diagram block
→ Overlap/Insight block
```

Do not force the decomposition on day one.

---

## 35.4 `CircleStudy`

Current role:

- wheel,
- chords,
- chord tones,
- diagram,
- movements,
- sequence.

Short-term:

- can initially be wrapped as a Circle/Harmony composite block.

Later:

- Circle wheel becomes a dedicated block,
- chord family becomes a separate block,
- progression strip becomes reusable.

---

## 35.5 `PhysicalChordDiagram`

Keep.

This is already an earned shared primitive.

---

## 35.6 `TutorChat`

Keep.

TutorChat should gain the ability to surface/apply workspace-composition responses, but the conversation/persistence system does not need to change.

---

# 36. SongStudy boundary

This is deliberately conservative.

## 36.1 Do not convert SongStudy into the Concept entity model

Do not transform:

```text
Song
Track
Measure
Beat
ChordPro line
Shape event
```

into a global entity graph.

SongStudy already has a good source-oriented structure.

Keep it.

## 36.2 SongStudy remains opinionated

Desired product shape remains roughly:

```text
Song map
Focused tab
Large fretboard
Passage shapes/harmony/practice
Tutor
```

with better layout hierarchy.

The new Concept workspace should not block that work.

## 36.3 Shared renderers are allowed

Potential future extraction:

```text
Song beat/range
  ↓ Song adapter
FretboardViewModel
  ↓
shared Fretboard
```

This is component reuse without domain migration.

---

# 37. Song → Concept bridge

A selected song range can become input to a Concept exploration without rewriting SongStudy.

Example:

```text
SongStudy selection
Little Wing m14–17
        │
        ▼
bounded SongRange snapshot/reference
        │
        ▼
ConceptStudy
```

Possible ConceptStudy:

```text
Entity:
G Mixolydian

Entity:
G major

Relation:
Compare

Created from:
Little Wing m14–17
```

The ConceptStudy stores enough snapshot/provenance to remain independently meaningful.

Avoid live dependency propagation.

---

# 38. Song → Create bridge

Same principle:

```text
Song range
  ↓ inspiration/provenance
Progression artifact
```

No need for SongStudy to become generic workspace state.

---

# 39. Cross-branch comparison

Current V2 already supports read-only cross-branch musical comparison.

That capability can later become a source for Concept workspace composition:

```text
Current branch entity
       ↕
Imported/snapshotted comparison entity
       ↕
CompareRelation
```

Important:

- do not merge conversations,
- do not create live artifact dependencies,
- keep source tuning/physical data intact.

---

# 40. Transient vs durable Concept exploration

Current Study browsing is transient until Save / Work on this.

Keep that principle.

The new workspace data can exist in three states:

## Transient Explore

Frontend/Branch working state.

No My Stuff entry.

## Working ConceptStudy

An unsaved ConceptStudy artifact/branch that can evolve.

## Saved ConceptStudy

Durable payload + revisions + semantic workspace composition.

This is compatible with current V2 artifact semantics.

---

# 41. Candidate entities

Creative Tutor output should often enter as candidate entities.

Example:

```text
Current:
G major

Tutor:
“Try this three-note upper structure.”

Candidate:
NoteGroupEntity
```

The block can show it immediately.

If user says Apply / Keep / Save:

- candidate becomes part of durable workspace/artifact state.

If dismissed:

- delete candidate.

This is cleaner than treating every Tutor idea as a special message payload.

---

# 42. Example workspace: D → G resolution

```text
Entities:
  key-g-major
  chord-d
  chord-g

Relation:
  transition-d-g
    from chord-d
    to chord-g
    context key-g-major

Blocks:
  CircleBlock(key-g-major)
  FretboardBlock(transition-d-g)
  ChordDiagramGroup(transition-d-g)
  InsightBlock(transition-d-g)

Composition:
  row 1:
    Circle 4
    Fretboard 8
  row 2:
    Chord diagrams 8
    Insight 4
```

Manual dropdown changes key G→A:

- KeyEntity changes,
- context projections update,
- if D/G chords are context-derived rather than explicitly fixed, they may be regenerated by an intentional relation/entity rule.

Be careful to distinguish independently authored chords from context-derived chords.

---

# 43. Example workspace: G major vs G minor

```text
Entities:
  scale-major
  scale-minor

Relation:
  compare-major-minor

Blocks:
  DegreeStrip(scale-major)
  DegreeStrip(scale-minor)
  Fretboard(compare-major-minor)
  ChordFamilyDiff(compare-major-minor)
  Insight(compare-major-minor)
```

Agent intentionally omits Circle because it does not directly answer the question.

That is the kind of compositional judgment we want.

---

# 44. Example workspace: CAGED connection

```text
Entities:
  chord-a-major
  region-c
  region-a

Relation:
  compare-or-transition(region-c, region-a)

Blocks:
  Fretboard(relation) PRIMARY
  ChordDiagram(region-c)
  ChordDiagram(region-a)
  Insight(relation)
```

The neck is hero.

No theory catalog list.

No Circle.

No unrelated blocks.

---

# 45. Example workspace: arbitrary creative guitar shape

Tutor:

> “Try holding the open B while sliding this dyad.”

```text
Entity:
  NoteGroupEntity {
    positions: [...]
    label: "Open-B sliding dyad"
  }

Blocks:
  Fretboard(entity)
  Insight(entity)
  PracticeBlock(entity)
```

No need to classify it as a known chord before visualization.

---

# 46. Comparison compatibility

Not every entity pair should compare the same way.

Block/projector compatibility should be typed.

Examples:

### Scale ↔ Scale

- degree diff,
- pitch diff,
- fretboard diff,
- chord-family diff (if context supports).

### Chord ↔ Chord

- tone diff,
- interval diff,
- diagram candidates,
- fretboard diff.

### Voicing ↔ Voicing

- physical movement,
- shared strings,
- fret distance,
- voice-leading,
- diagrams.

### NoteGroup ↔ NoteGroup

- shared/changed physical positions,
- pitch overlap,
- movement.

### Key ↔ Key

- accidentals,
- diatonic harmony,
- Circle context.

Cross-kind cases should use a more appropriate relation:

```text
Chord in Key → InContext
Chord tones inside Scale → InContext / containment-like future relation
```

Do not make CompareRelation infinitely polymorphic.

---

# 47. Validation

Workspace validation should cover:

## Entity validation

- known root formats,
- tuning size/range,
- valid string numbers,
- valid frets,
- one pitch per string for Voicing,
- arbitrary NoteGroups may contain more flexible position sets,
- no malformed IDs/references.

## Relation validation

- both refs exist,
- pair is supported,
- context ref exists if supplied.

## Block validation

- block type exists,
- source type supported by registry,
- view options valid,
- no arbitrary styling.

## Composition validation

- block IDs exist,
- each block appears once,
- spans are allowed,
- row span totals make sense,
- maximum block count reasonable.

---

# 48. Suggested bounded limits

To keep generated workspaces understandable:

```text
max visible blocks: 6–8
max entities: perhaps 16–24
max relations: perhaps 8–12
max simultaneous fretboard groups: UI-defined
```

These are guardrails, not music rules.

React can hide additional groups behind toggles/cards.

---

# 49. Responsive behavior

Agent composition should be desktop-semantic, not pixel-specific.

Suggested rule:

- rows/spans represent desktop composition,
- priority/order represent pedagogical importance,
- mobile renderer stacks automatically,
- primary blocks come first,
- supporting comparison cards can become horizontal carousels,
- block controls become compact sheets/dropdowns.

No agent-generated mobile CSS.

---

# 50. Layout persistence nuance

This is worth repeating because it changes the old spec.

Old “layout state should not persist” was correct for:

- scroll,
- resize,
- zoom,
- temporary panel proportions.

But in this new model:

> The chosen **visual teaching composition** is part of the ConceptStudy idea.

Example:

```text
G major vs G minor
```

saved as:

```text
degree strips
large comparison fretboard
affected chord family
```

That block composition should probably reopen the same way.

Therefore persist:

```text
block set
bindings
semantic order
spans
priority
meaningful view mode
```

Do not persist incidental browser geometry.

---

# 51. How the Tutor learns available blocks

The Tutor needs a compact capability description.

Not full component source.

Something like:

```json
{
  "fretboard": {
    "entities": ["scale", "interval", "chord", "voicing", "note_group"],
    "relations": ["compare", "transition", "in_context"],
    "view_options": ["labels", "fret_range", "show"]
  },

  "circle": {
    "entities": ["key"]
  },

  "chord_diagrams": {
    "entities": ["chord", "voicing"],
    "relations": ["compare", "transition"]
  }
}
```

The model composes only from supported capabilities.

---

# 52. Prompt/tool design

Do not put the full UI component implementation into the system prompt.

Potential medium-grained tools:

```text
resolve_scale
resolve_chord
resolve_key
resolve_caged_regions
analyze_comparison
analyze_transition
validate_workspace_patch
```

Or if deterministic domain data is already in context, fewer tools may be needed.

The Tutor should not need a primitive tool call for every note.

---

# 53. Workspace changes and stateless Tutor

The stateless Tutor model still works naturally.

Each turn receives:

```text
current ConceptWorkspace:
  entities
  relations
  blocks
  composition

current selection/focus
recent persisted messages
```

The model returns:

```text
message
focus
optional workspace patch
optional candidates
```

The workspace itself is application state, not agent memory.

---

# 54. Current V2 semantic focus can remain

Existing Tutor focus should remain ephemeral attention.

Example:

```text
Workspace:
G major comparison blocks

Tutor focus:
“Look at F# → G”
```

Focus highlights notes without rewriting the workspace.

If user says:

> “Keep that comparison here.”

Then the app may convert the ephemeral focus into a durable entity/relation/block update.

---

# 55. Refactor strategy

The biggest risk would be trying to implement the entire abstraction at once.

Recommended incremental path:

## Phase 0 — freeze scope

- SongStudy stays out of the Concept rearchitecture.
- Progression stays opinionated.
- Do not create global entities table.
- Do not build a plugin system.

## Phase 1 — introduce ConceptWorkspace V2 types

Add:

```text
MusicEntity
MusicRelation
WorkspaceBlockSpec
WorkspaceComposition
ConceptWorkspacePayloadV2
```

Keep old payload readable during migration.

## Phase 2 — prove with 3 entity types + 2 relations

Entities:

```text
Scale
Chord
NoteGroup / Voicing
```

Relations:

```text
Compare
Transition
```

Blocks:

```text
Fretboard
ChordDiagram
DegreeStrip
Insight
```

Prove:

```text
G major ↔ G minor
D → G
```

before adding more abstraction.

## Phase 3 — add Key + Circle

Extract/wrap Circle support.

Prove:

```text
Why does D resolve to G?
```

using:

```text
Key
Chord
Transition
Circle
Fretboard
Diagrams
```

## Phase 4 — CAGED adapter

Map current deterministic CAGED region data into NoteGroup/Voicing-compatible entities.

Avoid rewriting the CAGED math.

## Phase 5 — Tutor workspace patches

Add typed workspace patch output.

View/composition operations first.

Musical entity mutation second.

## Phase 6 — recipes

Start with system recipes:

```text
compare concepts
understand movement
CAGED overlap
scale on neck
voicing explorer
```

## Phase 7 — optional shared Fretboard extraction

Only after Concept workspace works.

Then decide if SongStudy should switch to the same low-level renderer through an adapter.

---

# 56. Migration of existing ConceptStudy artifacts

Current users/saved artifacts may have the old discriminated payload.

Options:

## Option A — versioned read adapter

```text
old ConceptStudy payload
  ↓
legacyToWorkspace()
  ↓
ConceptWorkspacePayloadV2
```

No immediate DB rewrite.

Pros:
- safe,
- reversible,
- low migration risk.

Recommended initially.

## Option B — one-time migration

Convert saved payloads.

Only worthwhile if legacy artifacts are few and the new format is settled.

### Recommendation

Start with a versioned adapter.

Do not mutate historical artifacts until the new model proves stable.

---

# 57. Explore Home

The current exhaustive Study catalog can remain available via search/browse, but it should stop being the main emotional entry point.

Suggested Explore Home:

```text
What are you curious about?

Why do chords belong together?
How does a scale cover the neck?
What changes between major and minor?
How do chord shapes connect?

Recently explored:
G major harmony
Minor pentatonic fret 5

Search:
major scale / Dorian / CAGED / maj9 / intervals ...
```

Selecting a curiosity starter can instantiate a recipe + entities.

Searching “G Mixolydian” can instantiate a simpler workspace directly.

---

# 58. Concept catalog still has value

Do not delete the backend catalog work.

It remains useful as:

- deterministic supported concept registry,
- search/discovery data,
- validation,
- entity construction options.

What changes is its **presentation priority**.

The catalog becomes a resource behind exploration, not the whole UI.

---

# 59. SongStudy layout note

Separate from this architecture, SongStudy still needs layout polish.

Current likely direction:

```text
┌──────────────┬─────────────────────────────┐
│ SONG MAP     │ Focused tab                 │
│ sticky       ├─────────────────────────────┤
│ vertical     │ Large fretboard             │
│ desktop      ├─────────────────────────────┤
│              │ Shapes / movement / harmony │
└──────────────┴─────────────────────────────┘
                              [Tutor drawer]
```

Mobile:

- horizontal/section song map,
- 1–2 readable measures,
- large fretboard,
- Tutor sheet/destination.

This work can proceed independently.

---

# 60. What this design intentionally changes from the older V2 spec

If adopted, this design supersedes/refines several earlier decisions.

## Earlier

> ConceptStudy uses strict typed visualization variants.

## New

ConceptStudy still uses typed data, but may contain **multiple entity-backed blocks** rather than one visualization family determining the whole page.

---

## Earlier

> Tutor emits semantic music and never layout instructions.

## New

Tutor still never emits arbitrary UI/layout code, but may emit **bounded semantic workspace composition**:

```text
use Fretboard
use Circle
Fretboard is primary
place Circle beside Fretboard
```

React remains the layout renderer.

---

## Earlier

> Pixel/layout state is excluded from ConceptStudy persistence.

## New

Still exclude pixel geometry, but persist **intentional semantic composition**:

- selected blocks,
- bindings,
- order,
- allowed spans,
- meaningful view state.

---

## Earlier

> Avoid a generic musical object graph.

## New

Still avoid a global generic graph.

The proposal is a **small, local, typed ConceptWorkspace document** with a bounded set of entities and relations.

This is an earned use case, not infrastructure for the whole product.

---

# 61. What this design does NOT change

- Session / Branch / Artifact foundation.
- Stateless-per-run Tutor architecture.
- Provider/caching design.
- Branch-owned application conversation.
- My Stuff/revisions.
- SongStudy raw source model.
- Song enrichment source-truth rules.
- Progression artifact semantics.
- Exercise artifact semantics.
- Explicit branch creation.
- User owns navigation / Tutor owns attention.
- Structural validation over musical taste.
- Arbitrary physical voicings remain valid.
- Deterministic local interactions avoid LLM calls.

---

# 62. Testing strategy for the new Concept workspace

Focus on behavioral seams.

## Projection tests

- G major → fretboard projection.
- G major ↔ G minor → shared/changed degree + fretboard groups.
- D→G voicing transition → shared/moving positions.
- arbitrary NoteGroup → visualizes without canonical theory identity.

## Workspace validation tests

- invalid block/source pair rejected,
- dangling entity ref rejected,
- invalid layout span rejected,
- duplicate block IDs rejected,
- unsupported arbitrary block type rejected.

## State propagation tests

Manual:

```text
change root G→A
```

assert:

- Circle,
- DegreeStrip,
- Fretboard

all update from the same entity.

## Tutor patch tests

Stub model returns:

```text
add comparison
add fretboard block
make it primary
```

assert deterministic application state.

## Save/reopen

Save ConceptStudy with:

```text
G major vs G minor
degree strips
fretboard
chord diff
```

reopen and verify semantic composition restores.

Do not assert pixel coordinates.

## Legacy adapter tests

Old ConceptStudy payload opens as equivalent new workspace.

---

# 63. Product acceptance examples

The first ConceptWorkspace implementation should make these interactions feel excellent.

## A. Compare

User:

> “What changes between G major and G minor?”

Expected:

- no catalog dump,
- two concept summaries,
- changed degrees obvious,
- large comparison fretboard,
- relevant harmonic differences,
- Tutor can focus only the changed notes.

## B. Movement

User:

> “Why does D resolve to G?”

Expected:

- harmonic context,
- D/G diagrams,
- fretboard showing meaningful motion,
- optional Circle,
- hear transition,
- practice transition.

## C. CAGED

User:

> “I know the CAGED shapes but don’t understand how they connect.”

Expected:

- large neck,
- two adjacent regions,
- overlap emphasized,
- physical diagrams,
- Tutor can add the next region without replacing the whole page.

## D. Creative physical idea

User:

> “Show me a weird upper voicing over this chord.”

Expected:

- arbitrary Voicing/NoteGroup candidate,
- visualized immediately,
- hear,
- compare,
- no canonical DB required.

---

# 64. Open design questions

These should be explicitly revisited before final spec/tickets.

## Entity model

- Do we need `IntervalEntity`, or can intervals be represented through NoteGroup/relationship data?
- Should Progression appear as a local entity in ConceptStudy, or should ConceptStudy only reference/import a progression artifact snapshot?
- Do we need a dedicated `PitchSetEntity`, or does Scale + NoteGroup cover enough?

## Relations

- Is `InContextRelation` needed in the first slice, or can it wait after Compare + Transition?
- Should CAGED adjacency use Compare or Transition semantics?
- Should provenance remain entity metadata instead of a relation? Current recommendation: yes.

## Composition

- Rows + spans, or more semantic `primary/supporting/reference` only?
- Should users be allowed to drag/reorder blocks manually?
- If user drags a block, does that update saved semantic composition?
- How much composition does Tutor automatically change without asking?

## Persistence

- Does “Save ConceptStudy” always preserve the current block composition?
- Which block view settings are pedagogically meaningful enough to persist?
- Should fret range persist? It can be meaningful, but may also behave like zoom.

## Templates

- System templates only at first?
- When/where would user-saved workspace recipes live?
- Should a saved ConceptStudy be promotable to a reusable recipe?

## Tutor

- Workspace patch in every TutorResponse, or only via explicit “recompose” tool/action?
- Does Tutor get the full workspace state every turn, or a compact semantic summary + selected block state?
- How should Tutor choose between changing focus and changing composition?

## Backend

- How much entity resolution should happen in `concepts.py` vs a new `workspace.py`/`entities.py` module?
- Do relations return normalized analysis snapshots, or do block projectors call deterministic functions separately?

## Legacy

- How long do we support old ConceptStudy payload variants?
- Is migration safe enough once the new workspace proves itself?

---

# 65. Anti-patterns to avoid

## A. “Universal everything” architecture

Do not refactor SongStudy, Progression, Exercise, and ConceptStudy into one generic workspace engine immediately.

ConceptStudy is the earned use case.

## B. Global entity graph database

Not needed.

Local typed workspace entities are enough.

## C. One component per theory concept

Avoid:

```text
MajorScaleExplorer
DorianExplorer
MixolydianExplorer
...
```

Same blocks + different data.

## D. Giant arbitrary block.data blobs

Prefer entity/relation refs + typed view state.

## E. Agent-generated UI code

Never.

## F. Template = fixed page

Recipes should be adaptable.

## G. Duplicated musical data in blocks

Blocks reference entities.

They do not own copies.

## H. Making all interactions call Tutor

Dropdowns, view controls, audio, compare selections, root changes, etc. remain deterministic.

---

# 66. Suggested frontend folder direction

Only if/when the refactor earns it.

Do not create all of this before Phase 1 needs it.

Possible target:

```text
frontend/src/v2/
  concept/
    ConceptWorkspace.tsx
    ExploreHome.tsx
    workspaceTypes.ts
    workspaceReducer.ts

    blocks/
      FretboardBlock.tsx
      CircleBlock.tsx
      ChordDiagramBlock.tsx
      DegreeStripBlock.tsx
      ProgressionStripBlock.tsx
      InsightBlock.tsx

    projections/
      fretboard.ts
      chordDiagrams.ts
      degrees.ts

    registry.ts
    recipes.ts
```

Existing components can be moved/wrapped gradually.

Ponytail principle still applies: create directories/files only as real boundaries emerge.

---

# 67. Suggested backend direction

Again, incremental.

Current `backend/app/v2/concepts.py` can remain the deterministic source initially.

Potential target later:

```text
backend/app/v2/
  concepts.py        # existing catalog / legacy builder
  workspace/
    entities.py
    relations.py
    validation.py
```

Do not create this structure until actual implementation makes the split useful.

The important thing is the contract, not the directory architecture.

---

# 68. Suggested Tutor contract extension

Conceptual only:

```ts
interface TutorResponse {
  message: string;

  focus?: TutorFocus;

  workspace_patch?: WorkspacePatch;

  candidates?: ...;

  exercise_suggestion?: ...;
}
```

Rules:

```text
focus
= temporary attention

workspace_patch
= visual/compositional state

candidate
= new musical option not yet accepted

artifact mutation
= still uses validated persistence path
```

This separation should remain clear.

---

# 69. Decision summary

## Strongly recommended / effectively settled from this discussion

1. **Keep SongStudy opinionated.**
2. **Do not force SongStudy through the new entity storage model.**
3. **Use ConceptStudy as the proving ground for the composable workspace.**
4. **Musical entities are separate from visual blocks.**
5. **Blocks reference entities/relations rather than copying music.**
6. **Comparison becomes a first-class relation, not a per-family special field.**
7. **Projections connect musical state to reusable visual components.**
8. **Manual controls and Tutor act on the same workspace state.**
9. **Tutor composes trusted blocks; never generates arbitrary UI.**
10. **Persist semantic composition, not pixel geometry.**
11. **Templates/recipes store reusable composition with slots, not concrete musical data.**
12. **No global graph DB or universal artifact framework.**
13. **Keep current stateless Tutor/session/branch/persistence architecture.**
14. **Reuse current V2 components aggressively rather than rewriting music/visualization logic.**

---

# 70. Immediate next refinement

Before turning this into implementation tickets, answer/decide:

1. Exact first entity set.
2. Exact first relation set.
3. Exact first block set.
4. Exact persisted workspace schema.
5. Exact layout composition language.
6. Exact agent WorkspacePatch contract.
7. Legacy ConceptStudy migration behavior.
8. Which pieces of current Circle/CAGED stay composite for the first slice.
9. Whether semantic fret range is persisted.
10. Whether recipes ship in first implementation or only after the base workspace proves useful.

A good first engineering slice is probably:

> **Rebuild ConceptStudy around a local ConceptWorkspace that can represent and render G-major-vs-G-minor using two Scale entities, one Compare relation, DegreeStrip blocks, one large Fretboard block, and one Insight block; manual root/scale changes update all bound views; save/reopen preserves semantic composition; existing SongStudy remains unchanged.**

That proves the core abstraction with a real user benefit before attempting Circle, CAGED, or agent-driven arbitrary composition.

---

# 71. Final product framing

The deeper product opportunity is not “AI generates a dashboard.”

It is:

> **Guitar Tutor has a small vocabulary of trustworthy musical representations.  
> The Tutor chooses and combines those representations based on the musical question.  
> The user can then directly manipulate the same musical objects and views.**

That creates something closer to an exploratory musical workbench than a theory encyclopedia.

For ConceptStudy, that is the direction worth pursuing.

For SongStudy, preserve the strong temporal/source workflow and continue refining layout independently.
