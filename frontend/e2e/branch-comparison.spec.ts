import { expect, test } from '@playwright/test'

test('comparison shapes retain source tuning and stay in their own conversation', async ({ page }) => {
  await page.goto('/v2')
  const session = await page.request.post('/api/v2/sessions').then(r => r.json())
  const base = session.branches[0]
  const open = async (title: string, tuning: number[]) => page.request.post('/api/v2/progressions/explore', { data: { session_id: session.id, branch_id: base.id, progression: { title, chords: [{ root: 'D', quality: 'color', voicing: [{ string: 6, fret: 0 }], tuning }] } } }).then(r => r.json())
  const source = await open('Drop D source', [64,59,55,50,45,38])
  const current = await open('Standard idea', [64,59,55,50,45,40])
  const comparison_groups = [
    { branch_id: source.branch.id, branch_title: 'Drop D source', label: 'Low D', notes: [{ string: 6, fret: 0 }], tuning: [64,59,55,50,45,38] },
    { branch_id: current.branch.id, branch_title: 'Standard idea', label: 'Low E', notes: [{ string: 6, fret: 0 }], tuning: [64,59,55,50,45,40] },
  ]
  let answered = false
  await page.route('**/api/v2/tutor/turns', async route => { answered = true; await route.fulfill({ json: { message: 'These open bass notes differ by a whole step.', comparison_groups, candidates: null } }) })
  await page.route(`**/api/v2/tutor/threads/${current.branch.tutor_thread_id}/messages`, route => route.fulfill({ json: answered ? [{ id: 'comparison-answer', role: 'assistant', content: { text: 'These open bass notes differ by a whole step.', comparison_groups }, created_at: '2026-09-05' }] : [] }))
  await page.reload()
  await page.locator(`[data-session-id="${session.id}"]`).click()
  await page.getByRole('tab', { name: 'Standard idea', exact: true }).click()
  await page.getByTestId('tutor-chat-input').fill('Compare this with Drop D source')
  await page.getByTestId('tutor-chat-send').click()
  await expect(page.getByTestId('branch-comparison-shape')).toHaveCount(2)
  await expect(page.getByTestId('branch-comparison-shape').first()).toContainText('Drop D source')
  await expect(page.getByTestId('branch-comparison-shape').first().getByRole('img')).toHaveAttribute('aria-label', /Tuning D A D G B E/ )
  await expect(page.getByTestId('branch-comparison-shape').nth(1).getByRole('img')).toHaveAttribute('aria-label', /Tuning E A D G B E/ )
  await page.screenshot({ path: '/private/tmp/issue24-desktop.png', fullPage: true })
  await page.getByRole('tab', { name: 'Drop D source', exact: true }).click()
  await expect(page.getByTestId('branch-comparison-shape')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Standard idea', exact: true }).click()
  await expect(page.getByTestId('branch-comparison-shape')).toHaveCount(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/private/tmp/issue24-mobile.png', fullPage: true })
  const after = await page.request.get(`/api/v2/sessions/${session.id}`).then(r => r.json())
  expect(after.branches[1].selection).toEqual(source.branch.selection)
  expect(after.branches[2].selection).toEqual(current.branch.selection)
})
