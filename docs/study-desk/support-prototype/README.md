# Player and Tutor design comparison — throwaway prototype

Question: how can recording playback and Tutor feel intentional without player size modes or a conversation buried under configuration and suggested questions?

This prototype uses the existing SongStudy route, real surrounding workspace and local demonstration controls. Its recording artwork and answers are illustrative; it does not play YouTube or send Tutor requests. The production implementation remains on `feature/issue-134-study-desk`.

## A: one player window, conversation beside the music — recommended

- The player has one size and one hierarchy: recording, native video controls, passage playback, loop and speed. Close returns its space to the music.
- Recording options contain changing the source and score synchronization. Timing is a separate paused setup task; it does not expand a form under the video.
- Tutor starts with a short invitation and two starter questions. Once a conversation starts, the history owns the space.
- Teaching preferences live under Settings in the header. All four suggested prompts are available beside the composer, where the learner is deciding what to ask. Selecting a prompt fills the draft rather than sending it.
- The selected passage is shown next to the question composer. Search online remains an explicit opt-in. The same hierarchy can serve Harmony's Tutor, retaining candidates and Undo with the relevant response.
- On phones, opening Tutor temporarily replaces the visible player; real implementation must pause the recording before hiding it and preserve its position and draft.

Tradeoff: the floating video can cover part of the music while open. It allows the recording and conversation to remain visible together on desktop.

## B: one support panel with Tutor / Recording tabs

The recording sits in the companion column and leaves the score and neck completely uncovered. Tutor uses the same quiet conversation structure on its tab. Conversation and draft stay mounted through tab switches.

Tradeoff: asking while listening requires switching tabs; the real recording must pause when switching to Tutor. This is calmer visually but less convenient when comparing an explanation with what is being played.

## Preview

Run the frontend dev server against the existing development backend and open a song with `?variant=A` or `?variant=B` (retain the song query parameter). The bottom bar switches variants; left/right arrows work outside editable controls. `&panel=recording` opens B on the recording tab. The comparison is gated to development builds.

Current task preview: `http://localhost:5192/v2?variant=A` (Study a song → search `fixture` → Drop D guitar when using the scripted local backend).

Browser-inspected at 1440px desktop and 390/320px phone widths, including Settings, Suggestions, timing setup, and a sample conversation. This is design validation, not production behavior verification. Decision pending user feedback; A is the recommendation.
