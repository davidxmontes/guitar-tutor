import { expect, test } from '@playwright/test'

// Ticket #101 (Seam 5): a new Session opens a Branch whose active_workspace is
// 'harmony' and renders the placeholder; BranchNavigation switches between two
// Branches.
test('new session opens a Harmony placeholder and BranchNavigation switches two branches', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/v2')

  await page.getByTestId('v2-start-session').click()

  const sessionId = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '')
  await expect(page.getByTestId('workspace-placeholder-harmony')).toBeVisible()

  // The new Branch really is a Harmony Exploration with active_workspace 'harmony'.
  const session = await page.request.get(`/api/v2/sessions/${sessionId}`).then(r => r.json())
  expect(session.branches).toHaveLength(1)
  expect(session.branches[0].active_workspace).toBe('harmony')
  expect(session.branches[0].harmony_exploration).not.toBeNull()
  expect(session.branches[0].progression_workspace).toBeNull()

  const firstBranchId = (await page.getByTestId('v2-active-branch').textContent())!.replace('Branch ', '')

  // A conversational fork adds a second Branch; BranchNavigation shows both tabs.
  await page.getByTestId('v2-new-branch').click()
  await expect(page.getByTestId('v2-branch-tab')).toHaveCount(2)

  const secondBranchId = (await page.getByTestId('v2-active-branch').textContent())!.replace('Branch ', '')
  expect(secondBranchId).not.toBe(firstBranchId)

  // Switch back to the first branch via the tab.
  await page.getByRole('tab', { name: 'New workspace' }).first().click()
  await expect(page.getByTestId('v2-active-branch')).toHaveText(`Branch ${firstBranchId}`)
  await expect(page.getByTestId('workspace-placeholder-harmony')).toBeVisible()
})
