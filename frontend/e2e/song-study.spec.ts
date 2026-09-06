import { test, expect } from '@playwright/test'

// Proves ticket #12's core acceptance criteria end to end through the real
// browser + real local V2 backend (session/branch persistence, selection
// persistence). Only the two calls that would otherwise hit the live
// Songsterr API (search, song-study create) are stubbed, so the test stays
// deterministic without any network dependency — everything downstream
// (branch state, fretboard sync, full-tab toggle) exercises real app code.

// Deliberately non-standard (whole-step down: D G C F A D) so this test would
// fail if the fretboard ever fell back to a hard-coded standard tuning
// instead of the track's own — the note asserted below only comes out right
// when the actual tuning array is used.
const DROP_STEP_TUNING = [62, 57, 53, 48, 43, 38]

const SEARCH_RESPONSE = {
  results: [
    {
      song_id: 7,
      artist: 'Oasis',
      title: 'Wonderwall',
      has_chords: true,
      tracks: [
        {
          index: 0,
          name: 'Acoustic Guitar',
          instrument: 'Guitar',
          is_vocal: false,
          is_empty: false,
          tuning: DROP_STEP_TUNING,
        },
      ],
    },
  ],
}

function songStudyArtifact() {
  return {
    id: 'artifact-1',
    user_id: 'dev-user',
    kind: 'song_study',
    title: 'Oasis - Wonderwall',
    payload: {
      song_id: 7,
      artist: 'Oasis',
      title: 'Wonderwall',
      track: { index: 0, name: 'Acoustic Guitar', instrument: 'Guitar', tuning: DROP_STEP_TUNING },
      tab_data: {
        tuning: DROP_STEP_TUNING,
        measures: [
          { voices: [{ beats: [{ notes: [{ string: 0, fret: 3 }] }] }] },
          { voices: [{ beats: [{ notes: [{ string: 1, fret: 0 }] }] }] },
          { voices: [{ beats: [{ notes: [{ string: 2, fret: 2 }] }] }] },
        ],
      },
      chordpro: null,
      enrichment: null,
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

test('search a song, load the whole track, select a beat, and sync the fretboard', async ({ page }) => {
  let currentArtifact = songStudyArtifact()
  let enrichmentCalls = 0
  let noteEnhancementRequested!: () => void
  let releaseEnhancement!: () => void
  const enhancementRequested = new Promise<void>((resolve) => { noteEnhancementRequested = resolve })
  const enhancementCanFinish = new Promise<void>((resolve) => { releaseEnhancement = resolve })

  await page.route('**/api/songs/search**', (route) => route.fulfill({ json: SEARCH_RESPONSE }))
  await page.route('**/api/v2/song-studies', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const { session_id, branch_id } = route.request().postDataJSON() as { session_id: string; branch_id: string }
    // Mirror the real endpoint's side effect (setting the branch's current
    // artifact) against the real local backend, without hitting the live
    // Songsterr API this stub is standing in for. page.request is a separate
    // client from the page's own network stack, so it isn't re-intercepted.
    await page.request.patch(`/api/v2/sessions/${session_id}/branches/${branch_id}`, {
      data: { current_artifact_kind: 'song_study', current_artifact_id: currentArtifact.id },
    })
    return route.fulfill({ status: 201, json: currentArtifact })
  })
  await page.route('**/api/v2/song-studies/artifact-1/enrichment', async (route) => {
    if (route.request().method() === 'POST') {
      enrichmentCalls += 1
      noteEnhancementRequested()
      await enhancementCanFinish
      currentArtifact = {
        ...currentArtifact,
        payload: {
          ...currentArtifact.payload,
          chordpro: '{section: Intro}\n[G]Today is gonna be the day',
          enrichment: {
            tab_fingerprint: 'tab-fingerprint',
            chordpro_fingerprint: 'chordpro-fingerprint',
            generated_at: '2026-01-01T00:01:00Z',
            source_sections: [],
            ranges: [{
              start_measure: 1,
              end_measure: 2,
              section: 'Intro',
              lyrics: ['Today is gonna be the day'],
              broad_harmony: ['G'],
              detailed_harmony: ['Gsus4', 'G'],
              confidence: 'medium',
              provenance: 'ai',
            }],
          },
        },
      }
      return route.fulfill({ json: currentArtifact })
    }
    currentArtifact = {
      ...currentArtifact,
      payload: { ...currentArtifact.payload, enrichment: null },
    }
    return route.fulfill({ json: currentArtifact })
  })

  await page.goto('/v2')
  await page.getByTestId('v2-start-session').click()
  const sessionId = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '')
  const branchId = (await page.getByTestId('v2-active-branch').textContent())!.replace('Branch ', '')

  // Search Songsterr and pick a track — creates/opens a SongStudy in the branch.
  await page.getByTestId('song-study-search-input').fill('wonderwall')
  await page.getByTestId('song-study-search-input').press('Enter')
  await page.getByTestId('song-study-track-option').click()

  // Whole track is browsable immediately — no further request was needed to see all 3 measures.
  await expect(page.getByTestId('song-study-workspace')).toBeVisible()
  await expect(page.getByTestId('song-study-title')).toHaveText('Wonderwall — Oasis')
  await expect(page.getByTestId('song-study-overview-measure')).toHaveCount(3)

  // Select a beat in the focused detail window — the fretboard should reflect
  // the track's actual (non-standard) tuning: D + 3 frets = F, not the G a
  // hard-coded standard-tuning assumption would produce for the same fret.
  const firstMeasureBeat = page.locator('[data-testid="song-study-workspace"] [data-measure-index="0"] button').first()
  await firstMeasureBeat.click()
  await expect(page.getByTestId('fretboard-active-note')).toHaveText('F')

  // Selection is represented in Branch state (persisted server-side).
  const branchAfterBeat = await page.request
    .get(`/api/v2/sessions/${sessionId}`)
    .then((r) => r.json())
    .then((s) => s.branches.find((b: { id: string }) => b.id === branchId))
  expect(branchAfterBeat.selection).toEqual({ type: 'beat', measureIndex: 0, beatIndex: 0 })
  expect(branchAfterBeat.current_artifact_kind).toBe('song_study')

  // Jump to measure 3 via the overview, then shift-click back to measure 1 to
  // select a contiguous range — also represented in Branch state.
  const overviewMeasures = page.getByTestId('song-study-overview-measure')
  await overviewMeasures.nth(2).click()
  const rangeSaved = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/branches/') && r.request().postDataJSON()?.selection?.type === 'range')
  await overviewMeasures.nth(0).click({ modifiers: ['Shift'] })
  await rangeSaved

  const branchAfterRange = await page.request
    .get(`/api/v2/sessions/${sessionId}`)
    .then((r) => r.json())
    .then((s) => s.branches.find((b: { id: string }) => b.id === branchId))
  expect(branchAfterRange.selection).toEqual({ type: 'range', startMeasureIndex: 0, endMeasureIndex: 2 })

  // Conventional full-tab view remains available alongside overview + focus,
  // now as a dense, continuous reader (composition change: no permanent
  // fretboard here, and section-labelled rows instead of one big block).
  await page.getByTestId('song-study-toggle-full-tab').click()
  await expect(page.getByTestId('song-study-full-tab')).toBeVisible()
  await expect(page.getByTestId('song-study-fretboard')).toHaveCount(0)

  // The still-persisted range selection (measures 1-3) surfaces a bridge
  // back into Overview + Focus: clicking "Focus selection" should move focus
  // to the start of that range and switch back out of Full Tab.
  const dock = page.getByTestId('song-study-selection-dock')
  await expect(dock).toBeVisible()
  await expect(dock).toContainText('Measures 1–3 selected')
  const focusSaved = page.waitForResponse(response => response.url().endsWith(`/sessions/${sessionId}/branches/${branchId}`) && response.request().method() === 'PATCH' && response.request().postDataJSON()?.focus?.measureIndex === 0)
  await dock.getByTestId('song-study-focus-selection').click()
  expect((await focusSaved).ok()).toBe(true)

  await expect(page.getByTestId('song-study-full-tab')).toHaveCount(0)
  const branchAfterFocusSelection = await page.request
    .get(`/api/v2/sessions/${sessionId}`)
    .then((r) => r.json())
    .then((s) => s.branches.find((b: { id: string }) => b.id === branchId))
  expect(branchAfterFocusSelection.focus.measureIndex).toBe(0)

  // The compressed, section-grouped overview still surfaces every measure as
  // a clickable tile (compression groups them, it doesn't hide any) and the
  // focused detail window is still the readable 2-4 measure workspace.
  await expect(page.getByTestId('song-study-overview-measure')).toHaveCount(3)
  await expect(page.getByTestId('song-study-overview-section')).toHaveCount(1)

  // Enrichment is opt-in: loading and browsing the raw song does not call it.
  expect(enrichmentCalls).toBe(0)
  const enhanceButton = page.getByTestId('song-study-enhance')
  await enhanceButton.click()
  await enhancementRequested

  // Raw browsing stays mounted and usable while the optional model call runs.
  await expect(page.getByTestId('song-study-workspace')).toBeVisible()
  await expect(enhanceButton).toHaveText('Enhancing…')
  await page.getByTestId('song-study-toggle-full-tab').click()
  await expect(page.getByTestId('song-study-full-tab')).toBeVisible()
  releaseEnhancement()

  await expect(page.getByTestId('song-study-enrichment-range')).toContainText('Intro · measures 1–2')
  await expect(page.getByTestId('song-study-enrichment-range')).toContainText('AI alignment · medium confidence')
  await expect(page.getByTestId('song-study-enrichment-range')).toContainText('Broad harmony: G')
  await expect(page.getByTestId('song-study-enrichment-range')).toContainText('Guitar detail: Gsus4 → G')
  await page.getByTestId('song-study-toggle-full-tab').click()
  await expect(page.getByTestId('song-study-enrichment-marker')).toHaveCount(2)
  await page.getByTestId('song-study-toggle-full-tab').click()

  // Each raw source remains independently inspectable after enhancement.
  await page.getByTestId('song-study-chordpro-toggle').click()
  await expect(page.getByTestId('song-study-chordpro-source')).toContainText('{section: Intro}')
  await expect(page.getByTestId('song-study-full-tab')).toBeVisible()

  // Removing only the derived layer leaves both raw views intact.
  await page.getByTestId('song-study-remove-enrichment').click()
  await expect(page.getByTestId('song-study-enrichment-range')).toHaveCount(0)
  await expect(page.getByTestId('song-study-chordpro-source')).toContainText('[G]Today is gonna be the day')
  await expect(page.getByTestId('song-study-full-tab')).toBeVisible()
})
