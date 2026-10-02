# Guitar Tutor: learning layout review

The learner approved **A: Study desk** and its measure-navigation/kept-passage refinements for [issue #134](https://github.com/davidxmontes/guitar-tutor/issues/134). The implementation uses that shared frame and retains existing focus practice. **B: Bottom conversation** remains a comparison only. The original observations and alternatives below record the design decision; the HTML is a prototype, not the application.

**Recording/Tutor refinement:** SongStudy reserves the companion column for Tutor. A compact Recording button beside the playback selector opens a non-modal floating player; Expand reveals timing, measure selection and calibration in the same panel. Desktop keeps the popup within the music stage, and phones use a bottom sheet with compact and expanded sizes. One scroll area keeps settings reachable, with Close and Expand/Compact always visible. Closing pauses playback and returns focus to the launcher without resetting the player, its position or the alignment draft. Opening mobile Tutor temporarily hides and pauses the recording. This supersedes the video-above-Tutor placement in the original prototype below.

## What the current screens reveal

- Harmony at 1440px starts both music and Tutor around **y392**. At 1024px, Tutor starts around **y1439**, after the musical surface. Asking a question therefore requires a different navigation pattern at different widths.
- SongStudy at 1728px with Tutor open has a 1232px content region, but nested regions leave roughly **476px for the score and 260px for the fretboard**. At 1440px with Tutor open, the video stacks above the score: score starts around **y1002** and fretboard around **y1416** in a 900px-high viewport.
- Both workspaces already share `TutorPanel`. Harmony houses it in an always-visible 300px card; SongStudy provides a closable, resizable dock and a bottom sheet below 1200px. The inconsistency is primarily the surrounding layout.
- Harmony’s octave neck needs at least **612px**. Its circle layout puts that neck inside a nested split even when the available column is much narrower. The separate Fretboard view already handles this better by giving the neck a full-width row.

The problem is allocation: navigation, controls, and narrow columns consume space before the learner reaches the music.

## A · Study desk — recommended

Use compact global navigation, then one subject toolbar. Below it, keep a wide musical stage beside one companion column.

**Harmony:** keep the complete Tutor-composed teaching surface inside the stage. In the default circle arrangement, place circle and scale/chord context together, with the neck spanning the stage below. Chord-shape choices remain close to the neck they affect. Comparisons and other Tutor arrangements remain possible.

**SongStudy:** place passage/score and fretboard in broad rows in the stage. Put the recording above Tutor in the companion column. Avoid separate columns for video, score, fretboard, and chat. The selected passage and playback controls stay close to the score.

The companion column has one conversation scroller and an anchored composer. Resize or close Tutor without scattering its controls elsewhere. Closing Tutor preserves the recording and reclaims the whole column only when it has no recording to display. Do not shrink the musical stage below a useful width to preserve the column; change layout instead.

**Mobile:** use one musical flow, with the current passage or active representation first when using the guitar guide. When using a recording, keep a compact player directly above the passage. SongStudy uses a Score/Fretboard switch that preserves selection and playback controls, so each gets useful space. Harmony retains its musical view switch. Tutor opens a consistent non-modal sheet with a visible close control. Keep playback accessible. The actual active YouTube player must remain visible while playing; pause playback before Tutor or the keyboard covers it, retain the passage selection, and show a clear resume action after dismissing the sheet.

**Tradeoff:** the right column costs some width, but it gives both workspaces a stable relationship between music, recording, and conversation.

## B · Full-width music + bottom conversation

Keep the musical Composition full-width and open Tutor in a resizable bottom tray. This protects long necks, measures, and side-by-side comparisons while retaining the same spatial relationship on desktop and mobile.

Use the same Tutor header, context, conversation, and composer as A. Preserve visible recording playback above the tray; pause if the tray covers the player.

**Tradeoff:** the tray consumes vertical room. It is useful for comparison and occasional questions, but weaker when score and fretboard must remain visible together.

## C · Focus-first

Give one active representation most of the screen: a passage during practice, a neck during note exploration, or a shape during fingering work. Disclose supporting references nearby; open Tutor on demand.

**Tradeoff:** this reduces distraction but hides simultaneous musical relationships. Offer it as an explicit practice choice, not the default learning workspace. Keep the actual recording visible during playback.

## Place controls according to the task

Frequency is inferred from the learning workflow, not measured usage.

| Control or material | Expected use | Placement |
|---|---|---|
| Play/pause, tempo, loop, passage selection | Frequent during practice | Compact strip adjoining score or instrument |
| Note/chord/shape selection | Frequent during exploration | Directly on the musical representation |
| Current song, key, scale, selected passage | Frequent orientation | Compact subject toolbar; brief Tutor context |
| Tutor question and response | Frequent supporting action | Consistent dock/sheet; composer always reachable |
| Recording | Frequent when selected as source | Visible companion area on desktop; visible in mobile flow |
| Shape alternatives, scale degrees, chord tones | Task dependent | Supporting area next to or below primary music |
| Pinned shapes, Scratch Sequence | Intermittent reference | Expandable shelf with counts |
| Tuning, exact fret limits, teaching preferences | Occasional setup | Nearby disclosure or settings menu |
| Keep a passage to revisit | Deliberate return point | Beside selection; a small collection within the song |
| Save a song or authored progression | Occasional transitions | Subject actions menu |

## Rules shared by all options

- Product owns the stable frame; Tutor retains stack, split, grid, and comparison freedom inside Harmony’s Composition.
- Collapse splits according to the space their musical representations need. Preserve note spacing and usable touch targets.
- Selecting music updates linked representations without changing layout or losing the selection.
- Standardize Tutor name, contextual selection, launcher, close/Escape behavior, resize affordance, focus return, conversation and draft preservation, and anchored composer. Retain song-specific sources and Harmony-specific Candidates/restore controls.
- Remember the learner’s Tutor choice. Start with dock visibility and size; arbitrary panel dragging is unnecessary for these problems.

**Limits:** observations reflect current code and inspected sample/provider states. Validate expanded controls, long conversations, recording playback, and narrow screens before completing implementation.

## Refinement: practising and keeping passages

The learner values playback and wants to keep a few passages deliberately for later. A saved practice item with completion tracking does not serve that need.

The primary flow is select → play → slow down → loop → move on. Keeping a passage is optional and does not interrupt playback. Use **Keep passage** beside the selected material, with a default section/measure label. A small **Kept passages** collection belongs to the song. Reopening a passage selects it in the original score and linked fretboard, with its recording and Tutor context available. Removing a bookmark does not remove any music. There is no completion checkbox.

The existing named song ranges already store passage references on the SongStudy; this proposal simplifies that interaction. Independent Exercises are different: they copy notes and rhythm into a separate drill with a required title and goal. Remove that creation form from the everyday practice path; retaining a secondary route for intentionally authored drills can be decided separately.

Current **Finished** status means that playback reached its end with looping disabled. It is not learning progress. Label this **Playback ended** if retained. The reviewed flow has no completion tracking to migrate.

The mockup now demonstrates keeping, revisiting, and removing passages without creating independent practice items. Bookmarks in this visual are temporary demonstration state; production persistence is unchanged.

## Refinement: restore direct measure navigation

Retain the previous overview's useful section grouping and numbered measure jumps. Place a compact map immediately above the score, occupying the stage width. Section names stay visible; only the current section's measure buttons expand. This preserves navigation while leaving the score and fretboard their full width.

Selecting a measure brings it into the readable score. The selected passage is highlighted, and small bookmark marks identify kept passages. These are navigation and selection signals, not completion indicators. Full score remains a separate reading view.

On phones, show four usable measure targets with previous/next controls. A **Select range** action supports choosing first and last measures across pages; Shift-click also works on desktop. Keeping a selection retains its full measure range, and revisiting it restores that range in context.
