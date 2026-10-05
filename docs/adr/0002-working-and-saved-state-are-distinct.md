# Working and saved state are distinct

The Branch Working Draft is the current autosaved truth, Artifact revisions are
created only by intentional saves, and Tutor Turn Snapshots provide preview and
restore history. Keeping these boundaries separate makes experimentation
durable without turning every interaction into a permanent saved revision.

**Amended by the Harmony + Progression re-carve.** "Working Draft" now means
the editable precursor to one Artifact specifically: a Progression Workspace
holds one Working Draft per idea, each with its own save and revision
lifecycle. A Harmony Exploration is branch-local autosaved state with no
Artifact lifecycle at all (see [ADR-0007](0007-harmony-explorations-are-not-artifacts.md)).

**Clarification for independent Riffs (spec #143).** A Riff editor holds a local
editable copy until an intentional Save creates or updates its independent
Artifact. The copy has no Branch, autosave or Tutor state. Subsequent changed
Saves record prior Artifact Revisions through the existing ownership and
optimistic-concurrency rules. Opening a Riff in its editor creates no Session or
Branch and does not add a third Workspace kind. Unsaved navigation requires an
explicit discard decision; save failure retains the local copy.
