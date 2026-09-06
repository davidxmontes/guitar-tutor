# ConceptStudy uses a composable workspace

**Superseded by [ADR-0005](0005-two-focused-workspace-kinds.md) and
[ADR-0006](0006-tutor-composed-presentation.md).** The single composable
ConceptWorkspace is replaced by two focused Workspace kinds (Harmony,
Progression); `concept` as a kind, the ConceptStudy Artifact, and the
ConceptWorkspace payload are deleted. Kept below as design history.

ConceptStudy is a local typed ConceptWorkspace composed from musical Entities,
Relations, and trusted Blocks rather than a fixed visualization page or a
global entity graph. This lets different questions reuse synchronized musical
truth without turning SongStudy or every Artifact into a generic workspace.
