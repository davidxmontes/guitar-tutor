import { expect, test } from '@playwright/test'

for (const width of [320, 1280]) {
  test(`fretboard layers, keyboard focus and ephemeral view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/e2e/shared-blocks.html')
    const note = page.getByRole('button', { name: 'C, degree 1, string 2, fret 1, chord, main focus' })
    await expect(note).toHaveAttribute('tabindex', '0')
    await note.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('selected-note')).toHaveText('C on string 2 fret 1')
    await page.keyboard.press('Space')
    await expect(page.getByTestId('focus-count')).toHaveText('2')
    await note.click()
    await expect(page.getByTestId('focus-count')).toHaveText('3')
    await expect(note.locator('circle')).toHaveAttribute('stroke-width', '3')
    await expect(page.getByLabel('Fretboard layers')).toContainText('scale')
    await expect(page.getByLabel('Fretboard layers')).toContainText('chord — main focus')
    await expect(page.getByLabel('Fretboard layers')).toContainText('highlight')
    await page.getByLabel('Note labels').selectOption('degrees')
    await expect(note.locator('text')).toHaveText('1')
    await page.getByLabel('First fret').fill('3')
    await expect(note).toHaveCount(0)
    await page.getByRole('button', { name: 'Next turn' }).click()
    await expect(note).toBeVisible()
    await expect(page.getByLabel('Note labels')).toHaveValue('notes')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `test-results/shared-blocks-${width}.png`, fullPage: true })
  })
}

test('Compare is transient, same-kind, limited to four and clearable', async ({ page }) => {
  await page.goto('/e2e/shared-blocks.html')
  await page.getByRole('button', { name: 'Compare scale 1', exact: true }).click()
  await expect(page.getByTestId('comparison-view')).toHaveCount(0)
  await page.getByRole('button', { name: 'Compare scale 2', exact: true }).click()
  await expect(page.getByTestId('comparison-view')).toBeVisible()
  await page.getByRole('button', { name: 'Compare chord' }).click()
  await expect(page.getByRole('status')).toHaveText('Choose peers of the same kind (up to four).')
  await page.getByRole('button', { name: 'Compare scale 3', exact: true }).click()
  await page.getByRole('button', { name: 'Compare scale 4', exact: true }).click()
  await page.getByRole('button', { name: 'Compare scale 5', exact: true }).click()
  await expect(page.getByTestId('comparison-peer')).toHaveCount(4)
  await page.getByRole('button', { name: 'Clear comparison' }).click()
  await expect(page.getByTestId('comparison-view')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('comparison-view')).toHaveCount(0)
})

test('candidate shell invokes all four injected actions', async ({ page }) => {
  await page.goto('/e2e/shared-blocks.html')
  const candidate = page.getByRole('group', { name: 'Candidate: Warm voicing' })
  for (const action of ['Play', 'Keep', 'Develop', 'Dismiss']) {
    await candidate.getByRole('button', { name: action, exact: true }).click()
    await expect(page.getByTestId('candidate-action')).toHaveText(action)
  }
})
