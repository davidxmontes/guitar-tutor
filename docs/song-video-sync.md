# SongStudy video synchronization

## Objective and scope

Attach a user-selected YouTube recording, confirm its arrangement, align score
positions manually, play a selected passage, follow actual video time, and
reopen the saved setup. This is one feature on `feature/song-video-sync`, based
on `main-v2` at `c91ba56`. Existing dirty checkouts are untouched. The detailed
user brief authorizes routine design/implementation decisions and a draft PR;
no merge, deployment, hosted changes, paid service or production credentials.

## Decisions

- SongStudy remains an Artifact. Add optional `video_alignment` to its existing
  JSON payload; no new table/store or import pipeline. Older songs default to
  no video. A deliberate Save saves the song to My Stuff, with existing owner,
  revision-conflict and Artifact History behavior. Playback never writes data.
- A binding is `{video_id, recording_confirmed, passages}`. A passage is
  `{id, label, anchors}`; an anchor is `{measure_index, beat_index, edge,
  video_seconds}`, where `edge` is `start` or `end`. Indices are zero-based and
  refer to the same selected voice that the tab renders. Confirm the chosen
  recording/arrangement before saving; replacement requires reconfirmation and
  a fresh alignment. The API accepts only an eleven-character YouTube ID.
- Within a passage, score positions and video timestamps strictly increase.
  Interpolate between anchors using cumulative rational beat durations in
  quarter-note units, retaining rests. Do not infer bar length from 4/4, fill
  pickups, or use the practice BPM. Different anchor slopes account for tempo
  changes/drift; tell users to add anchors there. Imported tempo automation has
  no established position contract and is not an automatic alignment source.
- Never extrapolate outside an anchored interval. One anchor can locate its
  exact score boundary but does not establish a following span. Missing rhythm
  or empty measures block interpolation across that gap. Clearly label bounded
  intervals as estimates and other sections as unaligned.
- Passages may revisit the same written measures, with non-overlapping video
  intervals. They explicitly identify performance occurrences. Do not infer
  repeats from enrichment labels or shape counts. Ambiguous score selections
  require an occurrence choice, never an arbitrary first match. Added intros,
  cuts and alternate arrangements can remain as gaps between passages.
- Existing measure/range/beat selection remains the learner's selection.
  Video playhead is separate transient state derived from reported time; it
  cannot feed back into seek commands. Selection-to-seek happens only through
  a user action. Follow the playhead in the existing tab/shape/fretboard view.
- Use one playback-source choice. Selecting video exits synthesized practice;
  switching back pauses/destroys the video before practice audio can start.
  Reuse the existing range selection for optional loops where a complete range
  maps within one occurrence. Native video controls own pause/resume/seeking;
  the song control starts from a selected score position. No parallel generic
  transport framework.
- Calibration is a disclosure beside the player: select score position, pause
  or seek the video, mark its start/end here, correct/remove anchors, save or
  discard the draft. Keep editing recovery local and use Artifact History for
  saved revisions. No permanent timestamp table. On save conflict, retain the
  draft and explain how to reload/discard rather than overwriting another edit.

## Player boundary

Load the supported IFrame API once and create one visible player per mounted
song. Preserve native controls, branding, links and ads; never cover or extract
the video. Use the actual origin and ordinary browser Referer, inline playback,
no initial autoplay, and a viewport at least 200×200 even on mobile. Keep the
player visible during playback and pause on hidden document/navigation.

Handle ready/state/error/autoplay-blocked events, loading timeout/retry, late
callbacks and cleanup. Seeks before readiness must not cause errors or stale
playback. Poll actual time at a modest cadence (about 200ms) including paused
seeks; update musical React state only when the mapped position changes.
Buffering freezes at reported time. Keyframe seeking is approximate; no sample,
frame or millisecond precision promise. Deterministic tests fake only this
player boundary, not musical mapping or persistence.

Official sources checked 2026-09-19:
- https://developers.google.com/youtube/iframe_api_reference
- https://developers.google.com/youtube/player_parameters
- https://developers.google.com/youtube/terms/required-minimum-functionality
- https://developers.google.com/youtube/terms/developer-policies

## Implementation and verification

1. Typed persistence and validation: real save/reopen/owner/conflict/history
   tests, invalid/overlapping/out-of-track anchors, preservation through range
   and enrichment edits. Existing JSON storage and native synchronous route.
2. Pure frontend score/time mapping and URL parsing: boundaries, no
   extrapolation, unknown rhythm, rests, fractional/pickup/meter durations,
   different anchor slopes, repeated occurrences and safe loop ranges.
3. Small YouTube adapter with deterministic lifecycle/failure tests, integrated
   SongStudy source/calibration controls and actual-time highlighting.
4. Browser journeys use a fake player plus the real app/backend: attach,
   confirm, calibrate, select/play, seek/follow, loop, source exclusivity,
   save/reopen, errors, keyboard/mobile/dark/navigation. Separately verify a
   public real embed from this application origin; no private song data.
5. Required gate: frontend `npm run lint`, `npm run build`, `npm test`,
   `npm run test:e2e`; backend `.venv/bin/python -m pytest -q`. Review correctness
   and then perform a separate Ponytail pass. Focused commits, draft PR only.

## Progress

- Traced SongStudy selection, selected-voice rendering, practice timing/audio,
  persistence and source data. The baseline tree is identical to verified
  `92510fd`: 337 backend tests, 57 browser journeys, 3 unit tests, lint/builds
  passed. No baseline failure allowance is needed.
- Public sample `M7lc1UVf-VE` played/paused/seeked in Chrome on Google's official
  demo. Local-origin real-player verification remains to be done.
- Contract above is settled for implementation. No automatic matching,
  extraction, beat detection or repeat expansion is planned.
