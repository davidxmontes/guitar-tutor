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
