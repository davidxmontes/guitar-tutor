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

## Navigation and visual polish (September 12)

Added a collapsible shared sidebar with Explore, Sessions, My Stuff, song study,
and a return to the current workspace. Mobile navigation starts collapsed.
Styled signed-out entry and Clerk controls; simplified shared card surfaces and
spacing. Existing session and artifact actions are reused.

Verification: production build, changed-file lint, and all 42 browser journeys
passed. Inspected signed-out entry, Explore, and Harmony in the browser, including
mobile sign-in and collapsed navigation at 390px. Navigation acceptance coverage
checks that the active session survives switching sections.

## Theme and musical palette

Reused the existing saved theme preference for the V2 sidebar and signed-out
screen. Shared colors now cover neutral surfaces, sage notes, green roots,
chord-wheel qualities, song-study necks, and Clerk dialogs in light/dark mode.
Fretboard labels and keyboard focus retain independent contrast from note fills.

Verified production build, changed-file lint, and eight distinct browser checks
covering theme persistence, navigation, chord focus, wheel layout, and song study.
Visually inspected both fretboard themes, the dark wheel, and mobile dark sign-in.

## Background Tutor turns (2026-09-12)

The browser submits an authenticated `/api/v2/tutor/jobs` request and receives an
acceptance response immediately. Work runs independently of that HTTP connection.
Reopening a Branch reconnects to its latest job, reloads the saved conversation,
and reads the current Branch before refreshing its music. Failed jobs retain the
question for retry; an active job or repeated request ID does not start a second
turn. The existing turn transaction still checks ownership and revision before
committing the question, answer, and musical change together.

This uses the current single-process Render deployment, matching its in-memory
session store. Job status is retained for up to 24 hours (at most 1,000 Branches);
completed conversation messages remain in the session store. Server restarts and
deploys can interrupt work and clear in-memory sessions. A durable queue and store
are required before scaling to multiple processes or promising restart survival.

Validation: production frontend build passes; changed Tutor/type/browser-test
files pass lint. Backend: 275 passed, the previously documented Classic chord-test
failure remains (run with AUTH_DEV_BYPASS=false and V2_TUTOR_MODEL=gpt-4o-mini so
local development settings do not leak into tests). Background API tests cover
independent completion, duplicate submission, ownership, failure, and retry.
Browser checks close the tab mid-turn, reopen while running, reload the completed
answer without duplicates, and restore a failed question. All six targeted
background/learning journeys pass. Three unrelated layout assertions also fail on
an untouched archive of 3f8b395: the progression neck bottom is 1003.5px against a
1000px limit, and two shared-neck checks still expect a pre-theme 3px stroke rather
than 1.5px. Full lint retains its existing 16 errors and 4 warnings.

## Tutor repair diagnostics (2026-09-12)

Harmony's turn context now explicitly limits candidate kinds to voicings and
instructs the Tutor to explain a requested progression as prose. Full sequence
editing remains in Progression, preserving ADR-0005. Musical-result retries now
include the actual validation error and an explicit non-mutating answer option;
the earlier generic retry could repeat the same forbidden candidate kind.
Background failures log their underlying cause and distinguish validation,
revision conflicts, and provider throttling in the UI.

A scripted regression reproduces the repeated Harmony/progression candidate
mismatch and only corrects it when the validation feedback identifies the issue.
The repair, background, router, and turn suites pass (18 tests). Full backend:
276 passed, the documented Classic chord test still fails. Frontend build passes;
lint retains the same 16 errors / 4 warnings. Live requests were returning HTTP200
from the provider, but the old job handler discarded the exception details, so
this is a reproduced failure path rather than proof of every reported failure.
The exact live failure has not yet been reproduced with its original model output.

## Explicit session entry (2026-09-12)

Every main destination now offers a compact New session chooser with Harmony
(scales, chords, voicings) and Chord progression (arranging and practice).
The active workspace heading names the type instead of saying Workspace;
starting a blank session and starting a branch explicitly say Harmony.
Creation reuses the existing APIs and preserves the previous session.
The native popover supports Escape and outside-click dismissal; its two choices
remain labeled rather than relying on unfamiliar icons.

Browser checks cover desktop/mobile session creation, visible type headings,
returning to the previous session, no horizontal overflow, and keyboard dismissal.
The four existing navigation/foundation/branch journeys and both new session-entry
journeys pass. Desktop and mobile chooser screenshots were inspected. Frontend
build and changed-file lint pass; backend behavior is unchanged.
