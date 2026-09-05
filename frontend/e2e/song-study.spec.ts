import { test, expect } from '@playwright/test'

// Proves ticket #12's core acceptance criteria end to end through the real
// browser + real local V2 backend (session/branch persistence, selection
// persistence). Only the two calls that would otherwise hit the live
// Songsterr API (search, song-study create) are stubbed, so the test stays
// deterministic without any network dependency — everything downstream
// (branch state, fretboard sync, full-tab toggle) exercises real app code.

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
          tuning: [64, 59, 55, 50, 45, 40],
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
      track: { index: 0, name: 'Acoustic Guitar', instrument: 'Guitar', tuning: [64, 59, 55, 50, 45, 40] },
      tab_data: {
        tuning: [64, 59, 55, 50, 45, 40],
        measures: [
          { voices: [{ beats: [{ notes: [{ string: 0, fret: 3 }] }] }] },
          { voices: [{ beats: [{ notes: [{ string: 1, fret: 0 }] }] }] },
          { voices: [{ beats: [{ notes: [{ string: 2, fret: 2 }] }] }] },
        ],
      },
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

test('search a song, load the whole track, select a beat, and sync the fretboard', async ({ page }) => {
  await page.route('**/api/songs/search**', (route) => route.fulfill({ json: SEARCH_RESPONSE }))
  await page.route('**/api/v2/song-studies', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const { session_id, branch_id } = route.request().postDataJSON() as { session_id: string; branch_id: string }
    const artifact = songStudyArtifact()
    // Mirror the real endpoint's side effect (setting the branch's current
    // artifact) against the real local backend, without hitting the live
    // Songsterr API this stub is standing in for. page.request is a separate
    // client from the page's own network stack, so it isn't re-intercepted.
    await page.request.patch(`/api/v2/sessions/${session_id}/branches/${branch_id}`, {
      data: { current_artifact_kind: 'song_study', current_artifact_id: artifact.id },
    })
    return route.fulfill({ status: 201, json: artifact })
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
  // the track's actual tuning (E at fret 3 on the high string = G), not a
  // hard-coded standard-tuning assumption baked in separately from the track.
  const firstMeasureBeat = page.locator('[data-testid="song-study-workspace"] [data-measure-index="0"] button').first()
  await firstMeasureBeat.click()
  await expect(page.getByTestId('fretboard-active-note')).toHaveText('G')

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
  await overviewMeasures.nth(0).click({ modifiers: ['Shift'] })

  const branchAfterRange = await page.request
    .get(`/api/v2/sessions/${sessionId}`)
    .then((r) => r.json())
    .then((s) => s.branches.find((b: { id: string }) => b.id === branchId))
  expect(branchAfterRange.selection).toEqual({ type: 'range', startMeasureIndex: 0, endMeasureIndex: 2 })

  // Conventional full-tab view remains available alongside overview + focus.
  await page.getByTestId('song-study-toggle-full-tab').click()
  await expect(page.getByTestId('song-study-full-tab')).toBeVisible()
})
