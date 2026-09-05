import { expect, test } from '@playwright/test'

test('ConceptStudy opens explicitly, compares theory, practices locally, and reopens as an artifact', async ({ page }) => {
  let tutorTurns = 0
  await page.route('**/api/v2/tutor/turns', (route) => {
    tutorTurns += 1
    return route.fulfill({
      json: {
        message: 'D major is a useful comparison.',
        focus: { role: 'comparison', notes: [{ string: 5, fret: 5 }], label: 'D root' },
        concept_suggestion: { concept_id: 'major_triad', root: 'D', label: 'D major triad' },
        provider: 'openai',
        model: 'stub-model',
        latency_ms: 4,
        usage: { input_tokens: 5, output_tokens: 5 },
        tool_call_count: 0,
        status: 'completed',
      },
    })
  })

  await page.goto('/v2')
  await page.getByTestId('v2-start-concept').click()
  await page.getByLabel('Root note').selectOption('A')
  await page.getByLabel('Concept').selectOption('pentatonic_minor')
  await page.getByTestId('concept-study-open').click()

  await expect(page.getByTestId('concept-study-workspace')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'A minor pentatonic' })).toBeVisible()
  await expect(page.getByTestId('concept-study-note')).toHaveCount(5)
  await expect(page.getByTestId('concept-study-interval')).toContainText(['1', 'b3', '4', '5', 'b7'])
  await expect(page.getByTestId('concept-fretboard-string')).toHaveCount(6)
  await expect(page.getByTestId('concept-fretboard')).toContainText('Frets 5–8')
  await page.getByRole('button', { name: 'Intervals' }).click()
  await expect(page.getByTestId('concept-primary-note').first()).toHaveText(/1|b3|4|5|b7/)

  await page.getByTestId('concept-compare').click()
  await expect(page.getByTestId('concept-relationship')).toContainText('Natural minor adds B, F (2, b6).')
  await expect(page.getByTestId('concept-comparison-note').first()).toBeVisible()

  await page.getByTestId('concept-hear').click()
  await page.getByTestId('concept-enter-practice').click()
  await expect(page.getByTestId('concept-practice')).toContainText('80 BPM')
  await page.getByTestId('concept-practice-faster').click()
  await expect(page.getByTestId('concept-practice')).toContainText('85 BPM')
  await page.getByTestId('concept-practice-start').click()
  await page.getByTestId('concept-exit-practice').click()
  await expect(page.getByTestId('concept-practice')).toHaveCount(0)
  expect(tutorTurns).toBe(0)

  const sessionId = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '')
  await page.reload()
  await page.locator(`[data-testid="v2-continue-session"][data-session-id="${sessionId}"]`).click()
  await expect(page.getByRole('heading', { name: 'A minor pentatonic' })).toBeVisible()

  await page.getByTestId('tutor-chat-input').fill('What should I compare this with?')
  await page.getByTestId('tutor-chat-send').click()
  await expect(page.getByText('D major is a useful comparison.')).toBeVisible()
  await expect(page.getByTestId('concept-tutor-focus-caption')).toContainText('comparison')

  let session = await page.request.get(`/api/v2/sessions/${sessionId}`).then((response) => response.json())
  expect(session.branches).toHaveLength(1)

  await page.getByRole('button', { name: 'Work on D major triad' }).click()
  await expect(page.getByRole('heading', { name: 'D major triad' })).toBeVisible()
  await expect(page.getByTestId('v2-branch-tab')).toHaveCount(2)
  session = await page.request.get(`/api/v2/sessions/${sessionId}`).then((response) => response.json())
  expect(session.branches).toHaveLength(2)

  await page.setViewportSize({ width: 320, height: 800 })
  await expect(page.getByTestId('concept-study-workspace')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
