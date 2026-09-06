# Guitar Tutor

Guitar Tutor is an AI-guided guitar learning workspace where musical questions
become visual, audible, and editable studies.

## Workspace language

**Session**:
A durable learning thread containing one or more Branches.
_Avoid_: Project, chat

**Branch**:
An independent working path inside a Session, with its own current work and Tutor conversation.
_Avoid_: Tab, fork

**Artifact**:
A named piece of intentionally saved musical work: SongStudy, Progression, ConceptStudy, or Exercise.
_Avoid_: File, document

**Artifact Revision**:
A prior intentionally saved version of an Artifact.
_Avoid_: Draft, turn snapshot

**Working Draft**:
The autosaved, branch-local state currently being explored before or after an intentional Artifact save.
_Avoid_: Artifact revision

**Tutor Turn**:
One learner request and the Tutor response produced from the current Branch state.
_Avoid_: Agent run, chat message

**Turn Snapshot**:
An immutable semantic workspace state associated with a Tutor Turn for preview, undo, or restore.
_Avoid_: Artifact revision

## Study language

**SongStudy**:
An Artifact centered on learning an external song or track.
_Avoid_: Song mode

**Progression**:
An Artifact or local musical object containing ordered chord occurrences and their chosen voicings.
_Avoid_: Chord list, sequence

**ConceptStudy**:
An Artifact centered on understanding or exploring a musical idea.
_Avoid_: Theory page, study mode

**Exercise**:
An Artifact containing a deliberate practice drill or generated musical practice material.
_Avoid_: Lesson

**ConceptWorkspace**:
The composable musical workspace contained by a ConceptStudy and edited through its Branch Working Draft.
_Avoid_: Dashboard, canvas

## ConceptWorkspace language

**Entity**:
A local musical object with independent identity inside one ConceptWorkspace, such as a Key, Scale, Chord, Voicing, NoteGroup, or Progression.
_Avoid_: Node, record

**Relation**:
Typed musical meaning between Entities, initially Compare or Transition.
_Avoid_: Edge, link

**Block**:
A trusted visual representation bound to one or more Entities or Relations.
_Avoid_: Widget, plugin

**Inspection**:
The learner's temporary typed pointer to one musical object or derived detail across compatible Blocks. A chord is identified by Entity id or root and quality.
_Avoid_: Navigation, selection history

**Tutor Focus**:
Temporary attention directed by the Tutor for one turn only, without changing the saved ConceptStudy.
_Avoid_: Inspection, persisted selection

**Tutor Change**:
One coherent, atomic workspace change applied by the Tutor and reversible to the exact pre-turn state.
_Avoid_: Candidate, proposal

**Restore**:
Making a historical Turn Snapshot the new current Working Draft while preserving later conversation.
_Avoid_: Rewind, truncate

**NoteGroup**:
A labelled set of pitch-class or physical note references, persisted in the Working Draft and used as a Block layer for highlights.
