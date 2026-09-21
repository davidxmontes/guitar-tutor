import { expect, test } from '@playwright/test';

async function openSong(page: import('@playwright/test').Page) {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
  await page.getByLabel('Playback source').selectOption('practice');
}

test('song Tutor snapshots learner selection, survives refresh, and keeps chat separate from Harmony', async ({ page }) => {
  await openSong(page);
  const before = await (await page.request.get('/api/v2/sessions')).json();
  await expect(page.getByRole('complementary', { name: 'Your Tutor' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select beat 2 of measure 2', exact: true }).click();
  await page.getByText('Ask about selection', { exact: true }).click();
  await expect(page.locator('.tutor-context')).toContainText('M2 · beat 2');
  const request = page.waitForRequest(request => request.url().endsWith('/tutor/jobs') && request.method() === 'POST');
  await page.getByLabel('Ask the Tutor').fill('Explain this passage');
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
  await page.getByLabel('Ask the Tutor').press('Enter');
  const payload = (await request).postDataJSON();
  expect(payload.song_context.selection).toEqual({ type: 'beat', measureIndex: 1, beatIndex: 1 });
  expect(payload.song_context.artifact_id).toBe(new URL(page.url()).searchParams.get('song'));
  expect(payload.branch_id).not.toBe(before[0].branches[0].id);
  await expect(page.locator('.tutor-message--assistant')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /Undo musical|Keep|Show this teaching/ })).toHaveCount(0);
  await page.getByLabel('Ask the Tutor').fill('My next question');
  await page.reload();
  await page.getByText('Ask about selection', { exact: true }).click();
  await expect(page.getByLabel('Ask the Tutor')).toHaveValue('My next question');
  await expect(page.locator('.tutor-message--assistant')).toHaveCount(1);
  await expect(page.locator('.tutor-message--user')).toHaveCount(1);
  const after = await (await page.request.get('/api/v2/sessions')).json();
  expect(after).toHaveLength(before.length);
  expect(after[0].branches).toHaveLength(before[0].branches.length + 1);
});

test('song Tutor handles unavailable provider and retries without a fabricated answer at320px', async ({ page }) => {
  await openSong(page);
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.getByText('Ask about selection', { exact: true }).click();
  let sent = false;
  await page.route('**/tutor/jobs', async route => {
    if (route.request().method() === 'POST' && !sent) {
      sent = true;
      await route.fulfill({ status: 503, json: { detail: 'Song Tutor is unavailable: configure an AI provider to ask questions.' } });
    } else await route.continue();
  });
  await page.getByLabel('Ask the Tutor').fill('Explain the techniques');
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
  await page.getByLabel('Ask the Tutor').press('Enter');
  await expect(page.getByRole('alert')).toContainText('configure an AI provider');
  await expect(page.getByLabel('Ask the Tutor')).toHaveValue('Explain the techniques');
  await expect(page.locator('.tutor-message--assistant')).toHaveCount(0);
  await page.getByRole('button', { name: 'Select beat 2 of measure 2', exact: true }).click();
  const retry = page.waitForRequest(request => request.url().endsWith('/tutor/jobs') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  expect((await retry).postDataJSON().song_context.selection).toEqual({ type: 'range', startMeasureIndex: 0, endMeasureIndex: 0 });
  await expect(page.locator('.tutor-message--assistant')).toBeVisible({ timeout: 15000 });
  await page.locator('.tutor-panel').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: '/tmp/song-tutor-mobile.png', fullPage: true });
  await page.locator('.tutor-panel').screenshot({ path: '/tmp/song-tutor-panel-mobile.png' });
});


test('song Tutor reconnects a pending answer after leaving and keeps its submitted passage', async ({ page }) => {
  await openSong(page);
  const url = page.url();
  await page.getByRole('button', { name: 'Select measure 2', exact: true }).click();
  await page.getByText('Ask about selection', { exact: true }).click();
  await page.getByLabel('Ask the Tutor').fill('Take your time answering');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.locator('.tutor-thinking')).toContainText('You can leave and return');
  await page.getByRole('button', { name: 'Select measure 3', exact: true }).click();
  await expect(page.locator('.tutor-message--user')).toContainText('Selected passage: M2–2');
  await page.getByRole('navigation', { name: 'Song navigation' }).getByRole('button', { name: 'Explore', exact: true }).click();
  await page.goto(url);
  await page.getByText('Ask about selection', { exact: true }).click();
  await expect(page.locator('.tutor-message--assistant')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.tutor-message--assistant')).toContainText('Selected passage: M2–2');
  await expect(page.locator('.tutor-message--user')).toHaveCount(1);
});
