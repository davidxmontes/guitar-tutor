# Frontend and reusable musical displays

V2 lives in `src/v2`; `main.tsx` routes `/classic` to the original app and all
other entry URLs to V2, loading only the selected app entry. The root
[README](../README.md) covers setup and checks.

## Shared data and state

`types/music.ts` owns physical positions, voicings, chord references and resolved
notes without importing a renderer. `types/v2.ts` owns persisted Harmony and
Progression state and Tutor Composition contracts; `v2/harmony.ts` and
`v2/progression.ts` describe their resolved
responses and helpers. This keeps wire models from depending on UI modules.
The backend remains responsible for validation and musical derivation.

`stores/useThemeStore.ts` owns the shared theme preference. `main.tsx` applies it
to the document and Clerk; Classic's `useAppStore` owns only Classic state.
`utils/tab.ts` selects the playable voice for both tab rendering and practice,
so V2 does not import a Classic component just to process a measure.

## Rendering and interaction boundaries

Use resolved backend data. String numbers run from **1 (highest/thinnest) to 6
(lowest/thickest)**; tuning arrays use that same order. Chord diagrams draw the
thickest string on the left, while fretboards draw string 1 at the top. Fret 0
is open; an omitted string in a chord shape is muted. These displays currently
support six-string guitar. Do not transpose notes or invent positions in a
rendering component.

| Component | Use and ownership |
| --- | --- |
| `PhysicalChordDiagram` | A shape alone, or a controlled selectable shape. Owns its SVG, accessible name, selection/focus styling and preview events. No heading, card, toolbar, editor, network request or playback state. |
| `Hear` | A labelled, self-contained playback action for a physical voicing. Stops its audio on unmount and reports playback errors. |
| `FretboardDiagram` | The bare responsive neck with note layers, labels and fret window. Optional `onSelect` makes notes keyboard operable; without it, the image describes its visible notes and exposes no inert note buttons. |
| `Fretboard` | The existing workspace wrapper around `FretboardDiagram`: region/label controls, root filtering, layer legend, note audition and optional guided practice. Reads transient preview from `MusicalInteraction`. |
| `VoicingExplorer` / `TriadExplorer` | Harmony controls around the shared diagram, selection, pinning and audition. Their filters describe different musical concepts and stay separate. |
| `ProgressionEditor` / `ProgressionPractice` | Selected-step editing and the ordered progression strip/transport. The idea owns durations and assigned voicings; playback does not overwrite Focus. |
| `SongShapeStrip` | Selection by source measure/beat, with optional physical diagrams. Source provenance differs from a chosen Harmony voicing, so the strip stays separate. |
| `MeasureGroup` | Shared tab rendering. Learner selection and the optional video playhead are separate; video follow scrolls inside the tab, leaving the embedded player visible. |

The diagram and fretboard styles are imported by their component modules. Theme
variables come from `index.css` and `v2/Theme.css`; set the document's `data-app`
to `v2` and toggle its `dark` class as `main.tsx` does. The display primitives do
not require a Composition or workspace ancestor for their sizing and note
styles. Page spacing and card layout belong to the caller.

## Compose only the presentation needed

```tsx
import { PhysicalChordDiagram } from './v2/PhysicalChordDiagram';
import { Hear } from './v2/Fretboard';

// Shape alone; also safe inside a caller-owned selection button.
<PhysicalChordDiagram positions={voicing.positions} tuning={voicing.tuning} label="C major" />

// A compact row. The caller owns the name, selection and optional controls.
<div className="music-controls">
  <strong>C major</strong>
  <PhysicalChordDiagram
    positions={voicing.positions}
    tuning={voicing.tuning}
    label="C major"
    selected={selected}
    disabled={saving}
    onSelect={selectVoicing}
    onPreview={showPreview}
  />
  <Hear voicing={voicing} label="Hear C major" />
</div>
```

`onPreview` receives `true` on hover/focus and `false` on leave/blur. Omit
`onSelect` for a read-only image; supplying it creates a native button, so do
not put that version inside another button. Add pin/edit controls beside the
shape, as the Harmony and Progression callers do, without teaching the shape
about persistence or introducing combinations of toolbar flags.

```tsx
import { FretboardDiagram } from './v2/Fretboard';

<FretboardDiagram
  label="C major chord tones"
  tuning={tuning}
  layers={[{ id: 'chord', label: 'C major', focal: true, positions: resolvedNotes }]}
  fretWindow={[0, 5]}
  labels="degrees"
/>
```

A bare fret window is an inclusive pair of integer frets between 0 and 24,
with first no greater than last. `Fretboard` validates typed control changes;
Composition validates viewer overrides. The renderer accepts that established
invariant. Reuse `samePositions` / `sameVoicing` from `harmony.ts` to compare
physical selections: array order is irrelevant, while tuning is part of
voicing identity. `physicalVoicing` removes resolved-note metadata when sending
a physical shape back to the API.

## Intentional separation

Persistent Focus and musical changes belong to the Workspace/backend.
`MusicalInteraction` routes semantic selection and holds temporary preview;
`CompositionView` owns per-view display overrides and resets them on a new
live-turn key. Components never persist the Composer's layout into an Artifact.

Classic's chord diagram retains interval dots, color-per-voicing, inferred barre
marks and multi-voicing selection. Its fretboard uses the Classic store/model.
Those contracts differ from V2's exact physical shape and note layers; sharing
those wrappers would require adapters and change existing visuals. They remain
separate. TabViewer, SongStudy physical diagrams and audio utilities already
share the applicable lower-level behavior.

## Song video playback

`types/songVideo.ts` owns saved recording, occurrence and anchor values.
`v2/songVideoTiming.ts` maps preserved beat durations to bounded video intervals;
it never extrapolates or infers repeats. `YouTubePlayer` owns the supported
iframe, readiness, commands and actual-time updates. `SongVideo` owns the local
calibration draft and selection playback, publishing only changed musical
positions to SongStudy. Keep synthesized practice on its existing clock.

On first choosing YouTube playback, SongVideo requests ephemeral recording
suggestions from the owned SongStudy endpoint. The backend reuses Songsterr's
linked videos and YouTube oEmbed title/channel metadata; choosing a suggestion
uses the same unconfirmed draft and Undo path as the secondary URL form.
Suggestions never replace saved alignment automatically. The player reports
video length; a conservative written-score estimate provides a comparison,
not a synchronization model. Unsupported tempo or repeat order yields an
explained unavailable estimate.

Saving uses the existing SongStudy artifact, ownership/revision checks and
History. Watching never persists player time. See
[the alignment contract](../docs/song-video-sync.md) for the manual workflow,
repeat/gap behavior, platform requirements and verification scope.

## Proof paths

`e2e/shared-blocks.html` demonstrates bare, compact/playable and read-only
compositions. Its browser tests check keyboard selection, valid fret ranges,
mobile containment and light/dark screenshots. Real Harmony/Progression tests
cover triads, CAGED, pinning, composed Tutor layouts, failed-write recovery,
voicing assignment, progression editing and playback. SongStudy tests cover the
read-only shape strip and alternate tuning. Run them with `npm run test:e2e`.
