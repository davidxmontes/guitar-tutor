# V2 learning experience

Implemented on `feature/v2-learning-experience`, starting at `76165f8`.
The supplied UX HTML and patch informed the direction; their standalone app
and scripted teaching content were not applied to the product.

## Learning flow

The home screen starts with a concrete activity: scales, triads, chord shapes,
or progressions. Circle of fifths, CAGED, free exploration, recent sessions,
and saved work remain accessible. Existing chord/scale search also accepts
phrases such as “A minor pentatonic.”

Harmony has stable root, scale, tuning, and view controls. The learner can
switch between the fretboard, chord shapes, triads, CAGED, circle, and scratch
sequence without a model request. Note labels, root highlighting, fret ranges,
and synthesized pattern practice make a displayed pattern actionable.
Chord cards show real physical diagrams, selection feedback, audition,
pinning, and comparison. Pinned shapes can be reopened on the fretboard.

Triads are derived on the backend from the selected chord and tuning. The
explorer supports four adjacent string sets and all three inversions, with
the actual bass note and chord tones labelled. Shapes are restricted to
frets 0–15 with a span of at most four frets; the UI shows at most twelve
matching shapes. Pitch correctness is not a claim about finger comfort.
Suspended and extended chords do not masquerade as root/third/fifth triads.

Progressions can be practised immediately with tempo, count-in, looping,
guide/metronome selection, a current chord diagram, and the next chord.
Playback follows the real voicings and beat lengths. The existing editor,
harmonic function, voice leading, saved ideas, and exercise flow are retained.

## Tutor and learner control

The Tutor keeps its four validated composition patterns and can arrange a
main explanation or musical view with supporting blocks. `triad-explorer`
is an additional Harmony capability, with bounded string-set, inversion, and shape-count
configuration. A Tutor can teach one shape while the learner can reveal more. The learner can always select a manual view, or return to
the Tutor's layout. A new reply selects the Tutor's view.

The conversation stays in a consistent side panel on desktop and below the
music on small screens, with links between the two. Markdown explanations,
prompts, and persistent message history replace the single-response form.
Beginner/intermediate level, teaching style, and available practice time are
validated and included in the actual model request. Preferences use browser
local storage; unsent drafts use session storage per conversation.

Guidance asks the Tutor for a useful observation, a playable action, and a
listening cue. It should define terms for beginners and connect inversions,
intervals, function, and voice leading for intermediate learners. Practice
advice includes tempo and a self-check; it must not claim to hear or grade
the learner.

Candidates stay auditionable before Keep/Develop. The latest direct musical
change can be undone without deleting the conversation or unsent question.
Undo is disabled after a later local edit, and the restore API also rejects
a stale branch revision. Historical teaching views can be restored without
restoring their old music. API failures preserve unsent questions.

## Scope and verification

No new dependencies, storage migrations, or changes to Song Study's flow.
The reused chord diagram now places fret 1 immediately below the nut,
correcting its previous one-row offset for open-string shapes. Practice
controls retain their existing Song Study defaults.

- Production build passes, with the existing large-bundle advisory.
- Full browser suite: 34 passed, including Song Study and 320px layouts.
  Final selection, draft, and navigation refinements were also retested.
- V2 backend suite: 217 passed. Full backend: 268 passed, with the existing
  Classic chord-router test failure documented in `docs/agents/project.md`.
- Changed V2 files pass lint. Full lint retains the existing 16 errors and
  4 warnings in Classic/shared legacy code.
- `npm test` could not run because the installed workspace lacks the declared
  Vitest executable; this branch currently has no `src/**/*.test.ts` files.
  Browser checks and backend tests cover the new behavior.

Backend checks use `AUTH_DEV_BYPASS=false V2_TUTOR_MODEL=gpt-4o-mini` so local
developer settings do not change auth assertions or the scripted model's
output format. The browser harness fixes its test model format and runs one
worker because journeys share a single in-memory store/dev user. Production
provider settings are unchanged. Automated Tutor checks use a scripted model
at the provider boundary. A live beginner C major lesson was also checked:
the Tutor displayed one matching second-inversion triad (strings 1/2/3 at
frets 0/1/0), explained its notes, supplied a five-minute 60 BPM drill, and
left the music unchanged. This is a representative smoke check, not a general
assessment of model quality. Acoustic output has not been graded.

The local preview uses the normal configured Tutor provider and temporary
in-memory sessions; restarting that preview clears its session data.

## Control styling refinement

V2 now shares one control stylesheet across the learning workspaces, library,
song viewer and exercises. Native selects retain their keyboard and phone
pickers, with inset chevrons, clearer labels, hover feedback and visible focus
rings. Buttons distinguish primary actions and selected views; checkboxes keep
their normal proportions inside a generous clickable label. No dependencies
or custom dropdown interaction code were added.

The same forest green and soft sage surfaces carry through the home cards,
workspace navigation, chord shapes, circle, progression editor and Tutor rail.
Practice controls group transport, timing and audio settings, with compact
phone spacing. Song Study's behavior is unchanged. The production build,
changed-file lint and all 34 browser journeys pass; desktop and 320px screens,
expanded Tutor preferences and the active practice panel were visually checked.

## Connected progression interactions

The progression opens with a fretboard and one selected-chord editor. A sticky,
clickable chord strip replaces the need to find a row-specific Focus button;
arrow keys and Previous/Next beside the fretboard select the same musical Focus.
The mobile strip scrolls horizontally to keep the selected chord visible without
moving the page. Changing a chord updates its strip label, notes, diagram and
Tutor context together. Reordering follows the chord's identity; removing it
uses the backend's normal focus reconciliation. Focus updates appear immediately
and revert to the previous surface when the request fails.

Function cards select a chord, and named voice-leading transitions show both
chords on the neck. Clicking a note in the context layer selects its source
chord. The compact fretboard keeps range controls in a disclosure, plays clicked
notes with the actual tuning, and offers to reveal notes outside the chosen
range. Tutor compositions remain available; directly selecting a chord reveals
the fretboard when the Tutor's current layout has no fretboard.

Progression playback drives the chord strip, fretboard and shape together,
without writing playhead movements to persistent Focus. Selecting a chord or
editing the music exits playback. The editor is disabled during playback;
the Tutor retains the learner's selected target. The audio clock still ticks
at 25ms, while React updates only when the visible chord or count changes.
Song Study keeps its existing practice behavior.

Verification: 36 browser journeys and 217 V2 backend tests pass, along with the
production build and changed-file lint. The connected-flow tests exercise
keyboard navigation without scrolling the fretboard away, mobile overflow,
reorder/remove, linked analysis, range recovery, timed playback, and failed
selection rollback. Final mobile navigation and playback refinements were
rechecked against the interaction and Song Study journeys. The live preview
was also checked by selecting chords and stepping through the neck at phone
size; its existing temporary sessions were preserved.
