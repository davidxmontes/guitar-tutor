import { expect, test, type Page } from '@playwright/test';

const note = (page: Page, string: number, fret: number) => page.getByRole('button', { name: new RegExp(`^String ${string}, fret ${fret},`) });
const saved = (page: Page) => expect(page.locator('.chord-save-status')).toHaveText('Saved');
async function open(page: Page) {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Find a chord on the fretboard' }).click();
  await expect(page.getByRole('heading', { name: 'What’s in this shape?' })).toBeVisible();
}
async function cMajor(page: Page) {
  await note(page, 1, 0).click(); await note(page, 2, 1).click(); await note(page, 3, 0).click();
  await saved(page);
}

test('draw, interpret, preview, apply and undo a shape without model calls', async ({ page }) => {
  let models = 0;
  page.on('request', r => { if (r.url().endsWith('/tutor/jobs')) models++; });
  await open(page); await cMajor(page);
  const c = page.getByRole('button', { name: 'C All chord tones present', exact: true });
  await c.click(); await saved(page);
  await expect(c).toHaveAttribute('aria-pressed', 'true');
  await page.getByText('Tuning & optional key', { exact: true }).click();
  await page.getByLabel('Root', { exact: true }).selectOption('C');
  await expect(page.getByRole('button', { name: 'C All chord tones present In your key', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Root', { exact: true }).selectOption('F#');
  await expect(c).toHaveAttribute('aria-pressed', 'true');
  await page.getByText('Tuning & optional key', { exact: true }).click();
  // Suggestions are musically ranked; choose the Cmaj7 result regardless of its bass/position rank.
  await page.locator('.chord-suggestions').filter({ has: page.locator('summary', { hasText: /^Change its sound/ }) }).getByText('More options', { exact: true }).click();
  const seventh = page.locator('.chord-suggestions').filter({ has: page.locator('summary', { hasText: /^Change its sound/ }) }).getByRole('button').filter({ hasText: /^Cmaj7/ }).first();
  await seventh.click();
  await expect(page.getByLabel('Suggestion preview')).toBeVisible();
  await expect(note(page, 1, 0)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Hear suggestion' }).click();
  await page.getByRole('button', { name: 'Apply suggestion' }).click(); await saved(page);
  await expect(page.getByRole('button', { name: /Cmaj7 All chord tones present/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await saved(page);
  await expect(c).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pin shape', exact: true }).click();
  await expect(page.getByLabel('Pinned voicings')).toBeVisible();
  await page.getByRole('button', { name: 'Add chord to scratch', exact: true }).click();
  await expect(page.getByTestId('scratch-count')).toHaveText('1 scratch chord');
  await expect(page).toHaveURL(/session=/);
  await page.reload();
  await expect(c).toHaveAttribute('aria-pressed', 'true');
  await expect(note(page, 3, 0)).toHaveAttribute('aria-pressed', 'true');
  await note(page, 2, 3).click(); await saved(page);
  await expect(note(page, 2, 1)).toHaveAttribute('aria-pressed', 'false');
  await note(page, 2, 3).click(); await saved(page);
  await expect(note(page, 2, 3)).toHaveAttribute('aria-pressed', 'false');
  expect(models).toBe(0);
  await page.screenshot({ path: '/tmp/chord-explorer-desktop.png', fullPage: true });
});

test('rapid edits survive delayed writes and a failed save retains the local draft', async ({ page }) => {
  await open(page);
  let fail = true;
  await page.route('**/branches/*/harmony', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await new Promise(resolve => setTimeout(resolve, 150));
    if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Temporarily unavailable' }) });
    return route.continue();
  });
  await note(page, 1, 0).click(); await note(page, 2, 1).click(); await note(page, 3, 0).click();
  await expect(page.getByRole('alert')).toContainText('Your shape is still here');
  for (const [string, fret] of [[1, 0], [2, 1], [3, 0]]) await expect(note(page, string, fret)).toHaveAttribute('aria-pressed', 'true');
  fail = false;
  await page.getByRole('button', { name: 'Retry save' }).click(); await saved(page);
  await expect(page.getByRole('button', { name: 'C All chord tones present', exact: true })).toBeVisible();
});

test('keyboard editing and mobile dark layout keep the neck and results accessible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  await note(page, 1, 0).focus(); await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  await saved(page);
  await expect(page.getByRole('button', { name: 'C All chord tones present', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(page.getByLabel('Build your chord shape').locator('[tabindex="0"]')).toHaveCount(1);
  await page.screenshot({ path: '/tmp/chord-explorer-mobile.png', fullPage: true });
});

test('leaving during rapid edits finishes the latest shape without navigating back', async ({ page }) => {
  await open(page);
  const url = page.url();
  await page.route('**/branches/*/harmony', async route => {
    if (route.request().method() === 'PATCH') await new Promise(resolve => setTimeout(resolve, 250));
    await route.continue();
  });
  await note(page, 1, 0).click(); await note(page, 2, 1).click(); await note(page, 3, 0).click();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.getByRole('heading', { name: /What would you like/ })).toBeVisible();
  const params = new URL(url).searchParams;
  const api = `/api/v2/sessions/${params.get('session')}/branches/${params.get('branch')}/harmony`;
  await expect.poll(async () => (await (await page.request.get(api)).json()).branch.harmony_exploration.focus.positions.length).toBe(3);
  await expect(page.getByRole('heading', { name: /What would you like/ })).toBeVisible();
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'C All chord tones present', exact: true })).toBeVisible();
});

test('a stale write keeps the local draft until explicitly reloaded', async ({ page }) => {
  await open(page); await cMajor(page);
  const params = new URL(page.url()).searchParams;
  const api = `/api/v2/sessions/${params.get('session')}/branches/${params.get('branch')}/harmony`;
  await page.request.patch(api, { data: { focus: { kind: 'shape', positions: [], interpretation: null } } });
  await note(page, 5, 3).click();
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  await expect(note(page, 5, 3)).toHaveAttribute('aria-pressed', 'true');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Reload saved shape' }).click();
  await expect(page.getByRole('heading', { name: 'Start with a few notes' })).toBeVisible();
  await expect(note(page, 5, 3)).toHaveAttribute('aria-pressed', 'false');
});

test('malformed session links cannot change the API path', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/v2/sessions/')) requests.push(request.url()); });
  await page.goto('/v2?session=..%2Fother');
  await expect(page.getByRole('alert')).toContainText('session link is invalid');
  expect(requests).toEqual([]);
});
