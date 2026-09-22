# SongStudy video synchronization

## Objective and scope

Find and preview a likely YouTube recording, confirm its arrangement, align score
positions manually, play a selected passage, follow actual video time, and
reopen the saved setup. This is one feature on `feature/song-video-sync`, based
on `main-v2` at `c91ba56`. Existing dirty checkouts are untouched. The detailed
user brief authorizes routine design/implementation decisions and a draft PR;
no merge, deployment, hosted changes, paid service or production credentials.

### Recording discovery follow-up (2026-09-19)

The user expanded the requirement after PR #129: SongStudy should find likely
recordings; pasting a URL becomes a fallback. This supersedes the original
manual-attachment-only scope below. The existing draft PR remains open; work
resumes in build, with the conversation and this contract as the specification.

- Reuse linked video IDs from Songsterr's accepted song revision. Prefer full
  music videos to alternate versions, backing tracks, and solo excerpts. Fetch
  bounded YouTube oEmbed title/channel metadata for useful candidate labels and
  artist/title checks. No YouTube scraping, media extraction, API key, or new
  paid service is needed for this source-linked discovery path.
- Suggestions are read-only and ephemeral. Selecting Preview uses the existing
  unconfirmed recording draft and Undo path. A fetch never replaces a saved or
  edited recording. Confirmation, alignment, and Save remain deliberate.
- Compare the embedded player's reported duration with score duration only
  where the raw score provides an unambiguous timing model. Otherwise explain
  why length cannot be checked. Similar length does not prove an arrangement
  match or generate synchronization anchors.
- Missing/failed suggestions must be distinguishable and retryable. Manual URL
  attachment remains a secondary option for missing or incompatible links.
- Fix the real import regression: a blocked newest revision must not replace
  the accepted score represented by search results. Cover synchronous and
  asynchronous callers and verify a real public song through the actual app.

Verification will extend the existing fake-player journeys with discovery,
replacement/Undo, failure/empty states, and duration hints. Public Songsterr and
YouTube metadata/player checks supplement deterministic tests; no private data
or production credentials. The local preview must use the actual song provider,
not the browser-test fixture catalog.

Additional sources checked:
- https://oembed.com/providers.json (YouTube metadata endpoint registry)
- https://developers.google.com/youtube/iframe_api_reference#getDuration
- https://developers.google.com/youtube/v3/docs/search/list (global search is a
  separate credentialed API; not required for the linked-recording path)

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
  a fresh alignment. Use completed recordings, not ongoing live streams with a
  changing timeline. The API accepts only an eleven-character YouTube ID.
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
- Native player interaction releases an armed selection loop; Play selection
  arms it again. Playback continues beyond the selected end when looping is off. Looping follows reported time and therefore has approximate
  boundaries. Explicit score navigation owns the detail view until the video
  moves to another mapped beat. While video plays, a new learner selection seeks
  to its mapped start; paused selection changes do not start playback. Unknown
  or ambiguous positions pause rather than seek to an invented timestamp.
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
- Pure score/time mapping and URL parsing: 20 unit cases pass. Typed persistence
  adds 32 regression cases; the complete backend gate passes 369 tests.
- The player boundary passes three deterministic browser journeys covering
  readiness, native seeks, errors/retry, visibility and cleanup.
- Public sample `M7lc1UVf-VE` played/paused/seeked in Chrome on Google's official
  demo and localhost. SongStudy itself loaded the real embed, recorded two
  manual anchors, saved/reopened them through My Stuff and played/stopped the
  selected passage. This uses a synthetic test score to verify controls, not
  to claim that the developer demo matches a musical arrangement. The in-app
  browser remained loading in the initial smoke; Chrome succeeded normally.
- Review corrected native-seek/loop ownership, paused calibration focus,
  unaligned upcoming-note projection, resetting the same video, and measure
  selection retaining a previous beat. Regression checks reproduced the
  interaction bugs before their fixes. Measure controls retain native button
  semantics and work with Enter; the tab playhead uses `aria-current` without
  overwriting learner `aria-pressed` selection.
- The initial manual-alignment contract was settled for implementation.
  Recording discovery was added in the follow-up above. Extraction, beat
  detection and repeat expansion remain outside scope.

## Initial manual-alignment delivery evidence

| Check | Result |
| --- | --- |
| Backend suite | 369 passed; two existing dependency warnings |
| Frontend lint | Clean |
| Frontend unit suite | 23 passed |
| Production and local-auth-bypass builds | Pass |
| Full browser suite | 68 passed, including all 57 pre-existing journeys |
| Player checks after final unused-callback cleanup | 3 passed |

Real Chrome verification from this SongStudy origin covered attach, manual
anchors, Save/reopen, interpolated measure playback, automatic passage stop,
native paused seeks into/out of alignment, source switching, and desktop/mobile
light/dark composition. At 320px the real iframe remains at least 200px high;
tablet layouts stack through 1200px. The embedded player uses the ordinary
origin/referrer and pauses when hidden or less than half visible. This is a
desktop Chrome mobile-width check, not a physical iOS/Android device test.

The correctness review covered owner/revision/history behavior, missing rhythm,
repeats, lifecycle cleanup, selection ownership, score rendering and input
validation. The separate Ponytail pass removed redundant player reset/error
plumbing. Existing selection, tab, synthesis, storage and History remain the
shared paths; no media framework, dependency, migration or hosted change.

Timing is sampled about every 200ms and YouTube seeking can land near a keyframe.
Loops and beat highlighting are approximate, and native control interaction
releases selection playback. Alignment uses only completed, user-confirmed
recordings; a user must mark extra anchors at tempo changes/drift and separate
occurrences for repeated measures. Gaps and unmatched arrangements remain
visibly unaligned. This initial delivery did not include recording discovery;
automatic alignment and live-stream support remain unimplemented.

Verification used local auth, memory storage and scripted song/model providers;
only the public YouTube sample used a live external service. No production
credentials or private content were needed. No new test failures remain;
upstream Python/browser-mapping warnings are unchanged.

Workflow deviation: the detailed user brief and this in-repository contract
serve as the feature specification/progress record. The work is one dedicated
branch with focused commits and one draft PR, without manufacturing a separate
spec/ticket issue hierarchy. No merge or deployment is authorized.

## Recording discovery completion

Implemented a read-only, owned `GET /song-studies/{id}/video-suggestions`.
It validates and deduplicates Songsterr-linked IDs, inspects at most eight
YouTube oEmbed records, and returns at most six suggestions. Known unavailable
videos are skipped; unavailable metadata is labeled, not mistaken for a
confirmed playable video. The native player remains the final availability
check. Matching artist/title and ordinary recordings rank ahead of explicit
covers, live/remixed/slowed/8D versions or partial backing/solo tracks. This
searches source-linked recordings, not all of YouTube; songs without links
retain the secondary manual URL option. No API key or additional service was
introduced. oEmbed HTML is ignored.

SongStudy defaults to YouTube playback and automatically previews the highest-ranked
linked recording, paused and unconfirmed. Preview uses the same draft, confirmation,
alignment, Save and Undo path as manual attachment. A late response cannot overwrite
a selected recording, typed URL, Undo, or a switch to synthesized practice. The
current candidate is disabled; changing to another explicitly resets alignment
with Undo available. Candidate labels remain unique when titles repeat.

The written-score length estimate uses the displayed voice's rational beat
durations, including rests and pickups, and explicit type-4 tempo changes at
measure starts. Missing starting tempo/rhythm, changes within measures,
repeats/jumps/directions and unsupported timing return an explained unknown.
Duration is compared after the supported player reports it; it neither ranks
unloaded videos by invented lengths nor creates alignment timestamps.

The real import repair skips blocked/deleted/pending revisions in both sync
and async callers. Optional malformed video metadata is ignored so it cannot
break otherwise valid score imports.

Verification:
- Final backend suite: **394 passed**, two existing dependency warnings.
- Frontend unit suite: **23 passed**; final lint and production build pass.
  Local-auth-bypass build also passed during the full gate.
- Full browser suite: **70 passed**. Focused discovery and intentional manual
  same-video-reset checks passed again after the final UI review fixes.
- Actual API and Chrome: imported Wonderwall's accepted revision `8047059`,
  correct lead-guitar track and all **94 measures**. Automatic suggestions
  supplied `qNHcVevz7wo` without a pasted URL; its supported embedded player
  played and paused. Reported length was approximately **4:20**, compared with
  **4:15** estimated from the actual score. This validates the discovery and
  playback path, not an automatically verified musical arrangement/alignment.
- Real public-song saving and reopening were checked through My Stuff. The
  existing deterministic player journeys verify confirmation, anchor Save/reopen,
  selection playback, source exclusivity, failed/empty suggestions and Undo.
- Inspected real suggestions/player at desktop and 320px, dark/light, collapsed
  and expanded controls. Keyboard discovery is covered by the browser journey.
  No physical mobile-device claim.

Correctness review fixed optional-metadata coupling, alternate-version ranking,
duplicate accessible labels, stale duration on replacement, and selecting the
current recording erasing anchors. A separate Ponytail review removed repeated
candidate/duration explanations and kept the existing player, draft and storage
paths. No new dependency, database migration, media framework or analysis
pipeline. Earlier session-not-found errors were caused by restarting the local
in-memory test API; the updated real-provider app uses a separate local instance
to preserve the user's existing instance.

Local handoff: actual API on `127.0.0.1:8310`, frontend at
`http://localhost:5310/v2`. It uses local auth and memory storage with provider
credentials empty. Saved work survives page reload, not backend restart. The
old backend on 8207 remains preserved, but frontend 5287 now also proxies to 8310.
Its previous stale backend caused discovery 404s and Wonderwall guitar-track errors.

Publishing status: the follow-up commits are local on `feature/song-video-sync`.
Draft PR #129 still contains the earlier published implementation. Its existing
Vercel Git integration automatically deployed a Preview on the previous push;
another push therefore requires approval under the user's no-deployment rule.
No follow-up push, merge, hosted setting change or deployment was performed.


### Local failure and automatic-preview follow-up (2026-09-19)

The user's all-song discovery failure matched the outdated 5287 → 8207 process,
whose recording-suggestions route returned 404. Both local frontend addresses now
use the current API on 8310; that API was not restarted, preserving memory data.
Public-provider imports and discovery succeeded for Frisky (47 measures, 4
suggestions), Roman Holiday (135, 6), Don't Look Back in Anger (97, 6), and
Wonderwall (94, 6), each using a guitar track. No provider responses were mocked
for these checks.

Automatic first preview supersedes the earlier explicit-preview interaction.
It does not start playback, confirm an arrangement, create anchors, or save an
alignment. Failed discovery displays the actual API error and offers Retry.
Lint/build and all 71 browser tests pass, including deferred responses, source
switching, Undo, saved bindings, and first-success retry.

Real browser recheck: opening saved Wonderwall automatically selected the video
and loaded YouTube's native paused player in Chrome. The hidden in-app browser
initially hit the readiness timeout; after showing the tab, Retry loaded the
player successfully (4:20 video versus 4:15 written score estimate). The local
app was left open on that paused preview.


### Selection-driven playback and initial timing (2026-09-19)

The user superseded the manual-only setup requirement: opening a recording should
make selection playback usable, defaulting to 0:00 plus score BPM if necessary.
Non-loop playback now continues past the selected boundary. Explicit learner
selection changes seek while playing, without feeding the video playhead back
into learner selection. Loops remain opt-in; turning them off continues playback.

Primary-provider investigation found public
`GET https://www.songsterr.com/api/video-points/{songId}/{revisionId}/list`.
The public client (`common-DWZ1FVtGLtYGNv20.js`, September 19) converts these
seconds to player milliseconds and indexes them by the expanded measure
progression. The integration therefore accepts straight written order only;
repeat/jump arrangements still need explicit manual occurrences. It does not
copy Songsterr's trailing-time extrapolation. Wonderwall revision 8047059 has
92 supplied measure-start points for 94 written measures; the trailing section
must remain visibly unmapped.

Timing is pinned to the imported score revision and exact video. Otherwise,
supported score rhythm and tempo produce a clearly labeled estimate from 0:00,
including measure-start tempo changes. These initial mappings are not claims
that the learner verified the recording's arrangement. Source provenance saves
with the existing alignment; confirmation remains a separate explicit checkbox.
No media downloading, audio analysis, provider writes, or new services are used.

Final verification for this follow-up:
- Backend: 417 passed, two existing dependency warnings.
- Full browser suite: 75 passed on the automatic-timing change. After compact
  layout and same-selection replay corrections, all 15 affected video journeys
  passed again; lint and production build passed.
- Real API: Frisky (47 anchors, first 0.03s), Roman Holiday (129, 0.02s),
  Don't Look Back in Anger (97, 0.29s), Wonderwall (92, 1.2s) all received
  Songsterr-supplied timing for the chosen recording.
- Real Chrome: selected Wonderwall M6, Play selection started at M6, playback
  advanced through M13 without stopping at M6, and selecting Intro returned
  playback to the opening measures. The native player remained the clock.
- Inspected 1280px desktop, 320px light mode, and the 824px dark in-app browser.
  Expanded controls scroll within a bounded area so the native player and score
  remain available; 320px document width was 314px, without horizontal overflow.
- Both frontend addresses (5310 and 5287) now proxy to the updated API on 8311.
  Four local sessions, five saved/imported artifacts and their available message
  histories were copied into the new local process with IDs preserved. Original
  API 8310 remains running; no original memory data was deleted. The app is left
  open on the automatically timed, paused Wonderwall preview.

Review: source matching, tempo fallback, timing provenance, save/reopen, actual
clock ownership and explicit selection ownership were checked. A fresh explicit
selection object seeks even when reselecting the same measure; memoized fallback
selection prevents playhead updates from triggering seeks. The Ponytail pass kept
the existing anchor model, Undo, persistence and player boundary. Initial timing
is bounded to 256 anchors; unsupported repeats/jumps and unmapped tails remain
manual rather than fabricated. No new dependency or hosted change.

### Playback controls, navigation and lead-note follow-up

The compact Speed selector exposes only the rates advertised by the embedded
player, and reflects its actual rate-change event. It does not rewrite musical
timing or start paused playback. The real Wonderwall player advertised 0.25,
0.5, 0.75, 1, 1.25, 1.5, 1.75 and 2; arbitrary tenths are not guaranteed by
YouTube. A paused change to 0.5 was verified in the real player.

SongStudy now uses native URL/history state to reopen an owned song on refresh.
Breadcrumbs return to the cached song search and preserve its query, with
Back/Forward support and guards against late requests reopening abandoned songs.
The compact breadcrumb baseline and title truncation were inspected in the dark
in-app browser; navigation checks include 320px containment. Refresh preserves
song identity and saved artifact data, not unsaved calibration or playback speed.

Search keeps guitar instruments visible and puts other instruments in native,
closed-by-default details. Vocal flags and explicit vocal names override a guitar
instrument label because provider metadata sometimes labels vocals as guitar.
All tracks retain their original import indices and remain accessible.

The fretboard's shared active-beat projection previously ignored learner selection
in video mode, displaying the old video position or an empty neck. Explicit
selection now takes over that projection until video playback or a native seek
resumes follow. Actual video time still owns playback highlighting; unmapped
sections and rests do not invent notes. The public Wonderwall lead track has
24 opening measures of rests. Real verification selected M25 (string 5, fret 3),
played through later measures, then paused and selected M25 beat 4 (string 3,
fret 0) while the video remained at M46. Single notes do not require chord shapes.

Verification before the final fretboard correction: all 80 browser journeys,
23 unit tests, lint and production builds passed; the additional grouped-track
journey passed with keyboard expansion and 320px containment. Backend remains
unchanged from the 417-test passing run above. Follow-up changes remain local:
no push, merge, deployment or hosted-service change was made.

Final fretboard verification: 18 affected browser journeys passed, followed by
three focused seek/loop/lead checks after the shared seek predicate was reviewed.
Lint and production build passed. The regression first reproduced an empty neck
for a paused single-note selection, then verified single notes, rests, native
resume at the same beat, native paused seeking, and unmapped selection behavior.

### Next-beat fretboard preview

Video mode reuses the existing hollow upcoming-note markers to preview the next
written tab beat, both while following playback and inspecting a paused selection.
Rests remain empty; an unknown current position or the end of the score has no
preview. Current notes retain their filled marker when the next beat repeats the
same fret. This is a score preview, not a prediction of video loop/repeat jumps;
synthesized practice retains its existing loop-aware upcoming beat.

### Choosing loop length

Looping still uses the shared SongSelection and existing video range mapping.
A whole-measure selection spans its first beat's start through its last beat's
end; an inclusive measure range uses those same boundaries across measures.
Transport controls make the selected span visible and offer a whole-measure
shortcut and a deliberate start/end measure choice. Tab beat clicks and overview
measure/Shift-click selection continue to use the same state. Editing range fields
does not seek until applied; missing alignment at an endpoint still disables
looping. There is no second loop-region model or additional playback transport.

### Fretboard technique cues

The fretboard uses imported note/beat flags to describe current and upcoming
techniques alongside the existing note markers. Hammer-on/pull-off flags remain
“hammer-on / pull-off” when direction is unspecified; slide direction and bend amount are not
invented from boolean flags. Muted/dead notes describe the string without adding
a pitched fret marker. Technique cues follow the same selected/playback beat and
next-written-beat projection as the neck, and clear on rests or unknown positions.
Existing tab notation remains unchanged.

Verification: 26 affected SongVideo/SongStudy browser tests passed, including
technique cues during paused selection, video playback, upcoming beats, rests,
and the 320px layout. Frontend lint and production build passed.

### Synthesized practice tempo and sections

Practice tempo entry accepts a draft number and applies it on Enter or blur,
so clearing/replacing a value no longer gets blocked by intermediate digits.
The shared practice controls and clock accept 1–240 BPM; invalid values retain
the prior tempo. Changing tempo keeps the current musical position.
Song overview section headings select their complete inclusive measure range,
while individual measure and Shift-click range gestures remain available. The
practice selection summary describes the range that will actually play.

Synthesized pluck buffers are capped at a 10-second tail to avoid allocating
minutes of audio for each note at very low tempos. Longer electric sustain is
truncated; the musical step duration and practice clock are unchanged.

Verification: all 90 frontend browser tests and 23 unit tests passed, including
editable tempo recovery, native arrow keys, tempo changes during playback,
section traversal, and bounded guide-buffer allocation. Lint and both default
and local-auth-bypass production builds passed; the 320px selection summary was
visually reviewed.

### Song Study Tutor

“Ask about selection” opens the existing Tutor on demand. Questions carry the
learner’s selected beat or inclusive measure range, not the moving playback
highlight. The server checks song ownership and resolves the passage from the
stored score, including tuning, capo, raw techniques, and matching chord shapes.
Answers are explanatory: no score edits, workspace tools, or generated teaching
views. Existing Tutor providers, preferences, jobs, and persisted history are reused.

Each song gets a dedicated conversation branch. Its association is cached per
account and song in this browser and validated against account-owned sessions on
reopen. Conversation messages live in the existing backend store; clearing browser
storage or using another device does not automatically rediscover that association.
The local memory-store server still requires a snapshot to survive a restart.

Requests have no fixed measure, beat, or serialized-byte cutoff. Identical
chord shapes share a definition with all selected occurrences retained. Actual
provider context-window limits still apply; musical data is never silently truncated. Pending questions and saved answers retain
their original selection; playback and new selections can continue independently.
A failed question can retry its original passage or explicitly use the new selection.
Imported technique data is preserved, including bend points, without inventing
fingering, bend units, or details from audio the Tutor has not heard.

Verification: 434 backend tests, 93 browser journeys, and 23 frontend unit tests
passed. Lint and default/local-auth-bypass builds passed. Desktop dark-mode and
320px light-mode chat were visually reviewed. The actual local app preserved a
failed question and its original passage across refresh; success-path browser
tests use the existing scripted model. Live model answers were not verified: the
local API has deliberately blank provider keys, and a development configuration
location has been requested. No production credentials were used.

Local frontend ports 5310 and 5287 now use API 8312 with the current snapshot
(9 sessions, 19 artifacts before chat verification). Original API 8311 remains
alive for its original in-memory state and historical revisions. Only current
artifact payloads are carried by the local snapshot; this is not a durable-store
migration. No push, merge, deployment, or hosted-service change was performed.

### Tutor sidebar layout

Song Study exposes a fixed “Ask about selection” button, so chat is accessible
while scrolling the score. At desktop widths (1200px and above), opening Tutor
reserves space beside the score for a fixed sidebar. Narrower screens use a
bottom sheet capped at 70% of the viewport, with a persistent close control.
Both are non-modal: score selection remains available. Escape closes the panel
and restores focus to the launcher; drafts and running questions survive closing.
The existing Tutor remains mounted after its first opening, without another
conversation or playback state. Intermediate desktop widths stack video above
the score while chat is open to avoid squeezing three columns together.

Layout verification: the full 94-journey run exposed three mobile pointer
overlap failures (91 passed). Bottom space and native scroll margins now keep
controls clear of the launcher. All 10 SongStudy/Tutor journeys and all 22 video
journeys passed on recheck, including each failure. Lint and both build modes
passed. Desktop/mobile, light/dark screenshots and the live local app were
reviewed; keyboard focus restoration and draft retention are covered. Inline
standards and simplification review kept the change within the existing Tutor
wrapper and CSS, without a drawer dependency or duplicate chat state.

The fixed measure/beat cutoffs were removed at the learner’s request. Regression
checks now accept a 9-measure passage and a 130-beat measure while retaining
ownership, index validation, and the actual 24 KB context-size guard. All 434
backend tests pass. Local frontends 5310/5287 now use API 8313, carrying forward
12 sessions and 20 available artifacts; API 8312 remains alive as a fallback.

The remaining 24 KB cap was removed after it blocked a normal selection. Exact
shape definitions are grouped while preserving every source position; raw beats,
techniques, meter, tempo, and tuning remain intact. Context preparation succeeds
for all 20 current local song artifacts (up to 135 measures), reducing repeated
shape definitions from 2,284 to 205 across those artifacts. All 435 backend tests
pass, including a context over the former limit and lossless shape grouping.
Local ports 5310/5287 now use API 8315 with repo AI settings and the preserved
12 sessions/20 artifacts. No live model request was needed for these checks.

### Optional agent-controlled Tavily search

Set server-only `TAVILY_API_KEY` in `backend/.env` and restart the API. The local
worktree launcher reads the original repository’s root/backend env files, including
this key. “Search online” grants the SongStudy agent access to `search_online`;
it does not force a lookup. The existing LangChain `create_agent` loop decides
whether to search, chooses queries, and can refine them based on tool results.
No separate graph, automatic pre-search, or search SDK was added.

The request-scoped tool uses Tavily basic search (up to five results per call),
with up to three calls per answer to bound spend. The provider receives the
agent’s query, not an automatic upload of the score or conversation. Read-only
tool guidance covers source trust, citations, differing arrangements, and the
limits of excerpts: a discovered tab title is not evidence of its actual notes.
Failures are returned to the agent and shown with the saved answer; it can
still explain the score. Actual retrieved source links are saved with the turn
and displayed separately from model-authored citations. No lookup means no
source list. Music mutation and workspace tools remain unavailable in song mode.

Reference: https://docs.tavily.com/documentation/api-reference/endpoint/search

Verification: all 444 backend tests, five SongStudy Tutor browser journeys, lint,
and the local-auth build pass. Deterministic agent tests cover choosing not to
search, an actual tool call feeding a subsequent answer, query refinement,
missing credentials, provider errors/timeouts, source persistence, ownership,
and request deduplication. Local ports 5310/5287 use API 8316; 12 sessions,
20 artifacts, and 10 existing conversation messages were retained.

The repo now contains a Tavily key. One live basic search for a public Wonderwall
lesson returned five results. The agent loop was verified with scripted model
calls; no new live-model request was made for this integration.

### Chat sizing

“Resize chat” in the Tutor header exposes native, keyboard/touch-accessible
sliders: desktop width (320–640px, additionally capped at 45% of the viewport)
and small-screen height (35–95% of the viewport). Desktop score space follows
the chosen width. Reset restores the defaults. Sizes survive closing/reopening
within the current song; no extra stored preferences or resize library is used.
Drafts and conversation state remain mounted while sizing changes.

Verification: all six SongStudy Tutor browser journeys, lint, and the local-auth
production build pass. Expanded desktop and mobile screenshots were reviewed;
tests cover keyboard resizing, score separation, close/reopen, draft retention,
viewport containment, and reset. Changes are available through local HMR.
