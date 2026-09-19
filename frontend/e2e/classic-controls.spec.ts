import { expect, test } from '@playwright/test'

test('Classic chord controls preserve compatible extensions and clear together', async ({ page }) => {
  await page.goto('/classic')
  await page.getByRole('button', { name: 'Chords', exact: true }).click()
  await expect(page.getByText('Chord Voicings', { exact: true })).toBeVisible()

  await page.getByLabel('Chord root', { exact: true }).selectOption('A')
  await page.getByLabel('Chord extension', { exact: true }).selectOption('7')
  await page.getByLabel('Chord quality', { exact: true }).selectOption('minor')
  await expect(page.getByLabel('Chord root', { exact: true })).toHaveValue('A')
  await expect(page.getByLabel('Chord extension', { exact: true })).toHaveValue('7')
  await expect(page.getByText('Am7', { exact: true })).toBeVisible()

  await page.getByLabel('Chord quality', { exact: true }).selectOption('augmented')
  await expect(page.getByLabel('Chord extension', { exact: true })).toHaveValue('none')
  await expect(page.getByLabel('Chord extension', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByLabel('Chord root', { exact: true })).toHaveValue('C')
  await expect(page.getByLabel('Chord quality', { exact: true })).toHaveValue('major')
})

test('Classic tab playback stops at the end, restarts, and resets when reopened', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/classic')
  await page.getByRole('button', { name: 'Songs', exact: true }).click()
  await page.getByPlaceholder('Search for a song or artist...').fill('fixture')
  await page.getByPlaceholder('Search for a song or artist...').press('Enter')
  await page.getByRole('button', { name: /Study Fixture/ }).click()
  await expect(page.getByRole('heading', { name: 'Tab Viewer', exact: true })).toBeVisible()
  await page.clock.install()
  await page.getByTitle('Play from current measure', { exact: true }).click()
  await expect(page.getByTitle('Pause playback', { exact: true })).toBeVisible()
  await page.clock.runFor(14_000)
  await expect(page.getByTitle('Next measure', { exact: true })).toBeDisabled()
  await expect(page.getByTitle('Play from current measure', { exact: true })).toBeVisible()

  await page.getByTitle('Play from current measure', { exact: true }).click()
  await expect(page.getByTitle('Previous measure', { exact: true })).toBeDisabled()
  // Exercise the existing Tutor focus action without invoking a model.
  await page.evaluate(async () => {
    const storeModule = '/src/stores/useAppStore.ts'
    const { useAppStore } = await import(storeModule)
    useAppStore.getState().focusMeasureBeat(7)
  })
  await expect(page.getByTitle('Play from current measure', { exact: true })).toBeVisible()
  await page.evaluate(async () => {
    const storeModule = '/src/stores/useAppStore.ts'
    const { useAppStore } = await import(storeModule)
    useAppStore.getState().focusMeasureBeat(0)
  })
  await expect(page.getByTitle('Play from current measure', { exact: true })).toBeVisible()
  await page.getByTitle('Next measure', { exact: true }).click()
  await page.getByRole('button', { name: 'Scales', exact: true }).click()
  await page.getByRole('button', { name: 'Songs', exact: true }).click()
  await expect(page.getByTitle('Previous measure', { exact: true })).toBeDisabled()
  await expect(page.getByTitle('Play from current measure', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
