# Reactive workspace implementation and verification

Implemented on `feature/v2-learning-experience`.

## Architecture

The existing typed musical state and revision-checked edits remain authoritative.
A semantic interaction context routes selection and scopes transient shape previews.
Selection does not call the Tutor. Optimistic physical/step selections roll back
when persistence fails. Playback remains separate from persistent selection.

The Composition contract now accepts recursive stack/split/grid containers, with
four container levels and eight component leaves maximum. Legacy patterns still
render and restore. Workspace capabilities and every nested config are validated.
Responsive containers use available width, and shape strips/fretboards scroll
inside the page. See ADR-0008 for the contract and migration decision.

## Component skills and Tutor

Nineteen Markdown guides cover the musical components and embedded practice
controls. A compact workspace catalog and read-only list_component_skills /
read_component_skill tools replace the prompt's detailed component mappings.
The Tutor can arrange related representations without selecting a fixed page.
Chord diagrams can bind a catalog voicing label or progression step reference.
Tutor-selected physical Focus must match a catalog, triad or CAGED shape.

## Resulting interactions

- Wheel root changes preserve the scale; wheel chord selection preserves the key.
- Pitch-strip selections highlight the same degree across the fretboard.
- Triad/CAGED/voicing diagrams select directly, with transient hover preview.
- Selected shapes fit the fretboard automatically; manual range changes still work.
- Pin retains a visible physical diagram; Compare shows physical voicing peers.
- Progression step and transition selection retain the Tutor composition and
  synchronize diagrams/fretboard. Transition views show both endpoints.
- Progression editors offer clickable trusted voicing alternatives.

## Verification

- Frontend production build: passed (existing large-bundle advisory).
- Browser suite after layout cleanup: 40 passed, including two-ring keyboard
  navigation and component sizing at 320, 768, 1024 and 1440px.
- New semantic interaction unit check: passed.
- V2 backend suite: 221 passed.
- Full backend with AUTH_DEV_BYPASS=false: 271 passed, 2 failed. Both failures
  reproduce in an unchanged HEAD archive: removed legacy get_voicing_positions
  patch target, and the full-suite OpenRouter saved-lookup test. The latter
  passes when the V2 suite runs independently.
- Full frontend lint: existing 16 errors / 4 warnings; changed files pass lint.
- Browser coverage includes 320px overflow, exact frets, failed-save rollback,
  mode preservation, wheel chord selection, local controls after Tutor layout,
  progression linkage, history, drafts, Undo, Song Study and Exercise.

## Limits

The compact scale component is a spelled pitch/degree strip, not engraved staff
notation. Extended chords use the existing deterministic quality and voicing
catalog; this change does not add physical voicings for every extension/tuning.
External model behavior was tested through scripted provider-boundary models,
not a live-provider pedagogical evaluation. Older generic comparison/overlay
blocks keep their existing limitations; learner Compare, bound chord diagrams,
and retained fretboard note-group layers remain available.
