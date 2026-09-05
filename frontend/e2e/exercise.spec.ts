import { expect, test } from '@playwright/test'

test('save a deliberate progression drill and practice it in a fresh session', async ({ page }) => {
  await page.goto('/v2')
  const session = await page.request.post('/api/v2/sessions').then(r => r.json())
  await page.request.post('/api/v2/progressions/explore', { data: {
    session_id: session.id, branch_id: session.branches[0].id,
    progression: { title: 'Drill source', chords: [0, 2].map(fret => ({ root: 'D', quality: 'color', voicing: [{ string: 6, fret }], tuning: [64,59,55,50,45,38] })) },
  } })
  await page.reload()
  await page.locator(`[data-session-id="${session.id}"]`).click()
  await page.getByRole('tab', { name: 'Drill source' }).click()
  await page.getByRole('button', { name: 'Practice progression' }).click()
  expect(await page.request.get('/api/v2/exercises').then(r => r.json())).toEqual([])
  await page.getByRole('button', { name: 'Exit Practice', exact: true }).click()
  await page.getByRole('button', { name: 'Create exercise', exact: true }).click()
  await page.getByLabel('Exercise title').fill('Bass transition drill')
  await page.getByLabel('Practice goal').fill('Keep the bass change even')
  await page.getByLabel('Step order').fill('1,2,1')
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Exercise saved')
  const saved = await page.request.get('/api/v2/exercises').then(r => r.json())
  expect(saved[0].payload.steps.map((s: {positions: {fret: number}[]}) => s.positions[0].fret)).toEqual([0,2,0])
  await page.goto('/v2')
  await page.getByRole('button', { name: 'Open Bass transition drill' }).click()
  await expect(page.getByTestId('exercise-workspace')).toBeVisible()
  await expect(page.getByTestId('exercise-step')).toHaveCount(3)
  await page.getByRole('button', { name: 'Practice exercise' }).click()
  await page.getByLabel('Count in', { exact: true }).selectOption('0')
  await page.getByLabel('Practice tempo').fill('240')
  await page.getByLabel('Metronome', { exact: true }).uncheck()
  await page.clock.install()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.clock.runFor(1050)
  await expect(page.getByTestId('exercise-step').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.screenshot({ path: '/private/tmp/issue20-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Focus practice' }).click()
  await page.screenshot({ path: '/private/tmp/issue20-mobile.png', fullPage: true })
})

test('song drill material preserves rests and tuning; concept drill uses selected physical shape', async ({ page }) => {
  await page.goto('/v2')
  const result = await page.evaluate(async () => {
    const path = '/src/v2/exerciseMaterial.ts'
    const { songDrill, conceptDrill } = await import(path)
    const song = { track: { tuning: [64,59,55,50,45,38] }, tab_data: { measures: [
      { voices: [{ beats: [{ duration: [1,4], notes: [{ string: 5, fret: 0 }] }, { duration: [1,8], rest: true, notes: [] }] }] },
      { voices: [{ beats: [{ duration: [1,4], notes: [{ string: 0, fret: 9 }] }] }] },
    ] } }
    const selected = songDrill(song, { type: 'range', startMeasureIndex: 0, endMeasureIndex: 0 }, { measureIndex: 1, windowSize: 2 })
    const missing = songDrill({ ...song, track: { tuning: [] } }, null, { measureIndex: 0 })
    const chord = conceptDrill({ tuning: ['E','B','G','D','A','E'], visualization: 'chord', selected_voicing: 1,
      voicings: [{ label: 'First', positions: [{ string: 1, fret: 0 }] }, { label: 'Second', positions: [{ string: 2, fret: 3 }] }] })
    return { selected, missing, chord }
  })
  expect(result.selected.map((s: {beats: number}) => s.beats)).toEqual([1,0.5])
  expect(result.selected[0]).toMatchObject({ positions: [{ string: 6, fret: 0 }], tuning: [64,59,55,50,45,38] })
  expect(result.selected[1].positions).toEqual([])
  expect(result.missing).toEqual([])
  expect(result.chord[0].positions).toEqual([{ string: 2, fret: 3 }])
})

test('saved concept offers deliberate exercise creation', async ({ page }) => {
  await page.goto('/v2')
  const session = await page.request.post('/api/v2/sessions').then(r => r.json())
  const opened = await page.request.post('/api/v2/concept-studies', { data: {
    session_id: session.id, branch_id: session.branches[0].id, root: 'A', concept_id: 'pentatonic_minor', promotion: 'work_on_this',
  } }).then(r => r.json())
  await page.reload()
  await page.locator(`[data-session-id="${session.id}"]`).click()
  await page.getByRole('tab', { name: opened.artifact.title }).click()
  await page.getByRole('button', { name: 'Create exercise', exact: true }).click()
  await page.getByLabel('Exercise title').fill('Three-note return')
  await page.getByLabel('Practice goal').fill('Return smoothly to the first note')
  await page.getByLabel('Step order').fill('1,2,3,2,1')
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Exercise saved')
  const exercises = await page.request.get('/api/v2/exercises').then(r => r.json())
  const saved = exercises.find((e: {title: string}) => e.title === 'Three-note return')
  expect(saved.payload.steps).toHaveLength(5)
  expect(saved.payload.steps[0]).toEqual(saved.payload.steps[4])
  expect(saved.payload.created_from.artifact_id).toBe(opened.artifact.id)
})
