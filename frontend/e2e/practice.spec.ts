import { expect, test } from '@playwright/test'

test('practice clock respects rests, fractional durations, count-in, loops, and end', async ({ page }) => {
  await page.goto('/v2')
  const result = await page.evaluate(async () => {
    const path = '/src/v2/practiceTiming.ts'
    const { practicePosition, beatDuration } = await import(path)
    return {
      durations: [beatDuration({ duration: [3, 8] }), beatDuration({ duration: [1, 4], rest: true }), beatDuration({})],
      count: practicePosition([1.5, 1, 0.5], 3, 4, true),
      first: practicePosition([1.5, 1, 0.5], 4, 4, true),
      next: practicePosition([1.5, 1, 0.5], 5.5, 4, true),
      loop: practicePosition([1.5, 1, 0.5], 7, 4, true),
      end: practicePosition([1.5, 1, 0.5], 7, 4, false),
    }
  })
  expect(result.durations).toEqual([1.5, 1, null])
  expect(result.count).toMatchObject({ index: -1, count: 1 })
  expect(result.first).toMatchObject({ index: 0, next: 1 })
  expect(result.next).toMatchObject({ index: 1, next: 2 })
  expect(result.loop).toMatchObject({ index: 0, next: 1 })
  expect(result.end).toMatchObject({ finished: true, index: 2, next: null })
})

test('progression practice keeps sequence, tempo and playhead through Focus and restores selection', async ({ page }) => {
  await page.goto('/v2')
  const session = await page.request.post('/api/v2/sessions').then(r => r.json())
  const opened = await page.request.post('/api/v2/progressions/explore', { data: {
    session_id: session.id, branch_id: session.branches[0].id,
    progression: { title: 'Practice changes', chords: [0, 2, 4].map(fret => ({ root: 'E', quality: 'color', voicing: [{ string: 1, fret }], tuning: 'standard' })), inspired_by: null },
  } }).then(r => r.json())
  await page.reload()
  await page.locator(`[data-session-id="${session.id}"]`).click()
  await page.getByRole('tab', { name: 'Practice changes' }).click()
  await page.getByTestId('progression-chord').nth(2).click()
  await page.getByRole('button', { name: 'Practice progression' }).click()
  await page.getByLabel('Beats per chord').selectOption('1')
  await page.getByLabel('Count in', { exact: true }).selectOption('0')
  await page.getByLabel('Practice tempo').fill('240')
  await page.getByLabel('Metronome', { exact: true }).uncheck()
  await page.clock.install()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.clock.runFor(300)
  await expect(page.getByTestId('progression-chord').nth(1)).toHaveAttribute('data-practice-role', 'active')
  await expect(page.getByTestId('progression-chord').nth(2)).toHaveAttribute('data-practice-role', 'upcoming')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Focus practice', exact: true }).click()
  await expect(page.getByTestId('tutor-chat')).toBeHidden()
  await expect(page.getByTestId('progression-chord')).toHaveCount(3)
  await expect(page.getByLabel('Practice tempo')).toHaveValue('240')
  await page.screenshot({ path: '/private/tmp/issue19-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Exit Focus', exact: true }).click()
  await expect(page.getByTestId('progression-chord').nth(1)).toHaveAttribute('data-practice-role', 'active')
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await page.getByLabel('Count in', { exact: true }).selectOption('4')
  await page.getByLabel('Metronome', { exact: true }).check()
  await page.getByLabel('Loop', { exact: true }).uncheck()
  await page.evaluate(() => {
    const original = AudioContext.prototype.createOscillator;
    Object.assign(window, { practiceClicks: 0 });
    AudioContext.prototype.createOscillator = function () {
      (window as unknown as { practiceClicks: number }).practiceClicks++;
      return original.call(this);
    };
  })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByTestId('practice-status')).toHaveText('Count in 4')
  await page.clock.runFor(525)
  await expect(page.getByTestId('practice-status')).toHaveText('Count in 2')
  expect(await page.evaluate(() => (window as unknown as { practiceClicks: number }).practiceClicks)).toBe(3)
  await page.getByLabel('Practice tempo').fill('120')
  await page.clock.runFor(1000)
  await expect(page.getByTestId('progression-chord').nth(0)).toHaveAttribute('data-practice-role', 'active')
  await page.getByLabel('Metronome', { exact: true }).uncheck()
  const clicks = await page.evaluate(() => (window as unknown as { practiceClicks: number }).practiceClicks)
  await page.clock.runFor(1500)
  await expect(page.getByTestId('practice-status')).toHaveText('Finished')
  expect(await page.evaluate(() => (window as unknown as { practiceClicks: number }).practiceClicks)).toBe(clicks)
  await page.getByRole('button', { name: 'Exit Practice', exact: true }).click()
  await expect(page.getByTestId('progression-chord').nth(2)).toHaveAttribute('aria-pressed', 'true')
  const restored = await page.request.get(`/api/v2/sessions/${session.id}`).then(r => r.json())
  expect(restored.branches.find((b: {id: string}) => b.id === opened.branch.id).selection).toEqual({ type: 'progression_chord', index: 2 })
})

test('song range practice advances real tab timing without changing saved selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/v2')
  const session = await page.request.post('/api/v2/sessions').then(r => r.json())
  const branch = session.branches[0]
  const selection = { type: 'range', startMeasureIndex: 1, endMeasureIndex: 2 }
  await page.request.patch(`/api/v2/sessions/${session.id}/branches/${branch.id}`, { data: {
    title: 'Timed passage', current_artifact_kind: 'song_study', current_artifact_id: 'timed-song', selection,
    focus: { measureIndex: 1, windowSize: 2 },
  } })
  await page.route('**/api/v2/song-studies/timed-song', route => route.fulfill({ json: {
    id: 'timed-song', kind: 'song_study', title: 'Timed passage', payload: {
      title: 'Timed passage', artist: 'Practice fixture', track: { index: 0, name: 'Guitar', instrument: 'Guitar', tuning: [64, 59, 55, 50, 45, 38] },
      tab_data: { measures: [
        { voices: [{ beats: [{ duration: [1, 4], notes: [{ string: 0, fret: 9 }] }] }] },
        { voices: [{ beats: [{ duration: [1, 4], notes: [{ string: 5, fret: 0 }] }, { duration: [1, 8], rest: true, notes: [] }] }] },
        { voices: [{ beats: [{ duration: [3, 8], notes: [{ string: 1, fret: 2 }] }] }] },
      ] }, shape_events: [], enrichment: null,
    },
  } }))
  await page.reload()
  await page.locator(`[data-session-id="${session.id}"]`).click()
  await page.getByRole('button', { name: 'Practice selection' }).click()
  await page.getByLabel('Practice tempo').fill('120')
  await page.getByLabel('Count in', { exact: true }).selectOption('0')
  await page.getByLabel('Metronome', { exact: true }).uncheck()
  await page.clock.install()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.clock.runFor(525)
  await expect(page.getByTestId('practice-song-position')).toContainText('Current: measure 2, event 2')
  await expect(page.getByTestId('fretboard-active-note')).toHaveCount(0)
  await page.clock.runFor(250)
  await expect(page.getByTestId('practice-song-position')).toContainText('Current: measure 3, event 1')
  await expect(page.locator('[data-testid="fretboard-active-note"][data-string="2"][data-fret="2"]')).toBeVisible()
  await page.clock.runFor(750)
  await expect(page.getByTestId('practice-song-position')).toContainText('Current: measure 2, event 1')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Focus practice', exact: true }).click()
  await page.screenshot({ path: '/private/tmp/issue19-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Exit Practice', exact: true }).click()
  const restored = await page.request.get(`/api/v2/sessions/${session.id}`).then(r => r.json())
  expect(restored.branches[0].selection).toEqual(selection)
  expect(restored.branches[0].current_artifact_id).toBe('timed-song')
  await expect(page.getByTestId('song-study-title')).toContainText('Timed passage')
})
