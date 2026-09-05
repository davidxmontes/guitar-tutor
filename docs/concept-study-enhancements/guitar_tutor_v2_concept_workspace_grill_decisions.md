# Guitar Tutor V2 — Composable ConceptStudy Workspace
## Grill Session Decision Record

**Status:** Decision-complete design input for the next `to-spec` pass  
**Scope:** Replace the existing V2 Study / ConceptStudy product model with the new composable ConceptStudy workspace  
**Repository baseline:** `davidxmontes/guitar-tutor`, `main-v2`  
**Compatibility posture:** Existing ConceptStudy data and UI do **not** need backward compatibility. The current ConceptStudy may be replaced cleanly.

---

# 1. Core product decision

ConceptStudy should no longer be a fixed theory page selected from a large catalog.

It should become a **composable musical exploration workspace** built from a small set of trusted visualization blocks.

The Tutor may choose:

1. which musical entities matter,
2. which relationships between them matter,
3. which reusable visual blocks best explain the idea,
4. how those blocks are composed semantically,
5. and which temporary focus/inspection should be emphasized.

React still owns the real UI implementation and responsive rendering.

The Tutor does **not** generate React, HTML, CSS, arbitrary components, or arbitrary pixel geometry.

The product goal is:

> **The Tutor composes trusted musical representations around the user’s question.  
> The user can then manipulate the same underlying musical state manually.**

This should feel like an exploratory musical workbench, not a theory encyclopedia or dashboard builder.

---

# 2. Scope boundary

## ConceptStudy

The new composable workspace applies to **ConceptStudy**.

ConceptStudy may also contain and edit a local progression.

## SongStudy

SongStudy remains an **opinionated song-learning workspace**.

Its current product model is broadly good and should not be rewritten around the new Concept entity model.

SongStudy still needs layout refinement, but that is a separate composition/hierarchy task.

## Progression

A progression may live as an editable entity inside ConceptStudy.

A dedicated Progression artifact/workspace still exists when the user intentionally branches or works on that progression separately.

## Exercise

Exercise remains its own artifact and is not pulled into the generic Concept workspace architecture.

---

# 3. Artifact model remains intact

V2 retains the established first-class artifact types:

```ts
type ArtifactKind =
  | "song_study"
  | "progression"
  | "concept_study"
  | "exercise";
```

The Session / Branch / Artifact architecture remains unchanged.

The stateless-per-run Tutor architecture remains unchanged.

Branch-owned application conversation remains unchanged.

---

# 4. ConceptStudy becomes a ConceptWorkspace

The new ConceptStudy payload is conceptually:

```text
ConceptStudy Artifact
        │
        ▼
ConceptWorkspace
├── entities
├── relations
├── derived exploration state
├── blocks
├── semantic composition
└── provenance
```

The workspace is the durable semantic representation of the exploration.

---

# 5. Initial musical entity vocabulary

The first implementation should include all of these:

```text
Key
Scale
Chord
Voicing
NoteGroup
Progression
```

A dedicated Interval entity is **not** required initially.

Intervals can remain derived exploration/projection data and become NoteGroups when independent physical identity is needed.

---

# 6. Entity identity is local and reusable

Entities are reusable **within one ConceptWorkspace**.

Example:

```text
ScaleEntity: G major
      │
      ├── DegreeStrip
      ├── Fretboard
      └── another compatible view
```

All blocks reference the same entity.

Changing the entity updates all dependent blocks.

Entities are **not globally shared mutable objects** across artifacts.

When another artifact/workspace needs one, it imports/copies a snapshot with provenance rather than pointing at globally mutable state.

---

# 7. No global entity graph

Do not create:

- a global entity database,
- an entity graph service,
- globally shared Scale/Chord rows,
- live cross-artifact entity dependencies,
- a generalized music graph.

Entities and relations live inside the typed ConceptStudy payload.

This is a local workspace model, not universal infrastructure.

---

# 8. Entity definitions

## Key

```ts
interface KeyEntity {
  id: string;
  kind: "key";
  tonic: PitchClass;
  mode: "major" | "minor";
}
```

The backend derives:

- pitch collection,
- accidentals,
- relative major/minor,
- diatonic chords,
- neighboring keys,
- I / IV / V.

The Circle of Fifths is a view of a Key entity, not an entity itself.

---

## Scale

```ts
interface ScaleEntity {
  id: string;
  kind: "scale";
  root: PitchClass;
  scaleType: ScaleType;
}
```

Store canonical musical identity.

Derive:

- notes,
- intervals,
- valid positions,
- related harmony,

through deterministic backend logic.

---

## Chord

```ts
interface ChordEntity {
  id: string;
  kind: "chord";
  root: PitchClass;
  quality: ChordQuality;
}
```

A Chord is abstract harmony.

It is deliberately separate from its physical realization.

---

## Voicing

```ts
interface VoicingEntity {
  id: string;
  kind: "voicing";

  chordRef?: string;

  tuning: Tuning;

  positions: Array<{
    string: number;
    fret: number;
  }>;

  barre?: Barre | null;
  fingering?: Fingering[];
  provenance?: VoicingProvenance;
}
```

Exact physical positions + tuning are authoritative.

A Voicing can exist without a confident canonical chord name.

---

## NoteGroup

```ts
interface NoteGroupEntity {
  id: string;
  kind: "note_group";

  tuning?: Tuning;
  pitches?: PitchClass[];

  positions?: Array<{
    string: number;
    fret: number;
  }>;

  label?: string;

  semanticKind?:
    | "shape"
    | "target_notes"
    | "caged_region"
    | "phrase_shape"
    | "custom";
}
```

NoteGroup exists from day one.

It is the escape hatch for:

- arbitrary Tutor-created grips,
- two-note shapes,
- target-note collections,
- fretboard ideas,
- CAGED regions,
- uncertain or unnamed physical material.

Creative physical ideas must not require a canonical theory match to be visualized.

---

## Progression

Progression is a fully editable local entity inside ConceptStudy.

```ts
interface ProgressionEntity {
  id: string;
  kind: "progression";

  steps: ProgressionStep[];
}
```

Each step is an occurrence:

```ts
interface ProgressionStep {
  id: string;
  chordRef: string;
  voicingRef?: string | null;
}
```

This allows:

```text
G(open) → C → G(barre)
```

without pretending both G occurrences are physically identical.

---

# 9. Progressions are concrete

A persisted/editable ProgressionEntity represents concrete musical chords.

Example:

```text
G → D → Em → C
```

It does not silently transpose because another Key entity changes.

If the context key changes, the same concrete progression can be analyzed in the new context.

Transposition is an **explicit deterministic action**.

Example:

```text
G → D → Em → C
[Transpose to A]
→ A → E → F#m → D
```

No Tutor call is required for deterministic transposition.

---

# 10. Functional progressions remain derived until materialized

Theory exploration may use derived Roman-numeral patterns:

```text
I → V → vi → IV
Key: G
→ G → D → Em → C
```

Changing key during this transient theory exploration may update the derived concrete result:

```text
Key: A
→ A → E → F#m → D
```

This does not need to be a ProgressionEntity yet.

When the user edits it, keeps it, or chooses to work on it, materialize the current concrete result as a ProgressionEntity.

This follows a broader rule:

> **Derived musical objects remain cheap until independent identity becomes useful.**

---

# 11. Derived objects are not immediately entities

Example:

A Key entity for G major derives seven diatonic chords.

Do **not** automatically create seven Chord entities.

The Circle/chord-family projection may display them as derived data.

If the user clicks D, it becomes the current inspection.

If the user then says:

> “Compare D with G.”

D and G are materialized into local Chord entities because they now need independent identity.

This keeps the workspace small and avoids entity proliferation.

---

# 12. Initial relation vocabulary

The first implementation uses:

```text
Compare
Transition
```

Do not build a generic relation graph.

`InContext` was discussed but is deferred until a concrete use case requires it.

---

# 13. Compare relation

```ts
interface CompareRelation {
  id: string;
  kind: "compare";

  left: EntityRef;
  right: EntityRef;
}
```

Examples:

```text
G major ↔ G minor
G Ionian ↔ G Mixolydian
A minor pentatonic ↔ A blues
G major chord ↔ G minor chord
Voicing A ↔ Voicing B
CAGED region C ↔ region A
```

The relation itself does not own one rendering.

Several blocks may consume the same comparison.

---

# 14. Transition relation

```ts
interface TransitionRelation {
  id: string;
  kind: "transition";

  from: EntityRef;
  to: EntityRef;

  contextRef?: EntityRef<"key">;
}
```

Examples:

```text
D → G
Bm9 voicing → Gmaj7 voicing
CAGED C-region → A-region
```

A progression remains the ordered sequence.

Transition is used to inspect movement between specific entities/steps.

---

# 15. Do not introduce a generic Sequence<T>

A progression owns its ordered chord/voicing steps.

CAGED can keep its existing region ordering.

Other ordered musical use cases can use specific domain behavior or individual Transition relations when required.

Do not introduce:

- generic `Sequence<T>`,
- generic `PathRelation`,
- generic sequence persistence,

until a real non-progression use case earns it.

---

# 16. Blocks have exactly one semantic source

A block references:

```ts
type BlockSource =
  | { type: "entity"; id: EntityId }
  | { type: "relation"; id: RelationId };
```

One block has one semantic source.

A comparison block references the Compare relation.

A movement fretboard references the Transition relation.

Do not pass arbitrary arrays of entities directly into blocks as the normal model.

Multi-entity meaning belongs in Relations.

---

# 17. Musical data is not copied into blocks

Bad:

```text
Fretboard.data.root = G
Circle.data.root = G
DegreeStrip.data.root = G
```

Good:

```text
ScaleEntity e1 = G major

Fretboard → e1
DegreeStrip → e1
Other view → e1
```

Change e1 to A major and every compatible projection updates.

This is the key reuse mechanism.

---

# 18. Backend owns music derivation

The backend remains responsible for deterministic musical correctness:

- scale formulas,
- chord tones,
- pitch sets,
- key relationships,
- interval math,
- tuning,
- string/fret → pitch,
- CAGED source data,
- voicing validation,
- transition analysis where correctness matters.

The current V2 deterministic theory/music code should be reused.

The frontend should not reproduce theory formulas ad hoc.

---

# 19. Frontend owns visual projection

The frontend takes already-resolved musical facts and maps them into presentation view models.

Example:

```text
Backend:
G major
→ notes
→ intervals
→ validated physical positions

Frontend:
resolved scale
→ FretboardViewModel
→ DegreeStripViewModel
→ React blocks
```

Do not make the backend return React-specific layout models.

---

# 20. Projection layer

Entities/relations are not rendered directly.

They are projected into reusable normalized visual models.

Example:

```ts
projectToFretboard(
  source,
  viewOptions
): FretboardViewModel
```

A Fretboard block should not care whether its source represents:

- Scale,
- Chord,
- Voicing,
- NoteGroup,
- Compare,
- Transition.

It renders semantic groups of physical positions.

---

# 21. Shared Fretboard direction

Long-term, existing duplicate neck renderers may converge toward:

```tsx
<Fretboard
  tuning={model.tuning}
  fretRange={model.fretRange}
  groups={model.groups}
/>
```

Suggested group roles:

```text
primary
comparison
shared
changed
context
current
upcoming
candidate
target
tutor_focus
```

The ConceptStudy rework should earn this extraction.

Do not force SongStudy through the Concept entity model.

SongStudy may later use the same low-level renderer through a Song-specific adapter.

---

# 22. Shared chord diagrams

`PhysicalChordDiagram` remains a reusable leaf component.

It should consume:

- positions,
- tuning,
- optional label,
- optional barre,
- optional fingering/provenance.

It should not:

- fetch,
- call Tutor,
- save,
- know about ConceptStudy/SongStudy/Progression,
- decide canonical chord identity.

---

# 23. CAGED and Circle are visual systems, not entities

## CAGED

CAGED uses:

```text
Chord entity
+
deterministic CAGED region data
+
NoteGroup / Voicing-compatible physical regions
```

Regions can later participate in Compare/Transition.

Do not create a special CAGED entity universe.

## Circle

Circle of Fifths is a block/view over a Key entity.

The current Circle component can initially remain composite.

Decompose its internal chord-family/sequence pieces only when another real composition needs them independently.

---

# 24. Initial block vocabulary

The first ConceptWorkspace should support:

```text
Fretboard
Chord diagrams
Degree strip
Progression strip/editor
Circle
Insight
```

CAGED may initially remain a composite reusable block.

Additional blocks can be added only when real use cases require them.

Do not build a generic plugin framework.

---

# 25. Block registry

A small typed registry should define what each block supports.

Example:

```ts
const blockRegistry = {
  fretboard: {
    entities: [
      "scale",
      "chord",
      "voicing",
      "note_group"
    ],

    relations: [
      "compare",
      "transition"
    ]
  },

  chord_diagrams: {
    entities: [
      "chord",
      "voicing"
    ],

    relations: [
      "compare",
      "transition"
    ]
  },

  circle: {
    entities: ["key"]
  },

  degree_strip: {
    entities: ["scale"],
    relations: ["compare"]
  },

  progression: {
    entities: ["progression"]
  }
};
```

Use it for:

- validation,
- TypeScript narrowing,
- Tutor capability descriptions,
- contextual Add View menus.

---

# 26. Three different state/control types

The UI must distinguish:

## Entity controls

Change musical truth.

Examples:

```text
Root G → A
Major → Dorian
maj7 → m7
Progression chord D → Bm
```

All bound blocks update.

## Relation controls

Change what is being compared/related.

Example:

```text
Compare:
G major ↔ G minor
→
G major ↔ G Mixolydian
```

## View controls

Change only one block's presentation.

Examples:

```text
Notes / intervals
Fret range
Show shared only
Show changed only
Compact / expanded
```

Entity musical values must not be overridden independently inside each block.

---

# 27. User and Tutor share the same state model

There is no separate AI state.

```text
        user controls
             \
              \
          Workspace state
              /
             /
           Tutor
```

User:

```ts
patchEntity("scale-1", {
  root: "A"
});
```

Tutor:

> “Make this A Dorian.”

may produce equivalent semantic state change.

User and Tutor both use application-defined state operations.

Ordinary deterministic controls do not require a Tutor call.

---

# 28. Mutate-vs-fork rule for the Tutor

The Tutor should behave predictably.

If the user means:

> “Change this.”

mutate the existing entity.

If the user means:

> “Compare this,”  
> “also show,”  
> “try another,”  
> “what about…”

create another entity/candidate and relate it.

Do not silently replace the main entity when the request is exploratory.

---

# 29. Workspace-wide inspection/focus

The workspace has one shared primary inspection at a time.

Example:

```text
Context:
G major

Inspection:
D · V chord
```

Compatible blocks respond to that inspection.

Example:

```text
Circle
→ highlights D

Fretboard
→ shows D chord tones

Chord diagram
→ shows D

Degree strip
→ highlights V
```

Unrelated blocks ignore it.

---

# 30. Inspection can target derived musical objects

Inspection is not restricted to materialized entities.

It can target:

- a derived chord,
- a note,
- a scale degree,
- a voicing,
- a CAGED region,
- another compatible musical sub-object.

Example:

```text
G major
→ click D chord
→ inspect D

then click F#
→ inspect F# within current context
```

This should not fill workspace state with entities.

---

# 31. Inspection UX

Use a simple one-level UX:

```text
G major harmony
Exploring: D · V chord      [Back to G major]
```

Back clears the inspection.

Do not create a nested browser-like inspection history.

Deeper historical navigation is handled by Tutor turn snapshots.

---

# 32. When inspection becomes durable

Example:

```text
G major
inspection = D
```

User:

> “Keep D here and compare it with G.”

Then:

1. materialize D as a Chord entity,
2. materialize G as needed,
3. create Compare or Transition,
4. bind/add relevant blocks,
5. clear or move the ephemeral inspection.

Materialize only when durable independent identity becomes useful.

---

# 33. Compatible blocks react automatically

Inspection propagation is deterministic.

Blocks declare whether/how they respond.

Do not make every block react to every selection.

Do not require the Tutor to manually update each block after a click.

---

# 34. Composition model

The Tutor may control bounded semantic composition.

It may choose:

- blocks,
- sources,
- block order,
- row grouping,
- allowed spans,
- semantic priority.

It may not choose:

- arbitrary CSS,
- pixel coordinates,
- raw dimensions,
- arbitrary component types.

Recommended model:

```ts
interface WorkspaceComposition {
  rows: Array<{
    blocks: Array<{
      blockId: string;
      span: 3 | 4 | 6 | 8 | 12;
    }>;
  }>;
}
```

Blocks may also have:

```ts
priority:
  | "primary"
  | "supporting"
  | "reference";
```

React resolves real desktop/mobile layout.

---

# 35. Grid is an implementation detail

Users should not feel like they are using a dashboard builder.

Do not expose:

```text
Grid cell 3
8-column span
Entity e17
Relation r3
```

Block headers may expose useful musical/view controls only.

---

# 36. Tutor composition behavior

The Tutor should be conservative by default.

Prefer:

1. existing blocks,
2. focus/inspection,
3. view changes,
4. adding a useful block,

before significant recomposition.

Major layout changes should happen only when:

- explicitly requested,
- or the existing composition genuinely cannot answer the question.

---

# 37. Block removal rules

Tutor may:

- add helpful blocks automatically,
- change focus,
- update view options,
- rearrange modestly when useful.

Tutor should avoid removing/replacing existing blocks unless:

- the user explicitly asks,
- a reset/recompose was clearly requested,
- or a stronger intentional action justifies it.

No Pin/Lock feature is needed initially.

---

# 38. Added blocks persist in working state

Tutor-added blocks remain in the working workspace until intentionally removed/recomposed.

They are not one-turn ephemeral UI.

Ephemeral attention belongs in focus/inspection.

Composition is working state.

---

# 39. Manual Add View

Users should be able to add views without talking to the Tutor.

Example:

```text
+ Add view

Fretboard
Chord diagrams
Circle
Progression
...
```

Only show blocks compatible with the current entities/relations.

This prevents the Tutor from becoming a required UI controller.

---

# 40. Progression block UX

A ProgressionEntity should be editable directly inside ConceptStudy.

Example:

```text
Progression

[G] → [D] → [Em] → [C]

+ chord
Hear
Transpose
```

Clicking a chord inspects it across the workspace.

Changing a chord updates dependent diagrams/fretboards immediately.

The user only needs a dedicated Progression artifact when they intentionally choose to work on it separately.

---

# 41. Candidate entities

When the Tutor invents new material, create a candidate entity.

Example:

```text
Candidate · upper grip

[diagram]
[hear]
[keep]
[dismiss]
```

Candidate can participate in comparison before acceptance.

`Keep` converts it into normal working workspace state.

Saving the ConceptStudy later makes it durable in artifact history.

---

# 42. Tutor workspace patch contract

For the first implementation, the Tutor should return a typed workspace patch in the final semantic response.

Conceptual shape:

```ts
interface TutorResponse {
  message: string;
  focus?: TutorFocus;
  workspace_patch?: WorkspacePatch;
  candidates?: ...;
  exercise_suggestion?: ...;
}
```

Do not give the agent mutable workspace tools inside the ReAct loop initially.

Read/analyze tools remain non-mutating.

The application validates/applies the final patch.

---

# 43. Workspace patch operations

Conceptual operations:

```ts
type WorkspaceOperation =
  | AddEntity
  | UpdateEntity
  | AddRelation
  | UpdateRelation
  | AddBlock
  | UpdateBlockView
  | RemoveBlock
  | Recompose;
```

All references and block/source compatibility must be validated before application.

---

# 44. Current workspace is authoritative

If the user manually changes:

```text
G major ↔ G minor
```

to:

```text
A major ↔ A minor
```

then asks:

> “Why is the third important?”

the next Tutor turn receives the current A-major/A-minor workspace.

Historical conversation does not override current application state.

This extends the established V2 principle:

> current artifact/application state is authoritative; conversation is supportive context.

---

# 45. Ordinary manual controls stay quiet

Do not inject chat/system messages for every dropdown click.

Example:

```text
Root G → A
```

should not create:

> User changed root from G to A.

The next Tutor turn sees the current workspace directly.

History snapshots capture state implicitly.

---

# 46. Workspace history

Every Tutor turn should reference a semantic workspace snapshot.

Example:

```text
Turn 1
→ snapshot A

Turn 2
→ snapshot B

Turn 3
→ snapshot C
```

If the workspace did not change, turns may eventually reference the same deduplicated snapshot.

Start simple: full semantic snapshot JSON is acceptable.

Do not implement event sourcing.

---

# 47. Historical preview

Clicking an older Tutor turn should preview the workspace from that point.

UX:

```text
Historical workspace

[Return to current]
[Restore this version]
```

Historical preview does not mutate current working state.

---

# 48. Restore behavior

Restore does not truncate later conversation.

Example:

```text
Turn 1
Turn 2
Turn 3
Turn 4

Restore workspace from Turn 2
```

creates a new present.

Conceptually:

```text
Turn 5
Restored workspace from Turn 2
```

History remains linear.

Do not create automatic sub-branches or Git-like history.

---

# 49. Snapshot boundaries

Always checkpoint at Tutor turn boundaries.

Also checkpoint intentional lifecycle actions such as:

- Restore,
- Save,
- explicit Recompose.

Do not checkpoint every dropdown/view click.

Ordinary manual changes are reflected in the next Tutor-turn snapshot.

---

# 50. Focus/history separation

Tutor focus remains attached to the Tutor turn.

Workspace snapshots preserve semantic workspace composition/state.

Historical replay can combine:

```text
workspace snapshot
+
Tutor focus from that turn
```

Do not persist ephemeral Tutor focus into the durable ConceptStudy payload.

---

# 51. Three histories remain distinct

```text
Current working state
        │
        ├── Turn snapshots
        │     automatic session/Branch history
        │
        └── Artifact revisions
              intentional Save/Apply history
```

Do not confuse turn history with formal saved revisions.

---

# 52. Working persistence model

Recommended:

```text
ConceptStudy current payload
= current working truth

Tutor turn
= workspace_snapshot_id

Workspace snapshot
= immutable semantic JSON copy

Artifact revision
= immutable saved revision on meaningful Save/Apply
```

The current ConceptStudy payload remains the authoritative working workspace.

---

# 53. Workspace payload storage

Keep workspace data inside typed ConceptStudy JSON.

Do not create separate DB tables for:

- entities,
- relations,
- blocks,
- layout rows.

Possible payload:

```ts
interface ConceptWorkspacePayload {
  schemaVersion: 1;

  title: string;

  entities: Record<string, MusicEntity>;
  relations: Record<string, MusicRelation>;

  blocks: WorkspaceBlockSpec[];
  composition: WorkspaceComposition;

  createdFrom?: Provenance | null;
}
```

A separate snapshot table/record may be added if needed for turn history.

---

# 54. Semantic composition is persisted

The older rule “do not persist layout state” is refined.

Persist intentional pedagogical composition:

- block set,
- entity/relation bindings,
- block order,
- semantic rows,
- allowed spans,
- block priority,
- meaningful view settings.

Do not persist incidental geometry:

- pixel widths,
- browser viewport,
- scroll position,
- hover,
- open dropdowns,
- temporary focus,
- arbitrary CSS.

Rule:

> **Persist teaching composition, not screen geometry.**

---

# 55. No backward compatibility for old ConceptStudy

This is explicit and settled.

Do not build:

- legacy payload adapters,
- schema migrations for old ConceptStudy data,
- dual ConceptStudy renderers,
- old Study fallback,
- compatibility layers.

Existing ConceptStudy data can be wiped/reset.

The current deterministic theory/music implementations are reusable source code.

The old ConceptStudy product contract is not a constraint.

---

# 56. Existing Circle/CAGED reuse

Do not fully decompose current Circle/CAGED components before proving the new workspace.

Initially:

- wrap/reuse them as composite blocks where useful,
- keep deterministic CAGED/relationship logic,
- reuse `PhysicalChordDiagram`,
- extract smaller pieces only when another real workspace composition needs them independently.

This keeps the migration bounded.

---

# 57. Explore entry experience

The giant theory catalog should no longer be the emotional/default front door.

Target:

```text
Explore

What are you curious about?

[Why do chords belong together?]
[What changes between major and minor?]
[How do shapes connect across the neck?]
[How does a scale cover the guitar?]

Search concepts...
Recent explorations...
Browse all
```

The existing backend concept catalog remains useful behind:

- Search,
- Browse all,
- validation,
- deterministic concept creation.

Do not throw away the catalog logic.

Change its product role.

---

# 58. Known concepts open deterministically

Searching:

```text
G major
```

should immediately create a useful starter workspace from deterministic code/system recipe.

No Tutor call is required.

Example starter:

```text
G major

Degree strip
Large fretboard
Useful related harmony
```

Tutor can modify/recompose afterward.

---

# 59. Tutor presentation

Tutor should not permanently consume a large third column.

Desktop:

```text
Music workspace
[Tutor drawer →]
```

When opened, use a split view if useful.

Mobile:

- dedicated Tutor sheet/tab/panel.

This applies to the new Concept workspace.

---

# 60. Reusable recipes/templates

Recipes are useful but user-created templates are deferred.

System recipes may exist from the first implementation.

A recipe contains slots + block composition.

It does not contain concrete musical data.

Example:

```text
Compare two scales

slots:
  left scale
  right scale

blocks:
  left degree strip
  right degree strip
  comparison fretboard
  insight
```

Do not make recipes rigid one-page-per-concept templates.

Tutor may instantiate or adapt them.

---

# 61. First proof scenarios

The architecture is not considered successful after only one scale screen.

It should prove all three:

---

## Scenario 1 — G major vs G minor

Needs:

```text
Scale
Compare
Degree strip
Comparison fretboard
Insight
```

Must support:

- manual root changes,
- comparison changes,
- shared/changed notes,
- Tutor focus,
- Save/reopen,
- turn snapshots.

---

## Scenario 2 — D → G in G major

Needs:

```text
Key
Chord
Voicing
Transition
Circle
Chord diagrams
Movement fretboard
Insight
```

Must prove:

- movement/voice-leading,
- harmonic context,
- inspection,
- multiple blocks consuming one relation,
- conservative Tutor composition.

---

## Scenario 3 — I–V–vi–IV exploration

Needs:

```text
derived Roman-numeral pattern
Key context
materialize concrete Progression
editable Progression block
diagrams/fretboard
```

Must prove:

- derived → materialized workflow,
- concrete progression semantics,
- explicit transpose,
- local Progression editing inside ConceptStudy.

---

## Candidate proof

At least one of these flows should include a Tutor-created arbitrary NoteGroup/Voicing candidate:

```text
Candidate · upper grip

Hear
Compare
Keep
Dismiss
```

This proves the architecture does not depend on canonical database-only musical objects.

---

# 62. Success criteria for the new architecture

The rework is successful when:

1. ConceptStudy no longer feels like a catalog/checklist.
2. Several different questions can produce meaningfully different compositions from the same block vocabulary.
3. One musical entity can drive several synchronized views.
4. Comparison is reused across multiple blocks.
5. Inspection is fast and deterministic.
6. Manual controls do not require AI.
7. Tutor can add/recompose visualizations without generating UI code.
8. Arbitrary physical musical ideas remain visualizable.
9. Save/reopen preserves semantic composition.
10. Turn history can preview/restore prior workspace states.
11. Progressions are editable inside ConceptStudy without forcing a separate mode.
12. SongStudy remains stable and independent.

---

# 63. Anti-goals

Do not:

- preserve the old ConceptStudy architecture for compatibility,
- build a generic plugin framework,
- build a global musical graph,
- convert SongStudy into this entity model,
- build a generic `Sequence<T>`,
- generate React/UI from the LLM,
- store arbitrary CSS/layout pixels,
- create an entity for every derived chord/note,
- make the Tutor required for ordinary controls,
- let the Tutor constantly churn the layout,
- create artifact revisions on every message,
- truncate history when restoring,
- require every Voicing/NoteGroup to have a canonical theory name.

---

# 64. Recommended implementation boundary before `to-spec`

The next implementation spec should treat these decisions as settled:

```text
Scope:
replace existing ConceptStudy/Study

New model:
ConceptWorkspace

Entities:
Key
Scale
Chord
Voicing
NoteGroup
Progression

Relations:
Compare
Transition

Blocks:
Fretboard
Chord diagrams
Degree strip
Progression
Circle
Insight
plus composite CAGED as needed

State:
entities + relations + blocks + semantic composition

History:
turn snapshots + explicit restore

Persistence:
typed ConceptStudy JSON + semantic composition

Tutor:
final typed workspace_patch

UX:
Explore home + deterministic starter recipes
shared workspace inspection
manual Add View
collapsible Tutor

Compatibility:
none required for old ConceptStudy data/UI
```

---

# 65. Next step

The next step is to run the Matt Pocock `to-spec` process using:

1. this decision record,
2. the current `main-v2` implementation,
3. the current V2 parent spec/tickets only as historical/current-product context,
4. and the explicit instruction that this new design supersedes the existing ConceptStudy/Study implementation rather than extending it compatibly.

The resulting spec should be implementation-oriented and should identify the smallest tracer-bullet path that proves the new architecture without destabilizing SongStudy or the rest of V2.
