import { expect, test } from '@playwright/test'

test('Circle harmony promotes an editable sequence and restores Study context', async ({ page }) => {
  await page.goto('/v2')
  await page.getByTestId('v2-start-concept').click()
  await page.getByTestId('study-concept-circle').click()
  await page.getByRole('button', { name: 'D major, relative B minor', exact: true }).click()
  await expect(page.getByTestId('circle-signature')).toContainText('F# · C#')
  await page.getByTestId('circle-chord').nth(4).click()
  await expect(page.getByTestId('circle-chord-tones')).toHaveText('A · C# · E')
  await page.getByRole('button', { name: 'I–V–vi–IV', exact: true }).click()
  await page.screenshot({ path: '/private/tmp/issue39-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/private/tmp/issue39-mobile.png', fullPage: true })
  await page.getByTestId('study-work-on-this').click()
  await expect(page.getByTestId('progression-workspace')).toBeVisible()
  await expect(page.getByTestId('progression-chord')).toHaveCount(4)
  const sid = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '')
  const session = await page.request.get(`/api/v2/sessions/${sid}`).then(r => r.json())
  const progression = await page.request.get(`/api/v2/progressions/${session.branches[1].current_artifact_id}`).then(r => r.json())
  expect(progression.payload.chords.map((c: {root: string}) => c.root)).toEqual(['D','A','B','G'])
  const changed = await page.request.patch(`/api/v2/progressions/${progression.id}/voicing`, { data: {
    expected_updated_at: progression.updated_at, chord_index: 0,
    chord: { root: 'D', quality: 'major', voicing: [{ string: 1, fret: 10 }], tuning: 'standard' },
  } })
  expect(changed.ok()).toBeTruthy()
  await page.getByRole('combobox', { name: /workspace/i }).selectOption(session.branches[0].id)
  await expect(page.getByTestId('circle-chord').nth(4)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'I–V–vi–IV', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('circle-chord-tones')).toHaveText('A · C# · E')
})
