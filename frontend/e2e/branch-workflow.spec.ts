import { expect, test } from '@playwright/test'

const TUNING = [64, 59, 55, 50, 45, 40]

const songStudy = {
  id: 'song-1',
  user_id: 'dev-user',
  kind: 'song_study',
  title: 'Jimi Hendrix - Little Wing',
  payload: {
    song_id: 7,
    artist: 'Jimi Hendrix',
    title: 'Little Wing',
    track: { index: 0, name: 'Guitar 1', instrument: 'Guitar', tuning: TUNING },
    tab_data: {
      tuning: TUNING,
      measures: Array.from({ length: 6 }, (_, index) => ({
        voices: [{ beats: [{ notes: [{ string: index % 3, fret: index + 1 }] }] }],
      })),
    },
    shape_events: [],
    chordpro: null,
    enrichment: null,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const progression = {
  title: 'Dreamy progression',
  chords: [
    { root: 'D', quality: 'major7', voicing: [{ string: 1, fret: 5 }], tuning: 'standard' },
    { root: 'F#', quality: 'minor7', voicing: [{ string: 2, fret: 5 }], tuning: 'standard' },
    { root: 'B', quality: 'minor9', voicing: null, tuning: null },
    { root: 'G', quality: 'major7', voicing: [{ string: 3, fret: 4 }], tuning: 'standard' },
  ],
  inspired_by: { artifact_id: 'song-1', artifact_kind: 'song_study', artifact_title: 'Little Wing' },
}

async function openSourceSong(page: import('@playwright/test').Page) {
  await page.route('**/api/songs/search**', (route) => route.fulfill({
    json: {
      results: [{
        song_id: 7,
        artist: 'Jimi Hendrix',
        title: 'Little Wing',
        has_chords: false,
        tracks: [{ index: 0, name: 'Guitar 1', instrument: 'Guitar', is_vocal: false, is_empty: false, tuning: TUNING }],
      }],
    },
  }))
  await page.route('**/api/v2/song-studies/song-1', (route) => route.fulfill({ json: songStudy }))
  await page.route('**/api/v2/song-studies', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const { session_id, branch_id } = route.request().postDataJSON() as { session_id: string; branch_id: string }
    await page.request.patch(`/api/v2/sessions/${session_id}/branches/${branch_id}`, {
      data: { title: 'Little Wing', current_artifact_kind: 'song_study', current_artifact_id: 'song-1' },
    })
    return route.fulfill({ status: 201, json: songStudy })
  })
  await page.route('**/api/v2/tutor/threads/*/messages', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/v2/tutor/turns', (route) => route.fulfill({
    json: {
      message: "Let's take that color somewhere new.",
      focus: null,
      candidates: [progression],
      provider: 'openai',
      model: 'stub-model',
      latency_ms: 10,
      usage: { input_tokens: 1, output_tokens: 1 },
      tool_call_count: 0,
      status: 'completed',
    },
  }))

  await page.goto('/v2')
  await page.getByTestId('v2-start-session').click()
  await page.getByTestId('song-study-search-input').fill('Little Wing')
  await page.getByTestId('song-study-search-input').press('Enter')
  await page.getByTestId('song-study-track-option').click()
  await expect(page.getByTestId('song-study-title')).toContainText('Little Wing')

  const sessionId = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '')
  const sourceBranchId = (await page.getByTestId('v2-active-branch').textContent())!.replace('Branch ', '')
  return { sessionId, sourceBranchId }
}

test('Explore opens an independent branch and restores both workspaces', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const { sessionId, sourceBranchId } = await openSourceSong(page)

  const measures = page.getByTestId('song-study-overview-measure')
  await measures.nth(4).click()
  await measures.nth(2).click({ modifiers: ['Shift'] })

  await page.getByTestId('tutor-chat-input').fill('Make something with this vibe')
  await page.getByTestId('tutor-chat-send').click()
  await page.getByTestId('progression-candidate-explore').click()

  await expect(page.getByTestId('progression-workspace')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Little Wing' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Dreamy progression' })).toHaveAttribute('aria-selected', 'true')

  const session = await page.request.get(`/api/v2/sessions/${sessionId}`).then((response) => response.json())
  expect(session.branches).toHaveLength(2)
  const progressionBranch = session.branches[1]
  expect(progressionBranch.tutor_thread_id).not.toBe(session.branches[0].tutor_thread_id)
  expect(progressionBranch.fork_context).toMatchObject({
    source_branch_id: sourceBranchId,
    source_artifact_id: 'song-1',
    source_selection: { type: 'range', startMeasureIndex: 2, endMeasureIndex: 4 },
  })

  await page.getByTestId('progression-chord').nth(1).click()
  await expect(page.getByTestId('progression-chord').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('tab', { name: 'Little Wing' }).click()
  await expect(page.getByTestId('song-study-title')).toContainText('Little Wing')

  const restoredSource = await page.request.get(`/api/v2/sessions/${sessionId}`).then((response) => response.json())
  expect(restoredSource.branches[0].selection).toEqual({ type: 'range', startMeasureIndex: 2, endMeasureIndex: 4 })

  await page.getByRole('tab', { name: 'Dreamy progression' }).click()
  await expect(page.getByTestId('progression-chord').nth(1)).toHaveAttribute('aria-pressed', 'true')
})

test('closed work remains reopenable after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const { sessionId } = await openSourceSong(page)
  await page.getByTestId('tutor-chat-input').fill('Make something with this vibe')
  await page.getByTestId('tutor-chat-send').click()
  await page.getByTestId('progression-candidate-explore').click()

  await page.getByTestId('v2-close-active-branch').click()
  await expect(page.getByRole('tab', { name: 'Dreamy progression' })).toHaveCount(0)
  await expect(page.getByTestId('v2-closed-workspaces')).toContainText('Dreamy progression')

  await page.reload()
  await page.locator(`[data-testid="v2-continue-session"][data-session-id="${sessionId}"]`).click()
  await page.getByRole('button', { name: 'Reopen Dreamy progression' }).click()
  await page.getByRole('tab', { name: 'Dreamy progression' }).click()
  await expect(page.getByTestId('progression-chord').first()).toHaveAttribute('aria-pressed', 'true')
})

test('mobile uses a workspace switcher for the same branches', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSourceSong(page)
  await page.getByTestId('tutor-chat-input').fill('Make something with this vibe')
  await page.getByTestId('tutor-chat-send').click()
  await page.getByTestId('progression-candidate-explore').click()

  await expect(page.getByTestId('v2-desktop-tabs')).toBeHidden()
  const switcher = page.getByLabel('Current workspace')
  await expect(switcher).toBeVisible()
  await expect(switcher.locator('option')).toHaveText(['Little Wing', 'Dreamy progression'])
  await switcher.selectOption({ label: 'Little Wing' })
  await expect(page.getByTestId('song-study-workspace')).toBeVisible()
})
