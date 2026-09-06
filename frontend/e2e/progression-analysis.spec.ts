import { expect, test } from '@playwright/test';

test('function, real voice motion, replacement and Exercise from an idea', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Build a four-chord progression' }).click();
  await expect(page.getByTestId('progression-workspace')).toBeVisible();
  const sid = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '');
  const bid = (await page.getByTestId('v2-active-branch').textContent())!.replace('Branch ', '');
  await page.getByLabel('Ask the Tutor').fill('Show progression analysis');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByLabel('Harmonic function')).toContainText('Tonic');
  await expect(page.getByLabel('Harmonic function')).toContainText('Dominant');
  await expect(page.getByLabel('Voice leading')).toContainText('one possible realization');
  await page.getByLabel('Key root', { exact: true }).selectOption('');
  await expect(page.getByLabel('Harmonic function')).toContainText('Set a key');
  await page.getByLabel('Key root', { exact: true }).selectOption('C');
  const base = `/api/v2/sessions/${sid}/branches/${bid}/progression`;
  const surface = await page.request.get(base).then(r => r.json());
  const idea = surface.branch.progression_workspace.ideas[0];
  for (const step of surface.resolved[idea.id].steps.slice(0,2)) {
    const v = step.voicings[0];
    await page.request.patch(base, { data: { step_id: step.id, voicing: { positions: v.positions.map((p: {string: number; fret: number}) => ({ string: p.string, fret: p.fret })), tuning: v.tuning } } });
  }
  await page.reload(); await page.locator(`[data-session-id="${sid}"]`).click();
  await expect(page.getByLabel('Voice leading')).toContainText('Assigned voicings: real motion');
  await page.getByRole('button', { name: 'Inspect transition', exact: true }).first().click();
  await expect(page.getByRole('navigation', { name: 'Focus breadcrumb' })).toContainText('transition 1');
  await expect(page.getByLabel('Fretboard layers')).toContainText('G major');
  await page.getByRole('button', { name: 'Replace chord', exact: true }).click();
  await page.getByRole('combobox', { name: 'Replacement root', exact: true }).selectOption('D');
  await page.getByRole('button', { name: 'Done replacing' }).click();
  await page.getByRole('button', { name: 'Create exercise', exact: true }).click();
  await page.getByLabel('Exercise title').fill('Landing drill');
  await page.getByLabel('Practice goal').fill('Land each chord cleanly');
  await page.getByLabel('Step order').fill('1,2,1');
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click();
  await expect(page.getByText('Exercise saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play exercise', exact: true }).click();
  await page.getByRole('button', { name: 'Stop exercise', exact: true }).click();
  const exercises = await page.request.get('/api/v2/exercises').then(r => r.json());
  const saved = exercises.find((e: {title: string}) => e.title === 'Landing drill');
  expect(saved.payload.steps).toHaveLength(3);
  expect(saved.payload.created_from.idea.id).toBe(idea.id);
  await page.screenshot({ path: 'test-results/progression-analysis.png', fullPage: true });
});
