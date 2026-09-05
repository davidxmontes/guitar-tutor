import { expect, test } from '@playwright/test'

test('normal entry opens V2 and Classic remains a functional secondary fallback', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByTestId('v2-start-session')).toBeVisible()
  await page.route('**/api/v2/tutor/turns', route => route.fulfill({ json: {
    message: 'Try a relaxed A minor pentatonic phrase.', focus: null, status: 'completed',
    provider: 'openai', model: 'stub', usage: {}, latency_ms: 1,
  } }))
  await page.getByTestId('v2-start-session').click()
  await page.getByTestId('tutor-chat-input').fill('Give me a spontaneous guitar idea')
  await page.getByTestId('tutor-chat-send').click()
  await expect(page.getByTestId('tutor-chat-message-assistant')).toContainText('A minor pentatonic')
  await page.screenshot({ path: '/private/tmp/issue26-workspace-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/private/tmp/issue26-workspace-mobile.png', fullPage: true })
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
  await page.screenshot({ path: '/private/tmp/issue26-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/private/tmp/issue26-mobile.png', fullPage: true })
  await page.goto('/v2')
  await expect(page.getByTestId('v2-start-session')).toBeVisible()
  expect(errors).toEqual([])
})
