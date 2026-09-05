import { test, expect } from '@playwright/test'

// Proves ticket #11's core acceptance criterion end to end through the real
// browser + real V2 public APIs: create a Session, leave (reload, as a new
// browser session would), and resume it.
test('create a V2 session, leave, and resume it', async ({ page }) => {
  await page.goto('/v2')

  await page.getByTestId('v2-start-session').click()
  const sessionText = await page.getByTestId('v2-active-session').textContent()
  expect(sessionText).toMatch(/^Session /)
  const sessionId = sessionText!.replace('Session ', '')

  // Leave: a fresh page load, same as a new browser session.
  await page.reload()
  await page.goto('/v2')

  const continueButton = page.getByTestId('v2-continue-session')
  await expect(continueButton).toBeVisible()
  await continueButton.click()

  await expect(page.getByTestId('v2-active-session')).toHaveText(`Session ${sessionId}`)
})
