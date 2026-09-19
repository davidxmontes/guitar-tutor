# Guitar Tutor

Guitar Tutor is an AI-guided guitar learning workspace where musical questions
become visual, audible, and editable studies.

## Workspace language

**Session**:
A durable learning thread containing one or more Branches.
_Avoid_: Project, chat

**Branch**:
A conversational direction inside a Session — one shared Tutor conversation and the set of Workspaces explored within it.
_Avoid_: Tab, fork

**Workspace**:
A focused editing surface for one kind of musical work within a Branch. Its kinds are Harmony and Progression. It is navigation and view state, not a saved record.
_Avoid_: Dashboard, canvas, page

**Artifact**:
A named piece of intentionally saved musical work: SongStudy, Progression, or Exercise.
_Avoid_: File, document

**Artifact Revision**:
A prior intentionally saved version of an Artifact.
_Avoid_: Draft, turn snapshot

**Working Draft**:
The autosaved, branch-local editable state that a save promotes into an Artifact. A Progression Workspace holds one Working Draft per idea.
_Avoid_: Artifact revision

**Tutor Turn**:
One learner request and the Tutor response produced from the current Branch state.
_Avoid_: Agent run, chat message

**Turn Snapshot**:
An immutable record tied to a Tutor Turn — the musical state before the turn, for undo, and the teaching surface it produced, for preview and restore.
_Avoid_: Artifact revision

## Study language

**SongStudy**:
An Artifact centered on learning an external song or track.
_Avoid_: Song mode

**Progression**:
An Artifact or a working idea containing ordered chord events, each with a duration and an optional chosen voicing.
_Avoid_: Chord list, sequence

**Exercise**:
An Artifact containing a deliberate practice drill or generated practice material.
_Avoid_: Lesson

**Harmony Exploration**:
The branch-local autosaved state of a Harmony Workspace — an optional tonal centre, a Scratch Sequence, and retained voicings and note groups. It has no save, no Artifact, and no revisions.
_Avoid_: Harmony study, harmony artifact

## Workspace content language

**Focus**:
The learner's current working target inside a Workspace, typed to that Workspace's kind. It drives contextual controls and answers what "this" means to the Tutor. It resets only when its referent is structurally gone or the subject changes.
_Avoid_: Inspection, selection history, Tutor Attention

**Tutor Attention**:
Temporary emphasis the Tutor directs for a single turn, never persisted.
_Avoid_: Focus, inspection

**Scratch Sequence**:
A Harmony Workspace's lightweight ordered list of chords, used only to audition how harmonic options sound together. It carries no timing and no assigned voicings.
_Avoid_: Progression, mini-progression

**Block**:
A trusted visual placed by the Tutor into a Workspace's Composition. What a Block can do is fixed by the Workspace kind; how it is arranged and configured is the Tutor's choice.
_Avoid_: Widget, plugin

**Composition**:
The arrangement of Blocks the Tutor produces for one Tutor Turn — a bounded tree of stack, split or grid containers, or a retained layout Pattern preset. It belongs to the turn, not to saved music.
_Avoid_: Dashboard, layout file

**Pattern**:
A retained layout preset, such as hero-with-support, comparison, master-detail, or explanation-led. New Compositions can use recursive stack, split and grid containers instead; patterns are no longer the limit on Tutor presentation.
_Avoid_: Template, grid

**Candidate**:
An ephemeral, auditionable alternative the Tutor offers — a voicing, a progression idea, or a chord replacement. It becomes working state only when the learner Keeps or Develops it.
_Avoid_: Proposal, draft, Tutor Mutation

**Tutor Mutation**:
One coherent, atomic musical change the Tutor applies directly to the current Harmony Exploration or active Progression idea, reversible to the exact pre-turn state.
_Avoid_: Candidate, proposal, patch

**NoteGroup**:
A labelled set of pitch-class or physical note references shown as a highlight layer. A turn-scoped NoteGroup lives with one teaching surface; a kept NoteGroup is retained in the Workspace's working state.
_Avoid_: Selection, annotation

## Navigation language

**Explore**:
The gesture that opens a related musical object as its own Workspace focus — lateral movement into something the learner wants to work on more deeply. It reopens the existing Workspace rather than creating a duplicate.
_Avoid_: Develop, branch, navigate

**Develop**:
The gesture that promotes a Harmony Scratch Sequence into a new Progression idea, recording where it came from. Distinct from Explore.
_Avoid_: Explore, save, branch

**Restore**:
Making a historical Turn Snapshot's teaching surface the live one again, against the current working state, while preserving later conversation.
_Avoid_: Rewind, truncate
