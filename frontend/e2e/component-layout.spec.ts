import { expect, test } from '@playwright/test';

test('two-ring wheel supports keyboard chord selection and the neck fills its available width', async ({ page }) => {
  await page.goto('/v2');
  await page.getByLabel('Explore a scale, key or chord').fill('C major');
  await page.getByRole('button', { name: 'Explore music', exact: true }).click();
  const wheel = page.getByLabel('Tonal roots and diatonic chords');
  await expect(wheel.locator('.wheel-root')).toHaveCount(12);
  await expect(wheel.locator('.wheel-chord')).toHaveCount(7);
  let modelCalls = 0;
  page.on('request', request => { if (request.url().endsWith('/tutor/jobs')) modelCalls++; });
  const chord = wheel.getByRole('button', { name: 'Circle chord Am', exact: true });
  await chord.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Root', { exact: true })).toHaveValue('C');
  await expect(page.getByLabel('Fretboard layers')).toContainText('A minor');
  await page.getByRole('navigation', { name: 'Learning views' }).getByRole('button', { name: 'Circle of fifths', exact: true }).click();
  await page.getByRole('button', { name: 'Key G', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Root', { exact: true })).toHaveValue('G');
  for (const width of [1440, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.getByLabel('Scrollable fretboard').evaluate(el => el.querySelector('svg')!.getBoundingClientRect().width >= el.clientWidth - 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const shortPanel = page.getByLabel('Scale degrees');
    const height = (await shortPanel.boundingBox())!.height;
    expect(height).toBeLessThan(200);
    await page.screenshot({ path: `test-results/compact-circle-${width}.png`, fullPage: true });
  }
  expect(modelCalls).toBe(0);
});
