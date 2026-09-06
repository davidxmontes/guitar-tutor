import { expect, test } from '@playwright/test'

test('normal entry opens the V2 shell and Classic remains a functional secondary fallback', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))

  await page.goto('/')
  await expect(page.getByTestId('v2-start-session')).toBeVisible()
  await page.getByTestId('v2-start-session').click()
  await expect(page.getByTestId('workspace-placeholder-harmony')).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('link', { name: 'Classic fallback', exact: true }).click()
  await expect(page).toHaveURL(/\/classic$/)
  await page.getByRole('button', { name: 'Chords', exact: true }).click()
  await expect(page.getByText('Chord Voicings', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('Auto-Play', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Return to Guitar Tutor', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('v2-start-session')).toBeVisible()

  expect(errors).toEqual([])
})
