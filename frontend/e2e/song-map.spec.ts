import { expect, test } from '@playwright/test'

test('learning map keeps raw measures, related phrases, saved ranges and exercise markers together', async ({ page }) => {
  await page.goto('/')
  const session = await page.request.post('/api/v2/sessions').then(r => r.json())
  const branch = session.branches[0]
  const ranges = [1, 5].map(start => ({ start_measure: start, end_measure: start + 1, section: 'Opening phrase', kind: 'phrase', repeat_group: 'opening', annotation: 'Listen for the shift', confidence: 'low', provenance: 'ai', lyrics: [], broad_harmony: [], detailed_harmony: [] }))
  const song = { id: 'map-song', kind: 'song_study', updated_at: 'revision-1', title: 'Map song', payload: {
    title: 'Map song', artist: 'Fixture', track: { index: 0, name: 'Guitar', tuning: [64,59,55,50,45,40] },
    tab_data: { measures: Array.from({ length: 6 }, () => ({ voices: [{ beats: [{ duration: [1,4], notes: [{ string: 0, fret: 3 }] }] }] })) },
    shape_events: [], saved_ranges: [] as {label: string; start_measure: number; end_measure: number}[],
    enrichment: { ranges, source_sections: [{ label: 'Intro', start_measure: 1, end_measure: 6, source: 'tab' }] } as {ranges: typeof ranges; source_sections: unknown[]} | null,
  } }
  await page.request.patch(`/api/v2/sessions/${session.id}/branches/${branch.id}`, { data: { title: 'Map song', current_artifact_id: song.id, current_artifact_kind: 'song_study' } })
  await page.route('**/api/v2/song-studies/map-song', route => route.fulfill({ json: song }))
  await page.route('**/api/v2/song-studies/map-song/ranges', route => {
    expect(route.request().postDataJSON().expected_updated_at).toBe(song.updated_at)
    song.payload.saved_ranges = route.request().postDataJSON().ranges
    song.updated_at += '-saved'
    return route.fulfill({ json: song })
  })
  await page.route('**/api/v2/song-studies/map-song/enrichment', route => {
    song.payload.enrichment = null
    return route.fulfill({ json: song })
  })
  await page.route('**/api/v2/library', route => route.fulfill({ json: [{ id: 'drill', kind: 'exercise', title: 'Shift drill', provenance: { artifact_id: song.id, selection: { type: 'range', startMeasureIndex: 2, endMeasureIndex: 3 } } }] }))
  await page.reload()
  await page.locator(`[data-session-id="${session.id}"]`).click()
  await page.getByText('Learning map · selection M1–1', { exact: true }).click()
  await expect(page.getByTestId('song-map-derived')).toHaveCount(2)
  await expect(page.getByText('AI · low confidence', { exact: true })).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'tab source: Intro · M1–6' })).toBeVisible()
  await page.getByRole('button', { name: 'M5–6', exact: true }).click()
  await expect(page.getByText('Learning map · selection M5–6', { exact: true })).toBeVisible()
  await page.getByLabel('Range name').fill('Repeat to practice')
  await page.getByRole('button', { name: 'Save selected range', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved range: Repeat to practice · M5–6' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exercise: Shift drill · M3–4' })).toBeVisible()
  await expect(page.getByTestId('song-study-overview-measure')).toHaveText(['1','2','3','4','5','6'])
  await page.screenshot({ path: '/private/tmp/issue18-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: '/private/tmp/issue18-mobile.png', fullPage: true })
  await page.getByTestId('song-study-remove-enrichment').click()
  await expect(page.getByTestId('song-map-derived')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Saved range: Repeat to practice · M5–6' })).toBeVisible()
  const selectedExercise = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/branches/') && r.request().postDataJSON()?.selection?.startMeasureIndex === 2)
  await page.getByRole('button', { name: 'Exercise: Shift drill · M3–4' }).click()
  await selectedExercise
  const updated = await page.request.get(`/api/v2/sessions/${session.id}`).then(r => r.json())
  expect(updated.branches[0].selection).toEqual({ type: 'range', startMeasureIndex: 2, endMeasureIndex: 3 })
  await page.reload()
  await page.locator(`[data-session-id="${session.id}"]`).click()
  await page.getByText('Learning map · selection M3–4', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved range: Repeat to practice · M5–6' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove saved range Repeat to practice' }).click()
  await expect(page.getByRole('button', { name: 'Saved range: Repeat to practice · M5–6' })).toHaveCount(0)
})
