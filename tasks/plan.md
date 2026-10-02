# Plan: Chord Explorer

Status: implemented and verified on feature/chord-explorer from main-v2 e287327. [Draft PR #132](https://github.com/davidxmontes/guitar-tutor/pull/132); no merge or deployment.

Tracking: [spec #130](https://github.com/davidxmontes/guitar-tutor/issues/130), [implementation #131](https://github.com/davidxmontes/guitar-tutor/issues/131). Native sub-issue linking was blocked by automatic approval review as an unapproved hosted-service metadata change; no retry or workaround was attempted.

Grounded in `main-v2` merge `e287327` (PR #129), inspected through the equivalent feature tree at `09f9268`. Implementation should branch from the latest `main-v2`, preserving existing working copies and local servers.

## Outcome and agreed scope

A learner can select a guitar fingering without knowing its name, understand its notes and possible chord interpretations, hear it, and explore useful changes or other voicings.

The user confirmed one Chord Explorer, including complete chords and partial voicings. A separate free-note mode was considered and removed from scope. There is at most one selected fret per string. Previewing a result never changes the input; applying a concrete suggestion does.

Use the existing Harmony Workspace. It already owns chord construction, voicings, tonal context, pinned shapes, and the Scratch Sequence. This is a new entry/view within Harmony, not a third Workspace kind or a new Artifact. Core exploration needs no model call, web search, or new service.

## Proposed user experience

### Start and select

- Add a discoverable **Find a chord on the fretboard** action on Explore and a **Chord Explorer** view inside Harmony. Start with no required chord name or key. An existing focused voicing can seed the explorer through an explicit action.
- Show a large editable neck and one compact result panel alongside it. On small screens place results directly below the neck; scrolling stays inside the neck. Keep the input and main result close together rather than building a long stack of panels.
- Make every string/fret position in the visible window selectable, including open strings. Selecting another fret on a string replaces its previous fret; selecting the current position again removes it. Omitted strings are muted, never implicitly open.
- Provide a small selected-note strip, Hear, Clear, Undo, and existing fret-window/tuning controls. Put optional key context and less-used controls in a disclosure.
- Selected dots are solid. Suggested additions are outlined; moved/removed notes have a distinct visual treatment and a text explanation. Shape, text, and contrast carry meaning as well as color.
- Selecting one note shows its pitch; two notes show the interval and qualified possibilities. Do not demand a full six-string chord to begin exploring.

### Understand the shape

Show the selected physical notes, distinct chord tones, actual lowest sounding note, and possible names. When an interpretation is chosen, label the root and intervals on those same positions. The bass comes from tuning plus fret, not string number or click order.

Separate exact matches from incomplete interpretations. For example, C–E–G is C major; C–E can belong to several chords and must show which notes are missing. C–E–G–A can be C6 or Am7; retain both interpretations rather than asserting one correct name. Rootless/omitted-tone interpretations must explicitly say which tones are absent. Do not assign a made-up confidence percentage.

With no match, retain the useful note/interval display and say that no exact match exists in the supported chord vocabulary. One note per string does not guarantee an ergonomic fingering; do not certify arbitrary stretches as easy or playable.

### Explore suggestions

Use three small, contextual groups, with a few results initially and an option to reveal more:

1. **Complete this chord:** add a missing tone while keeping the selected notes. Highlight available locations, distinguishing additions on muted strings from replacements on occupied strings. A completion must not silently remove an existing note.
2. **Change its sound:** offer nearby changes such as a seventh, ninth, suspension, or major/minor third. State the exact addition, removal, or move, e.g. “Add B for Cmaj7.” Generate these from the selected interpretation; avoid unrelated generic recommendations.
3. **Other voicings:** reuse available catalog/triad/CAGED shapes for the chosen chord, ordered by proximity to the current fret region. Clearly distinguish an inversion from a different chord. Do not claim to enumerate every possible fingering.

Hover/focus previews must have an equivalent tap action. The preview is a concrete proposed final shape before Hear or Apply is enabled; a collection of alternative note locations is not itself a playable voicing. Applying it is one deliberate edit, reversible with Undo. Editing the original shape dismisses any stale preview.

Once the learner chooses an interpretation, reuse **Pin shape**, **Add chord to scratch**, and existing **Develop** behavior. Adding to scratch adds the harmonic chord only: scratch intentionally does not store assigned voicings. Pin retains the exact fingering. Ambiguous shapes require an interpretation before a named pin or scratch chord is created.

## Engineering approach

### Input and persistence

Extend the typed Harmony Focus with an unnamed physical-shape case: zero to six unique-string positions, with an optional explicitly chosen chord interpretation. Reuse PhysicalRef and the Harmony tuning; do not require an invented ChordRef just to represent unknown notes. Zero notes is the legitimate empty editor state, not a VoicingValue.

The current shape and chosen interpretation autosave with the Branch. Switching display views or refreshing preserves this Focus; explicitly exploring another musical subject may replace it under the existing Focus rules. An input change clears an interpretation that no longer fits. Retuning preserves the selected frets and recalculates sounding notes; it invalidates incompatible interpretations and previews. Existing pinned shapes retain their stored tuning.

Preview, keyboard location, and the local Undo history remain transient. Do not persist result lists, hovered suggestions, derived MIDI/pitch classes, or audio state. Older Branches default to their existing Focus; no database table or hosted migration is expected. Update backend/client readers together for the new Focus case, including Tutor snapshot/Restore handling.

### Deterministic musical derivation

Add a small pure matcher beside the existing Harmony derivation. Reuse CHORD_INTERVALS, spelled_notes, pitch_class, and trusted voicing resolvers. For each supported root/quality, compare its normalized pitch-class set with the input; preserve original physical positions and octave information separately for playback and bass/inversion.

- Exact: equal distinct pitch-class sets. Doubled notes neither inflate evidence nor prevent a match.
- Incomplete: selected tones are a proper subset of a formula. Start suggestions from at least two distinct tones, with at most two missing tones; name every omission, including a missing root. This bounds the first version's suggestions without rejecting or truncating the input.
- Alteration: an explicitly described change relative to the chosen interpretation, not an exact match.

Order results by match class, number of missing tones, then applicable tonal/bass context and a stable tie-break. Key context may reorder valid interpretations but must never suppress out-of-key matches. Use the existing formula vocabulary initially; explain unsupported qualities rather than silently guessing. Normalize compound intervals modulo 12 for matching, while retaining their spelled degree names for display.

Resolve physical alternatives only for the inspected interpretation, not for every theoretical candidate on every click. Reuse the existing Harmony response/resolve paths rather than adding a general recommendation framework.

### Interaction and integration

Extend FretboardDiagram with the minimum controlled editing capability needed to select unoccupied positions; preserve its existing read-only callers. Keep network/persistence logic in the caller. Reuse PhysicalChordDiagram, note chips, and audio primitives. One audition owner stops the previous preview on another audition, apply, navigation, or unmount.

Immediate local highlighting must remain responsive during saves. The current Harmony editor ignores gestures while busy, so routing every click through it unchanged would lose rapid input. Keep a pending shape draft, serialize/coalesce writes, and only show derived results for the current input. Retain an unsaved draft on failure with Retry; ignore late responses after navigation/account changes. Preserve ownership and conflict checks; verify that the new edit contract can reject a stale client revision rather than relying only on a server-side read/write race check.

Tutor reads the current input and derived interpretations through the existing Harmony context. Asking about “this shape” must work without invoking a model on ordinary fretboard gestures. Preserve existing trusted-shape restrictions for model-authored Focus; allowing the learner to draw a shape must not accidentally grant the model unrestricted physical mutations. A new agent workflow or general-purpose editor tool is outside this feature.

## Proposed delivery slices

These are planning slices, not published implementation tickets. The repository's GitHub Issues remain the task-list target once the execution spec is settled.

| Slice | Observable result / acceptance | Verification and likely areas | Depends on |
| --- | --- | --- | --- |
| 1. Select and identify | Enter from Explore, draw an unnamed shape, toggle/replace notes, hear it, and see exact/qualified names without a model call. | Pure matcher cases plus one browser path. Harmony Focus/resolver/API types, editable neck, Explorer caller. | None |
| 2. Complete or alter | Inspect suggestions with explicit missing/changed tones; preview, hear, apply, and undo a concrete shape without accidental input changes. | Matcher/suggestion cases and interaction tests. Same resolver and Explorer surface; existing audio helpers. | 1 |
| 3. Explore voicings | Inspect existing alternate shapes, choose an interpretation, pin an exact shape, or add the chord to scratch without overwriting the source during preview. | Catalog reuse and browser flow through existing pin/scratch operations. Voicing and comparison components only where needed. | 2 |
| 4. Resume and finish | Reopen the saved shape; retune safely; survive rapid edits, failures, and navigation; Tutor sees the right notes; desktop/mobile/keyboard flows remain usable. | Persistence/conflict tests, scripted Tutor context, responsive browser inspection and complete repo gate. | 1–3 |

Keep each slice demonstrable. Split implementation tickets further only where actual file/contract boundaries justify it. The new Focus contract and all affected consumers must land together; do not merge an intermediate state that breaks existing Branch loading or Tutor snapshots.

## Verification plan

- **Pure musical logic:** exact major/minor/extended chords; repeated octaves; ambiguous C6/Am7 and symmetric formulas; partial/rootless interpretations; empty/single-note/dyad cases; sharp/flat spelling; alternate tuning; lowest MIDI bass; unsupported quality/no-match behavior. A partial result must never be presented as exact.
- **Owned Harmony API/state:** input bounds and unique strings; round-trip shape/interpretation; old Branch compatibility; tuning changes; stale edits; account isolation; Tutor read/snapshot/Restore compatibility. No live model or hosted store is required.
- **Browser:** mouse, touch, and arrow-key navigation with Enter/Space toggling and one keyboard entry point for the grid; rapid clicks under delayed responses; preview without mutation; audition/apply/Undo; refresh; save failure/Retry; leaving/reopening; pin/scratch behavior. Inspect desktop and 320px layouts in light/dark themes, including internal fretboard scrolling and access to results.
- **Final gate:** frontend lint, production build, unit tests and Playwright; backend pytest. Reuse existing harnesses. Inspect the actual composed screen, not only isolated components.

## Deliberately deferred

Free-note mode, microphone/audio recognition, automatic finger assignments or hand-stretch guarantees, exhaustive voicing generation, arbitrary polychord/non-chord-bass analysis, custom tunings beyond the existing UI, SongStudy editing, automatic next-chord/progression recommendations, and AI-generated matching. None is necessary for the selected-shape exploration loop.

## Planning handoff

Confirmed: one physical Chord Explorer; complete and partial voicings; interpret/complete/alter/find other voicings; non-destructive previews and explicit Apply.

Repository constraints: backend-owned music theory; Harmony/Progression boundaries; no new Artifact for Harmony; reusable musical display primitives; keyboard/touch parity; existing ownership/revision protections; Ponytail restraint.

Implementation proposals above (precise ranking, omission ceiling, state extension, delivery slices, and test seams) are recommendations, not claims that the user separately chose every detail. The user approved implementation of this plan. Merge and deployment remain separate actions. No ADR is needed for the proposed reuse of existing boundaries.

## Progress

- Core shape editing, deterministic discovery, concrete suggestions, preview/apply/Undo, pin/scratch reuse and workspace refresh restoration implemented.
- Final gate: 455 backend tests (two existing dependency warnings), 23 frontend unit tests, lint and production builds passed. Whole-app browser suite: 99 passed; final focused browser suite after hardening: 15 passed, including six Chord Explorer journeys.
- Verified musical ambiguity/rootless shapes, enharmonic key changes, tuning, ownership, snapshots, stale client revisions, delayed/failed saves, navigation during queued writes, refresh, preview/apply/Undo, pin/scratch, keyboard navigation and 320px dark layout. Real local app also exercised in the in-app browser.
- Inline review removed duplicate formula resolution and circular imports, reused existing voicing derivation, corrected preview layer order and restricted refresh changes to the Explorer. An initial regression restoring unrelated workspaces was fixed before the passing whole-app browser run.
- No new dependencies, hosted changes or live model calls. Local preview uses memory storage: refresh/reopen works while the local API runs; restarting that disposable API clears its sessions. Production persistence continues through the existing owned Branch store.
- Draft PR #132 targets main-v2. Local frontend runs at http://localhost:5312/v2 with API on 8318. Merge and deployment require separate authorization.
