import { expect, test } from '@playwright/test'

test('Study browses transient visuals, saves, promotes, and restores semantic state through real APIs', async ({ page }) => {
  await page.goto('/v2')
  await page.getByTestId('v2-start-concept').click()

  await expect(page.getByRole('heading', { name: 'Study' })).toBeVisible()
  await expect(page.getByText('Essentials', { exact: true })).toBeVisible()
  await expect(page.getByText('Explore more', { exact: true })).toBeVisible()
  await expect(page.getByText('Systems', { exact: true })).toBeVisible()
  await expect(page.getByTestId('study-concept-intervals')).toBeVisible()

  const sessionId = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '')
  let session = await page.request.get(`/api/v2/sessions/${sessionId}`).then((response) => response.json())
  const sourceBranchId = session.branches[0].id
  expect(session.branches[0].current_artifact_id).toBeNull()
  const initialStudies = await page.request.get('/api/v2/concept-studies').then((response) => response.json())
  const initialDorianCount = initialStudies.filter((artifact: { payload: { root?: string; concept_id?: string } }) => artifact.payload.root === 'D' && artifact.payload.concept_id === 'dorian').length

  await page.getByTestId('study-root-D').click()
  await page.getByTestId('study-concept-dorian').click()
  await expect(page.getByRole('heading', { name: 'D Dorian' })).toBeVisible()
  await expect(page.getByTestId('study-scale-visualization')).toBeVisible()
  await expect(page.getByTestId('concept-study-interval')).toContainText(['1', '2', 'b3', '4', '5', '6', 'b7'])

  await page.getByTestId('study-concept-intervals').click()
  await expect(page.getByTestId('study-interval-visualization')).toBeVisible()
  await page.getByRole('button', { name: /Perfect fifth/ }).click()
  await expect(page.getByTestId('concept-fretboard')).toContainText('5')

  await page.getByTestId('study-concept-dorian').click()
  await page.getByTestId('study-overlay-intervals').click()
  await page.getByTestId('study-toggle-comparison').click()
  await expect(page.getByTestId('concept-comparison-note').first()).toBeVisible()

  session = await page.request.get(`/api/v2/sessions/${sessionId}`).then((response) => response.json())
  expect(session.branches).toHaveLength(1)
  expect(session.branches[0].current_artifact_id).toBeNull()
  const afterBrowse = await page.request.get('/api/v2/concept-studies').then((response) => response.json())
  expect(afterBrowse.filter((artifact: { payload: { root?: string; concept_id?: string } }) => artifact.payload.root === 'D' && artifact.payload.concept_id === 'dorian')).toHaveLength(initialDorianCount)
  await page.screenshot({ path: 'test-results/study-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/study-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1280, height: 800 })

  await page.getByTestId('study-save').click()
  await expect(page.getByTestId('study-saved-status')).toContainText('Saved to My Stuff')
  const savedStudies = await page.request.get('/api/v2/concept-studies').then((response) => response.json())
  const savedDorianStudies = savedStudies.filter((artifact: { payload: { root?: string; concept_id?: string } }) => artifact.payload.root === 'D' && artifact.payload.concept_id === 'dorian')
  expect(savedDorianStudies).toHaveLength(initialDorianCount + 1)
  const saved = savedDorianStudies.find((artifact: { id: string }) => !initialStudies.some((initial: { id: string }) => initial.id === artifact.id))
  if (!saved) throw new Error('Saved ConceptStudy was not returned by the public API')
  expect(saved.payload).toMatchObject({
    visualization: 'scale',
    root: 'D',
    concept_id: 'dorian',
    comparison_id: 'major',
    overlay: 'intervals',
  })
  expect(saved.payload).not.toHaveProperty('scroll_position')
  expect(saved.payload).not.toHaveProperty('panel_dimensions')
  expect(saved.payload).not.toHaveProperty('zoom')

  session = await page.request.get(`/api/v2/sessions/${sessionId}`).then((response) => response.json())
  expect(session.branches[0].id).toBe(sourceBranchId)
  expect(session.branches[0].current_artifact_id).toBeNull()

  await page.getByTestId('study-work-on-this').click()
  await expect(page.getByTestId('concept-study-workspace')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'D Dorian' })).toBeVisible()
  await expect(page.getByTestId('concept-relationship')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Intervals' })).toHaveAttribute('aria-pressed', 'true')

  session = await page.request.get(`/api/v2/sessions/${sessionId}`).then((response) => response.json())
  expect(session.branches).toHaveLength(2)
  expect(session.branches[0].current_artifact_id).toBeNull()
  expect(session.branches[1].current_artifact_id).toBe(saved.id)

  await page.reload()
  await page.locator(`[data-testid="v2-continue-session"][data-session-id="${sessionId}"]`).click()
  await page.getByTestId('v2-branch-tab').nth(1).click()
  await expect(page.getByRole('heading', { name: 'D Dorian' })).toBeVisible()
  await expect(page.getByTestId('concept-relationship')).toBeVisible()

  await page.setViewportSize({ width: 320, height: 800 })
  await expect(page.getByTestId('concept-study-workspace')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('Study surfaces an initial catalog failure', async ({ page }) => {
  await page.route('**/api/v2/study/catalog', (route) => route.fulfill({ status: 500 }))
  await page.goto('/v2')
  await page.getByTestId('v2-start-concept').click()

  await expect(page.getByRole('alert')).toContainText('API error: 500')
})

test('Chord Study changes voicing locally and reopens the exact promoted selection', async ({ page }) => {
  await page.goto('/v2')
  await page.getByTestId('v2-start-concept').click()

  const sessionId = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '')
  await page.getByTestId('study-concept-chord_minor').click()
  await expect(page.getByTestId('study-chord-visualization')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Am' })).toBeVisible()
  await expect(page.getByTestId('study-chord-tone')).toContainText(['A', 'C', 'E'])

  await page.getByTestId('study-voicing-1').click()
  await expect(page.getByTestId('study-voicing-1')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('study-toggle-chord-comparison').click()
  await expect(page.getByTestId('concept-comparison-note').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/chord-study-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/chord-study-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1280, height: 800 })

  const beforePromotion = await page.request.get(`/api/v2/sessions/${sessionId}`).then((response) => response.json())
  expect(beforePromotion.branches).toHaveLength(1)
  expect(beforePromotion.branches[0].current_artifact_id).toBeNull()

  await page.getByTestId('study-work-on-this').click()
  await expect(page.getByTestId('concept-study-workspace')).toBeVisible()
  await expect(page.getByTestId('study-voicing-1')).toHaveAttribute('aria-pressed', 'true')

  const promoted = await page.request.get(`/api/v2/sessions/${sessionId}`).then((response) => response.json())
  expect(promoted.branches).toHaveLength(2)
  const artifact = await page.request.get(`/api/v2/concept-studies/${promoted.branches[1].current_artifact_id}`).then((response) => response.json())
  expect(artifact.payload).toMatchObject({
    visualization: 'chord',
    root: 'A',
    quality: 'minor',
    selected_voicing: 1,
    comparison_quality: 'major',
  })

  await page.reload()
  await page.locator(`[data-testid="v2-continue-session"][data-session-id="${sessionId}"]`).click()
  await page.getByTestId('v2-branch-tab').nth(1).click()
  await expect(page.getByRole('heading', { name: 'Am' })).toBeVisible()
  await expect(page.getByTestId('study-voicing-1')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('concept-comparison-note').first()).toBeVisible()
})
