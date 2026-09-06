# Tutor changes use snapshot undo

The Tutor applies one validated workspace change directly and atomically rather
than creating candidates that require Keep or Dismiss. The application captures
the exact pre-change state and restores that snapshot as a new present when the
learner chooses Undo, preserving the Tutor conversation and saved Artifact.

**Amended by the Harmony + Progression re-carve.** A Tutor Turn now snapshots
the pre-turn musical state, for Undo, separately from the teaching surface it
produced. The live surface is a pointer to a turn, not a stored copy; Restore
moves that pointer and replays the chosen turn's surface against the current
musical state.
