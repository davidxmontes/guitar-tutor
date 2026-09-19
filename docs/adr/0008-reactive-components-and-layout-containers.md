# Reactive musical components and bounded layout containers

Supersedes the fixed-pattern and one-nested-comparison restriction in ADR-0006.
The two Workspace kinds, product-owned component capabilities, deterministic
music derivation, turn ownership, revision protection and snapshot semantics
remain in force.

A Composition can use recursive `stack`, `split`, or `grid` containers. Each
uses an `items` slot containing Blocks or containers. The existing four
patterns remain supported for saved Tutor turns and comparison presets. The
contract limits a tree to four container levels and eight components; a split
has two or three children. Block capabilities and config remain validated for
the active Workspace at every depth. No HTML, CSS, JavaScript or physical
positions are accepted as new layout capabilities.

The frontend renders containers based on available component width. Columns
collapse on narrow surfaces; the fretboard and shape strips scroll within
their own bounds. Supporting content is not truncated to a fixed-height panel.
The Tutor can place named, trusted voicing diagrams or referenced progression
step diagrams beside other representations without adding another page.

Persistent musical selection is still the typed backend Focus. The interaction
context routes semantic selections to existing edit endpoints and owns only
transient voicing preview. Harmony shape selection and Progression step
selection can display already-resolved data optimistically; failed writes
restore the prior surface. Playback remains a transient display target and
never overwrites learner Focus. Selecting a progression chord or transition
no longer switches away from the Tutor's layout.

Component teaching guidance lives in `backend/app/v2/component_skills/*.md`.
A compact workspace-scoped catalog is sent with turn context; read-only
`list_component_skills` and `read_component_skill` tools retrieve details on
demand. The capability table remains the enforcement boundary, not the place
for an expanding pedagogical prompt. Practice guidance describes controls
embedded in the fretboard and progression strip, not a fictional layout block.

The optional scale representation is a compact spelled pitch/degree strip,
not an engraved musical staff. Selecting its notes highlights the same pitch
class across the neck. Physical diagrams use trusted resolved data; Tutor
voicing Focus must match a deterministic catalog, triad, or CAGED shape.
