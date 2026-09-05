# Tutor changes use snapshot undo

The Tutor applies one validated workspace change directly and atomically rather
than creating candidates that require Keep or Dismiss. The application captures
the exact pre-change state and restores that snapshot as a new present when the
learner chooses Undo, preserving the Tutor conversation and saved Artifact.
