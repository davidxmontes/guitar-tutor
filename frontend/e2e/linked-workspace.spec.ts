import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function ask(page: Page, message: string) {
  await page.getByLabel('Ask the Tutor').fill(message);
  const response = page.waitForResponse(r => r.url().endsWith('/tutor/jobs'));
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled();
}

test('Tutor layout links circle, pitch strip and fretboard without model calls on gestures', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Learn the fretboard', exact: true }).click();
  await page.getByLabel('Root', { exact: true }).selectOption('D');
  await page.getByLabel('Scale', { exact: true }).selectOption('dorian');
  await ask(page, 'Compose linked mode exploration');
  await expect(page.getByLabel('Scale degrees').getByRole('button', { name: 'Degree 6' })).toHaveAttribute('aria-pressed', 'true');
  let turns = 0;
  page.on('request', r => { if (r.url().endsWith('/tutor/jobs')) turns++; });
  await page.getByRole('button', { name: 'Key E', exact: true }).click();
  await expect(page.getByLabel('Root', { exact: true })).toHaveValue('E');
  await expect(page.getByLabel('Scale', { exact: true })).toHaveValue('dorian');
  await expect(page.getByLabel('Scale degrees')).toContainText('C#');
  await page.getByRole('button', { name: 'Circle chord Em', exact: true }).click();
  await expect(page.getByLabel('Fretboard layers')).toContainText('E minor');
  await expect(page.getByLabel('Root', { exact: true })).toHaveValue('E');
  await expect(page.getByLabel('Scale', { exact: true })).toHaveValue('dorian');
  await page.getByRole('button', { name: 'Degree 6', exact: true }).click();
  await expect(page.getByLabel('Fretboard layers')).toContainText('degree 6');
  const focal = page.getByLabel('harmony fretboard').locator('.music-note--focal');
  expect(await focal.count()).toBeGreaterThan(0);
  for (const text of await focal.evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')))) expect(text).toContain('C#');
  await expect(page.getByRole('navigation', { name: 'Learning views' }).getByRole('button', { name: 'Tutor’s view', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect.poll(async () => page.getByLabel('Scrollable fretboard').evaluate(el => el.querySelector('svg')!.getBoundingClientRect().width >= el.clientWidth - 1)).toBe(true);
    await page.screenshot({ path: `test-results/linked-mode-${width}.png`, fullPage: true });
  }
  expect(turns).toBe(0);
});

test('diagram selection synchronizes exact physical notes and survives a failed write', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: /02 \/ TRIADS/ }).click();
  await ask(page, 'Compose linked chord shapes');
  let turns = 0;
  page.on('request', r => { if (r.url().endsWith('/tutor/jobs')) turns++; });
  const diagram = page.getByLabel('Voicing explorer').locator('.diagram-select').first();
  const description = await diagram.getByRole('img').getAttribute('aria-label');
  const expected = [...description!.matchAll(/String (\d) fret (\d+)/g)].map(m => `${m[1]}:${m[2]}`).sort();
  await diagram.click();
  await page.mouse.move(0, 0);
  await expect(diagram).toHaveAttribute('aria-pressed', 'true');
  const notes = page.getByLabel('harmony fretboard').locator('.music-note--focal');
  await expect(notes).toHaveCount(expected.length);
  const actual = await notes.evaluateAll(nodes => nodes.map(n => { const m = n.getAttribute('aria-label')!.match(/string (\d), fret (\d+)/)!; return `${m[1]}:${m[2]}`; }).sort());
  expect(actual).toEqual(expected);
  await page.getByLabel('Last fret', { exact: true }).fill('24');
  await expect(page.getByLabel('Last fret', { exact: true })).toHaveValue('24');
  await page.route('**/harmony', route => route.request().method() === 'PATCH' ? route.fulfill({ status: 409, body: '{"detail":"stale"}' }) : route.continue());
  await page.getByLabel('Voicing explorer').locator('.diagram-select').nth(1).click();
  await page.mouse.move(0, 0);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(diagram).toHaveAttribute('aria-pressed', 'true');
  expect(turns).toBe(0);
});

test('progression selection and transitions retain the composed layout and link diagrams', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Build a four-chord progression' }).click();
  await ask(page, 'Compose linked progression');
  await page.getByRole('button', { name: 'Chord 3: A minor', exact: true }).click();
  await expect(page.getByLabel('Selected chord diagram')).toContainText('A minor');
  await expect(page.getByLabel('Fretboard layers')).toContainText('A minor');
  await expect(page.getByRole('navigation', { name: 'Progression views' }).getByRole('button', { name: 'Tutor’s view', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Voice leading', { exact: true }).getByRole('button', { name: 'C major → G major', exact: true }).click();
  await expect(page.getByLabel('Selected chord diagram').getByRole('img')).toHaveCount(2);
  await expect(page.getByLabel('Fretboard layers')).toContainText('C major');
  await expect(page.getByLabel('Fretboard layers')).toContainText('G major');
  await page.setViewportSize({ width: 320, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: 'test-results/linked-progression-mobile.png', fullPage: true });
});
