import { expect, test } from '@playwright/test'

const tuning = [64, 59, 55, 50, 45, 38]
const chord = { root: 'D', quality: 'sparse', tuning, voicing: [{ string: 6, fret: 0 }, { string: 3, fret: 7 }, { string: 1, fret: 9 }] }

test('compare, hear, apply exact voicing, reject stale proposal, and reopen', async ({ page }) => {
  await page.goto('/v2')
  const session = await page.request.post('/api/v2/sessions').then(r => r.json())
  const opened = await page.request.post('/api/v2/progressions/explore', { data: {
    session_id: session.id, branch_id: session.branches[0].id,
    progression: { title: 'Open D colors', chords: [{ ...chord, quality: 'major', voicing: [{ string: 6, fret: 0 }, { string: 1, fret: 2 }] }], inspired_by: null },
  } }).then(r => r.json())
  const proposals = ['Sparse', 'Airy'].map((label, i) => ({ label, chord_index: 0, chord: { ...chord, voicing: chord.voicing.map(p => ({ ...p, fret: p.fret + i })) }, artifact_id: opened.artifact.id, expected_updated_at: opened.artifact.updated_at }))
  // Stub the external tutor result; application persistence and mutation APIs are real.
  let turns = 0
  await page.route('**/api/v2/tutor/turns', route => {
    turns++
    return route.fulfill({ json: { message: 'Compare these colors.', voicing_candidates: proposals, focus: null, candidates: null } })
  })
  await page.reload()
  await page.locator(`[data-session-id="${session.id}"]`).click()
  await page.getByRole('tab', { name: 'Open D colors' }).click()
  await page.getByTestId('tutor-chat-input').fill('Give me two unusual voicings')
  await page.getByTestId('tutor-chat-send').click()
  await expect(page.getByTestId('voicing-candidate')).toHaveCount(2)
  await expect(page.getByTestId('voicing-candidate').first().locator('svg')).toContainText('DADGBE')
  await page.getByRole('button', { name: 'Compare Sparse' }).click()
  await expect(page.getByTestId('voicing-fretboard')).toContainText('Sparse')
  await page.getByRole('button', { name: 'Hear Sparse' }).click()
  expect(turns).toBe(1)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: '/private/tmp/issue16-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/private/tmp/issue16-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Apply Sparse' }).click()
  await expect(page.getByRole('status')).toContainText('Voicing saved')
  const saved = await page.request.get(`/api/v2/progressions/${opened.artifact.id}`).then(r => r.json())
  expect(saved.payload.chords[0]).toEqual(chord)
  const stale = await page.request.patch(`/api/v2/progressions/${opened.artifact.id}/voicing`, { data: proposals[1] })
  expect(stale.status()).toBe(409)
  await page.reload()
  await page.locator(`[data-session-id="${session.id}"]`).click()
  await page.getByRole('combobox', { name: 'Current workspace' }).selectOption(opened.branch.id)
  await expect(page.getByTestId('progression-chord')).toContainText('Dsparse')
  expect(turns).toBe(1)
})

test('audition pitch uses exact frets and actual MIDI tuning', async ({ page }) => {
  await page.goto('/v2')
  const frequencies = await page.evaluate(async () => {
    // Import the public scheduling calculation through Vite, without synthesizing audio.
    const path = '/src/utils/audio.ts'
    const { getFrequency } = await import(path)
    return [getFrequency(6, 0, [64, 59, 55, 50, 45, 38]), getFrequency(6, 12, [64, 59, 55, 50, 45, 38]), getFrequency(1, 0, [64, 59, 55, 50, 45, 38])]
  })
  expect(frequencies[0]).toBeCloseTo(73.416, 2)
  expect(frequencies[1]).toBeCloseTo(146.832, 2)
  expect(frequencies[2]).toBeCloseTo(329.628, 2)
})
