import { expect, test } from '@playwright/test'

for (const width of [320, 1280]) {
  test(`fretboard layers, keyboard focus and ephemeral view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/e2e/shared-blocks.html')
    const board = page.getByLabel('Highlight: highlight')
    const note = board.getByRole('button', { name: 'C, degree 1, string 2, fret 1, chord, main focus' })
    await expect(note).toHaveAttribute('tabindex', '0')
    await note.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('selected-note')).toHaveText('C on string 2 fret 1')
    await page.keyboard.press('Space')
    await expect(page.getByTestId('focus-count')).toHaveText('2')
    await note.click()
    await expect(page.getByTestId('focus-count')).toHaveText('3')
    await expect(note).toBeFocused()
    await expect(board.getByLabel('Fretboard layers')).toContainText('scale')
    await expect(board.getByLabel('Fretboard layers')).toContainText('chord — main focus')
    await expect(board.getByLabel('Fretboard layers')).toContainText('highlight')
    await board.getByLabel('Note labels').selectOption('degrees')
    await expect(note.locator('text')).toHaveText('1')
    await board.getByLabel('First fret').fill('3')
    await expect(note).toHaveCount(0)
    await page.getByRole('button', { name: 'Next turn' }).click()
    await expect(note).toBeVisible()
    await expect(board.getByLabel('Note labels')).toHaveValue('notes')
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

test('read-only fretboards describe their notes without inert buttons', async ({ page }) => {
  await page.goto('/e2e/shared-blocks.html')
  const comparison = page.getByRole('region', { name: 'Read-only comparison' })
  await expect(comparison.locator('.music-note[role="button"]')).toHaveCount(0)
  await expect(comparison.getByRole('img', { name: /harmony fretboard/ })).toHaveAccessibleName(/C, degree 1, string 2, fret 1/)
})

test('typed fret ranges stay within the neck and keep first before last', async ({ page }) => {
  await page.goto('/e2e/shared-blocks.html')
  const board = page.getByLabel('Highlight: highlight')
  await board.getByLabel('First fret').fill('20')
  await expect(board.getByLabel('First fret')).toHaveValue('12')
  await board.getByLabel('Last fret').fill('2')
  await expect(board.getByLabel('Last fret')).toHaveValue('12')
  await board.getByLabel('First fret').fill('-4')
  await expect(board.getByLabel('First fret')).toHaveValue('0')
  await board.getByLabel('Last fret').fill('30')
  await expect(board.getByLabel('Last fret')).toHaveValue('24')
  await board.getByLabel('First fret').fill('2.5')
  await expect(board.getByLabel('First fret')).toHaveValue('2')
  await board.getByLabel('Last fret').fill('8.5')
  await expect(board.getByLabel('Last fret')).toHaveValue('8')
})

test('bare and compact music displays compose independently at mobile and desktop sizes in both themes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/e2e/shared-blocks.html')
  const displays = page.getByRole('region', { name: 'Reusable music displays' })
  await expect(displays.getByRole('img', { name: /C and D on the neck/ })).toBeVisible()
  await expect(displays.getByLabel('Note labels')).toHaveCount(0)
  await expect(displays.getByRole('button', { name: /Practice/ })).toHaveCount(0)
  const shape = displays.getByRole('button', { name: 'Select Compact C major' })
  await shape.focus()
  await page.keyboard.press('Enter')
  await expect(shape).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Space')
  await expect(shape).toHaveAttribute('aria-pressed', 'false')
  await displays.getByRole('button', { name: 'Hear compact C major' }).click()
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const dark of [false, true]) {
      await page.evaluate(dark => { document.documentElement.dataset.app = 'v2'; document.documentElement.classList.toggle('dark', dark) }, dark)
      const compact = displays.getByRole('group', { name: 'Compact playable shape' })
      const selectBox = await shape.boundingBox()
      const playBox = await compact.getByRole('button', { name: 'Hear compact C major' }).boundingBox()
      expect(Math.abs(selectBox!.y - playBox!.y)).toBeLessThan(selectBox!.height)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await displays.screenshot({ animations: 'disabled', path: `test-results/reusable-music-${width}-${dark ? 'dark' : 'light'}.png` })
    }
  }
  expect(errors).toEqual([])
})

test('candidate shell invokes all four injected actions', async ({ page }) => {
  await page.goto('/e2e/shared-blocks.html')
  const candidate = page.getByRole('group', { name: 'Candidate: Warm voicing' })
  for (const action of ['Play', 'Keep', 'Develop', 'Dismiss']) {
    await candidate.getByRole('button', { name: action, exact: true }).click()
    await expect(page.getByTestId('candidate-action')).toHaveText(action)
  }
})
