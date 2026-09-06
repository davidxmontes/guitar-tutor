# Decision Handoff — Harmony + Progression re-carve

**Status:** Settled. Question-master output — every decision below is confirmed, not proposed.
**Verdict:** READY FOR SPEC.
**Grounded against:** `main-v2` @ `73302c7` (post #88 chain: #89–96 merged via #97/#98/#99).
**Settled via:** grill-with-docs session, 10 rounds (Q1–Q38), continuing the design conversation that opened from "the app still feels the same in terms of weird user experience."
**Supersedes:** #59 (`Spec: Replace ConceptStudy with a composable musical exploration workspace`) — close as superseded, the way #79 was by #88. This becomes a **new parent `Spec:` issue**, not tickets under #59.
**Next:** `spec-master` produces the Execution Spec from this document.

---

## Root

Full re-carve. Breaking changes accepted (solo user, exploratory data has no migration value). `concept` / ConceptStudy / ConceptWorkspace deleted entirely.

**Thesis:** the product defines the musical UI primitives and their interaction contracts; the Tutor decides how to compose those primitives into the most useful interface for the current teaching moment. A Workspace kind is the language the Tutor may speak while teaching one musical job — not a page template.

---

## 1 · Workspace kinds

- **Harmony** — explore harmonic vocabulary: tonal centre / scale / mode / chords derived from it / chord construction / voicings / fretboard relationships / a lightweight scratch chord sequence for auditioning.
- **Progression** — develop chord sequences over time: order, movement, alternatives, timing, assigned voicings, voice leading, transformation, comparison.
- **Boundary rule:** Harmony *assembles and auditions* harmony; Progression *develops* sequences. Voicings are *explored* in Harmony chord-focus; *assigned to a sequence* only in Progression. The Scratch Sequence orders chords only to hear them — no durations, no assigned voicings, no variations.
- **Internal seam:** Harmony has separable ScaleFocus / ChordFocus modules — which module owns the primary surface is `f(focus.kind)` — so a later split into `scale` + `chord` kinds is a UI reorganisation, not a rewrite.
- Deferred kinds (recognised, not built): Phrase, Rhythm, Song / Arrangement.

---

## 2 · Session / Branch / Workspace / Draft

- `Session → Branch` (one shared Tutor conversation) `→ many Workspaces`.
- A Branch holds: one **Harmony Exploration** + one **Progression Workspace** (which holds N idea drafts) + `activeDraftId`.
- **Workspace** = a focused editing surface for one object kind within a Branch; navigation + view state, **not a persisted record**.
- **Branch** = a conversation + the set of Workspaces explored within it. A new Branch is created only for a genuine conversational fork ("forget the dreamy version, try it as funk"). `Explore →` / `Develop →` never spawn a Branch.
- `BranchNavigation` kept as secondary navigation for the rare fork — never as musical-artifact navigation.

---

## 3 · Harmony Exploration

Branch-local, autosaved. **No Save, no Artifact, no revisions.**

```
HarmonyExploration = {
  tonalCenter?: { root, scale },            // OPTIONAL — chord-first entry ("Cmaj7") has none
  tuning,
  scratch: [{ id, root, quality }],         // borrowed/chromatic chords allowed; no voicing assignment
  focus: HarmonyFocus,
  pinnedVoicings: [{ chord, voicing }],     // retained during this exploration only
  keptNoteGroups: NoteGroup[],
  provenance,                               // lightweight, non-durable — which concept/prompt started it
}
```

- Chord palette, fret positions, CAGED regions, circle-of-fifths data, degree/interval maps = **backend-derived**, not stored.
- Base chord palette = the chords derived from the current tonal centre (diatonic). Borrowed chords enter via the Scratch Sequence or a Tutor Mutation. The contract is "palette = chords of the tonal centre," **not** "palette = diatonic forever."
- Scratch playback uses the existing deterministic default-voicing resolver.
- `HarmonyFocus = { kind:'scale' } | { kind:'degree', degree } | { kind:'chord', chordRef } | { kind:'voicing', chordRef, voicing }`. `scale | degree` → ScaleFocus module; `chord | voicing` → ChordFocus module. Key is never a Focus (it is the `tonalCenter` context header + an optional circle-of-fifths panel).
- **Focus reset rules:** *change subject* (a new scale/root chosen as a new subject) → reset to `{ kind:'scale' }`. *Transpose* (same exploration, shifted) → Focus transforms (scale→scale, degree N→degree N, D7→E7; scratch IDs stable while values transpose; a concrete voicing Focus degrades to chord Focus if it cannot be deterministically transposed). *Tuning change* → scale/degree/chord Focus survive; a concrete voicing Focus is revalidated and degrades to chord Focus if invalid.

---

## 4 · Progression Workspace

```
ProgressionWorkspaceState = {
  ideas: ProgressionIdeaDraft[],
  activeIdeaId,
  focus: ProgressionFocus,
}

ProgressionIdeaDraft = {
  id, label,
  tonalCenter?: { root, scale },            // OPTIONAL — required for harmonic-function; inherited via Develop→,
                                            //            set by the Tutor, or absent. Never invented.
  tuning,                                    // idea-level, NOT per chord
  chords: [{ id, root, quality, voicing?, durationBeats }],
  keptNoteGroups?: NoteGroup[],
  artifactId?, baseRevisionId?, dirty,       // per-idea Save / revision lifecycle
  provenance?,                               // frozen snapshot of the Harmony scratch + tonalCenter at Develop time
}
```

- Each idea is a **Working Draft** (ADR-0002 sense) with its own save/revision lifecycle. The workspace-level container is **not** a single Working Draft.
- Master-detail UX: idea list + shared detail (editor + focused-step fretboard). Switching the active idea is a Focus action, **not** Develop.
- `ProgressionFocus = null | { kind:'step', stepId } | { kind:'transition', fromStepId, toStepId }`, interpreted within `activeIdeaId`.
- **Focus reset rules:** active-idea change → `null`; reorder → stable step IDs preserve Focus; duration/voicing edit → preserve; delete the focused step → `null`; a transition Focus survives iff both step IDs still exist and still define that transition.
- Timing = per-chord `durationBeats`, default uniform. No rhythm-grid semantics (that is the deferred Rhythm workspace).

---

## 5 · Presentation — Blocks, composition, patterns

- Blocks are the Tutor's composition primitive. Workspace kind constrains the legal vocabulary and per-Block capabilities.
- **Three layers:**
  - **capability** — what a Block can do; fixed by a static `(workspaceKind × blockKind)` table; not Tutor-negotiable.
  - **configuration** — how a Block looks/behaves within its contract; Tutor-set. A few clearly-mechanical view nudges (fretboard fret window, notes-vs-degrees labels) are user-adjustable as **ephemeral non-persisted overrides** that reset on the next Tutor Turn.
  - **composition** — which Blocks, which Pattern, the focal element, emphasis; Tutor-set within validation.
- **Block vocabulary (v1, closed set):**
  - Harmony: `fretboard`, `circle-of-fifths`, `chord-palette`, `chord-inspector`, `voicing-explorer` (has a `caged` view), `degree-map`, `scratch-sequence`, `explanation`, `comparison`, `note-group-overlay`, `candidate-set`
  - Progression: `progression-idea-list`, `progression-editor`, `chord-inspector`, `fretboard`, `voice-leading`, `harmonic-function`, `explanation`, `comparison`, `note-group-overlay`, `candidate-set`
  - Shared component, capabilities differ by container: `fretboard`, `chord-inspector`, `explanation`, `comparison`, `note-group-overlay`, `candidate-set`
  - No generic "chart" / "visualization" Block — named musical Blocks only.
- **Layout patterns (v1, closed set):**

  | pattern | slots | focal |
  |---|---|---|
  | `hero-with-support` | hero 1, support 1–3 | hero |
  | `comparison` | peers 2–4, context? 1 | peers (as a set) |
  | `master-detail` | list 1, detail 1–2 | detail |
  | `explanation-led` | explanation 1, illustration 1–2 | explanation |

  - **Exactly one focal element per composition level.** At most one level of nesting (a `comparison` in a `hero` slot; the nested `comparison` is the top-level focal).
  - The composition **renderer produces real visual hierarchy** — the focal element dominates by size and position; supporting elements are visibly subordinate. A flat grid of equal cards is not a legal rendering.
- `explanation` Block = plain subject-aware Tutor prose. Anchored / on-diagram annotations ("insight notes") deferred.
- CAGED = a `caged` view/config of `voicing-explorer`; a focused voicing cross-highlights on the `fretboard` Block via Focus. There is no `caged-region` Focus kind.
- `harmonic-function` requires an explicit `tonalCenter` on the idea and must not invent one.
- `voice-leading`: assigned voicings → real per-string motion; unassigned → realization-independent harmonic information, or clearly labelled "using default voicings" — never present arbitrary default-shape motion as inherent. No voice-leading solver in v1.

---

## 6 · Turn ownership of presentation

- `TutorTurn` owns an immutable `presentation = { blocks, composition, perBlockConfig }` plus a reference to the musical-state snapshot at that turn.
- Live surface = the turn pointed to by `livePresentationTurnId` (absent → latest turn; set by Restore; advanced by a new turn). A fresh Workspace with no turns → a **deterministic starter composition** built with no AI call.
- A musical edit → composition held, Blocks re-resolve against the new music.
- Preview turn N = turn N's presentation against turn N's musical snapshot. Restore = that presentation live against the current working state.
- The user never manually composes Blocks. Musical edits are direct and AI-free; presentation changes go through the Tutor.

---

## 7 · Tutor per-turn contract

```
TutorTurn response = { message, mutation?, candidates?, focus?, attention?, presentation? }
```

- Resolution order: `mutation` → `candidates` → `focus` → `presentation`.
- `mutation` and `candidates` **may coexist** ("transpose to E minor and give me three darker variations"). But if the requested musical *outcome* is underdetermined, return `candidates` — never secretly pick one and mutate.
- The Tutor authors musical **structure** (roots, qualities, scale, chord order, `durationBeats`, NoteGroups). It **never** authors musical **realization data** (fret positions, derived-shape tunings — deterministic, backend-resolved from the Block's `subject`).
- **Layered validation:** an invalid `mutation` → retry the turn. An invalid `presentation` → retry the presentation once; if it still fails, apply the valid musical change, keep the prior presentation, do not lose the user's musical work. Only tell the user "I couldn't compose that view" if they explicitly asked for that visualization and the failure blocks the answer.
- Context in: the active Workspace state in full + lightweight sibling metadata; `read_progression_idea` / `read_harmony` tools for deeper sibling reads on demand.
- `focus` = workspace Focus; `attention` = the Tutor's one-turn emphasis (renamed from `TutorFocus`) — the two are kept distinct in the schema.

---

## 8 · Candidates

- Generic `CandidateSet<T>` audition primitive, rendered as the `candidate-set` Block. Test: *does the user need to choose among alternatives?*
- v1 kinds: `voicing`, `progression-idea`, `chord-replacement`.
- Keep / Develop / Dismiss. Keep adds to the current Workspace working state — a voicing → `pinnedVoicings`; a progression-idea → a new idea draft; a chord-replacement → replaces that chord in the active idea. No Branch, no Artifact until an explicit Save.
- `progression-idea-list` = the kept working set; `voicing-explorer` = broad browsing of a chord's voicings; `candidate-set` = ephemeral alternatives. Three distinct lifecycles, never conflated.

---

## 9 · Compare

- Transient multi-selection: `compareSelection: EntityRef[]`. Not persisted in v1. The `Relation` entity is retired.
- **Same-kind only, 2–4 peers:** `{scale,scale}`, `{chord,chord}`, `{voicing,voicing}`, `{progression-idea,progression-idea}`. Enforced at multi-select.
- The app renders a deterministic `comparison` pattern (a sensible default Block per peer) with no Tutor call. The Tutor's version adds the explanation.
- "Chord tones against the scale" and similar are overlay / relationship visualizations, **not** comparisons.
- `transition` (voice-leading between two chords) survives as Progression domain state, not a free relation.

---

## 10 · Explore → / Develop →

Both open a linked Workspace in the same Branch; neither creates a Branch.

- **`Explore →`** = "work more deeply on this related thing."
  - on a **chord** → set the Harmony Exploration's `focus` to it; **do not touch `tonalCenter`**; switch the active Workspace to Harmony.
  - on a **scale/key** that differs from the current Harmony `tonalCenter` → **confirm** ("switch your Harmony exploration to X?") — it is destructive to the current exploration, and there is only one Harmony Exploration per Branch.
  - always reopens the existing Harmony Exploration; never creates a second.
- **`Develop →`** = "promote this scratch idea into a deeper authored draft."
  - Harmony Scratch Sequence → if the Branch has no Progression Workspace, create one → add the scratch as a new `ProgressionIdeaDraft` (chords from the scratch, uniform default `durationBeats`, `tonalCenter` inherited from the Harmony Exploration if set, `provenance` = a frozen snapshot of the Harmony scratch + tonal centre) → switch the active Workspace to Progression, active idea = the new one. The Scratch Sequence persists in Harmony.

---

## 11 · Artifacts / persistence

- `Artifact = ProgressionArtifact | SongStudy | Exercise`. **There is no HarmonyArtifact.**
- **Persistent session/branch state is not a saved Artifact.** A Harmony Exploration is branch-local persistent state with no Save flow, no library entry, no revisions.
- `ProgressionArtifact` payload = one idea: `{ title, tonalCenter?, tuning, chords: [{ id, root, quality, voicing?, durationBeats }], provenance? }`.
- Save promotes a `ProgressionIdeaDraft` → a `ProgressionArtifact` + revision, per idea. Other ideas stay as unsaved alternatives.
- Reopening a `ProgressionArtifact` → a fresh Working Draft from its latest revision; it **never** restores old Tutor presentation (the deterministic starter runs). Opened standalone → a new Session + main Branch; opened deliberately into the current investigation → attach to the current Branch. A new Branch only when conversational-fork intent is present.
- Artifacts store music only, never presentation. Revisions capture the musical payload only.
- Saved layouts / presentation presets — deferred. If ever wanted, they are a Tutor presentation preference / personalization, not an Artifact.

---

## 12 · Kept vs killed from #88

**Kept:** backend musical derivation (scale/chord/key positions, CAGED regions, diatonic chords, circle key order, deterministic default voicings) · `NoteGroup` (pitch-class + physical refs) · `materialize` (derived → concrete, used for Keep of a derived voicing/chord) · the turn transaction (`commit_workspace_turn`: pre/post musical snapshots + Tutor messages in one transaction; Undo uses it) · turn preview / restore · `BranchNavigation`.

**Killed:** `concept` kind, ConceptStudy Artifact, ConceptWorkspace payload, its endpoints/catalog/create/update · the uniform resolved model, `block.sources[]`, the frontend adapter, `BLOCK_ACCEPTS` as the model, `composition` rows/{span,priority}, the generic 12-entity bag · the `Relation` entity (`compare` / `transition` as free relations) · the typed `Inspection` union (replaced by per-workspace `Focus`) · the Music bar's contextual block-settings section · `TutorFocus` (→ `Tutor Attention`, one turn only).

---

## 13 · Cutover / migration / delivery

- **ConceptStudy artifacts** → unsupported, no converter (the "start fresh" path exists).
- **`progression` artifacts** → **migrated mechanically**: hoist tuning to idea level — **assert uniform, fail loudly on a per-step tuning mismatch** (never silently change music) — assign stable step IDs, default `durationBeats` uniform, `tonalCenter` absent for legacy data.
- **SongStudy, Exercise** → untouched.
- **Delivery tracks:**
  - **Track 0** — Session / Branch / Workspace shell, the new Block + composition runtime, shared musical leaf components, `Explore →` / `Develop →` with a stubbed Progression target.
  - **Track 1** — Harmony, greenfield.
  - **Track 2** — Progression, brownfield reconciliation.
  - Track 1 before Track 2. A stubbed `Develop →` during Track 1 is fine.

---

## 14 · Deferred / out of scope

Phrase / Rhythm / Song workspaces (ontology noted) · `WorkspaceActivity` enum · Lesson surface · capability-registry abstraction · Practice mode in Harmony/Progression (the `Exercise` Artifact + `ExerciseComposer` stay untouched) · anchored / on-diagram annotations · persisted comparisons · a voice-leading voicing solver · saved layout presets · a cross-block shared playback play-head · tuning reprojection · `HarmonyArtifact` (until a "custom harmonic palette for a song" reuse need is demonstrated).

---

## The one-hop rule

Bounds **UI recursion**, not the Tutor's reasoning. An inspector explains how the object relates to the primary object and may reference further related objects, but it does not recursively grow nested inspectors. The Tutor may reason across the whole theory graph; the UI stays bounded.

Legal: Progression → inspect scale → the scale inspector references its chord tones → click a chord → the inspector is replaced, or `Explore →`.
Not legal: Progression → Scale inspector → Chord inspector → Voicing inspector → Key inspector → …
