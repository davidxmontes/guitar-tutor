# ConceptWorkspace uses a uniform resolved model and multi-source Blocks

`resolve_workspace` returns one uniform model — `{ entities, relations }` where
every Entity resolves to a shared core (`notes`, `positions`, `tuning`) plus
typed per-kind extras — rather than eight per-kind records with divergent
shapes. A Block binds to `sources: string[]` (Entities and/or Relations, mixed)
instead of a single `source_id`, and one pure frontend adapter,
`adaptBlock(block, resolved)`, turns that list into what each Block draws.
ADR-0001's core still holds: this is a local typed workspace of Entities,
Relations, and Blocks, not a global entity graph. This ADR retires the per-kind
resolved records and, in a following ticket, the `caged` Block kind.

Layer role and comparison are two different axes. `sourceRoles`
(`primary` / `context` / `highlight`) says what each layer is; `comparison`
(`shared` / `changed` / `added` / `removed` pitch classes) describes notes
inside a comparison. One field never expresses both. A `noteGroup` layer is
always `highlight`; two same-kind Entities or a bound `compare` / `transition`
relation produce a `comparison` payload unless the Block's `comparison` setting
is `plain`.

Compatibility is checked at two moments with different strictness. Write time:
`add_block`, `update_view` when it changes `sources`, and `recompose` reject a
source whose kind is not in the target Block kind's `accepts` list, or that does
not exist — an operation must never report success while leaving a Block
rendering nothing. Render time: the adapter tolerantly drops an unsupported
source into `conflicts.skipped` and draws the rest, so a stale draft still
opens. Render-time tolerance never implies write-time acceptance.

Mixed tunings are never reprojected onto one fretboard grid. When a Block's
non-primary sources resolve with a different `tuning` than the primary, the
adapter reports them in `conflicts.tuningMismatch` and the fretboard renders a
distinct "different tuning" state.

`materialize` is the only path from a derived object to editable state. One
operation turns an inspected derived chord (a key's diatonic chord, a
progression step) into a `Chord` Entity, a CAGED region into a `Voicing`
Entity, and a derived progression into a concrete one. Inspecting a derived
object never materializes it.

One SVG `fretboard` component will render scales, chords, voicings, keys, note
groups, comparisons and CAGED (as `settings.mode: 'caged'`), replacing the
windowed-grid, CAGED-grid, and voicing-comparison renderers. That consolidation
lands with the Block rebuilds that follow this ticket.
