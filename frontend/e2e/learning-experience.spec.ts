import { expect, test } from '@playwright/test';

test('the Tutor can teach one triad while the learner can reveal alternatives', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: /02 \/ TRIADS/ }).click();
  await page.getByLabel('Ask the Tutor').fill('Show one triad');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByLabel('Tutor conversation')).toContainText('Play G, C and E');
  await expect(page.getByLabel('Triad explorer').getByRole('img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show more shapes', exact: true }).click();
  await expect(page.getByLabel('Triad explorer').getByRole('img')).toHaveCount(2);
});

test('a learner can explore scales, triads and CAGED without asking the Tutor', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Learn the fretboard', exact: true }).click();
  await page.getByLabel('Root', { exact: true }).selectOption('A');
  await page.getByLabel('Scale', { exact: true }).selectOption('pentatonic_minor');
  await page.getByRole('button', { name: 'Find the roots', exact: true }).click();
  const notes = page.getByLabel('harmony fretboard').getByRole('button');
  expect(await notes.count()).toBeGreaterThan(0);
  for (const label of await notes.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))) expect(label).toContain('degree 1,');
  await page.getByRole('button', { name: 'Show all notes', exact: true }).click();
  await page.getByRole('button', { name: 'Practice pattern', exact: true }).click();
  await expect(page.getByLabel('Practice audio')).toHaveValue('guide');
  await page.getByRole('button', { name: 'Exit Practice', exact: true }).click();
  await page.getByRole('navigation', { name: 'Learning views' }).getByRole('button', { name: 'Triads', exact: true }).click();
  await expect(page.getByLabel('Triad explorer').getByRole('img').first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/learning-triads-desktop.png', fullPage: true });
  await page.getByLabel('String set', { exact: true }).selectOption('2');
  await page.getByLabel('Inversion', { exact: true }).selectOption('1');
  await expect(page.getByLabel('Triad explorer').getByRole('heading', { name: 'First inversion' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Focus shape', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Focus shape', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pin shape', exact: true }).first().click();
  await expect(page.getByLabel('Pinned voicings')).toContainText('A minor');
  await page.getByRole('navigation', { name: 'Learning views' }).getByRole('button', { name: 'CAGED', exact: true }).click();
  await expect(page.getByLabel('Voicing explorer').getByRole('img')).toHaveCount(5);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByLabel('harmony fretboard')).toBeVisible();
  await page.getByRole('navigation', { name: 'Learning views' }).getByRole('button', { name: 'Circle of fifths', exact: true }).click();
  await page.getByRole('button', { name: 'Key G', exact: true }).click();
  await expect(page.getByLabel('Root', { exact: true })).toHaveValue('G');
  await expect(page.getByLabel('Scale', { exact: true })).toHaveValue('pentatonic_minor');
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.screenshot({ path: 'test-results/learning-circle-mobile.png', fullPage: true });
  await page.getByTestId('v2-new-branch').click();
  await expect(page.getByRole('navigation', { name: 'Learning views' }).getByRole('button', { name: 'Tutor’s view', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('learner controls reach the Tutor; history, recovery and undo preserve the conversation', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Learn the fretboard', exact: true }).click();
  await expect(page.getByLabel('Root', { exact: true })).toHaveValue('C');
  await page.getByText('How I teach · beginner').click();
  await page.getByLabel('Your level').selectOption('intermediate');
  await page.getByLabel('Teaching style').selectOption('practice');
  await page.getByLabel('Practice time').selectOption('10');
  await page.getByLabel('Ask the Tutor').fill('Change the key to E minor');
  const request = page.waitForRequest(r => r.url().endsWith('/tutor/turns'));
  const response = page.waitForResponse(r => r.url().endsWith('/tutor/turns'));
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  expect((await request).postDataJSON().learning_preferences).toEqual({ level: 'intermediate', style: 'practice', minutes: 10 });
  expect((await response).ok(), await (await response).text()).toBeTruthy();
  await expect(page.getByLabel('Root', { exact: true })).toHaveValue('E');
  await expect(page.getByLabel('Tutor conversation')).toContainText('Changed to E minor.');
  await page.getByLabel('Ask the Tutor').fill('Keep this unsent question');
  await page.getByRole('button', { name: 'Undo musical change', exact: true }).click();
  await expect(page.getByLabel('Root', { exact: true })).toHaveValue('C');
  await expect(page.getByLabel('Ask the Tutor')).toHaveValue('Keep this unsent question');
  await expect(page.getByLabel('Tutor conversation')).toContainText('Changed to E minor.');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByTestId('v2-continue-session').first().click();
  await expect(page.getByLabel('Tutor conversation')).toContainText('Changed to E minor.');
  await expect(page.getByLabel('Ask the Tutor')).toHaveValue('Keep this unsent question');
  await page.getByText('How I teach · intermediate').click();
  await expect(page.getByLabel('Your level')).toHaveValue('intermediate');
  await page.route('**/tutor/turns', route => route.fulfill({ status: 502, body: JSON.stringify({ detail: 'Provider unavailable' }) }));
  await page.getByLabel('Ask the Tutor').fill('Help me find the root');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByLabel('Ask the Tutor')).toHaveValue('Help me find the root');
  await expect(page.getByRole('alert')).toContainText('Your question is still here');
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('a progression can be practised immediately and the selected chord remains editable', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Build a four-chord progression' }).click();
  await page.getByRole('button', { name: 'Practice progression', exact: true }).click();
  await page.getByLabel('Count in', { exact: true }).selectOption('0');
  await page.getByLabel('Practice tempo').fill('120');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByTestId('practice-status')).toHaveText('Playing');
  await expect(page.getByTestId('playing-chord')).toContainText('C');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Exit Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Chord 2: G major', exact: true }).click();
  await expect(page.getByLabel('Progression editor').getByLabel('Step 2', { exact: true }).getByLabel('Chord root')).toBeVisible();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
