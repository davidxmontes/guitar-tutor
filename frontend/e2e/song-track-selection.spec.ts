import { expect, test } from '@playwright/test';

test('guitar tracks stay visible while other instruments collapse and retain import indices', async ({ page }) => {
  await page.route('**/api/songs/search?*', async route => {
    const response = await route.fetch();
    const data = await response.json();
    const song = data.results[0];
    const guitar = song.tracks[0];
    song.tracks = [
      { ...guitar, index: 9, name: 'Drums', instrument: 'Drums' },
      { ...guitar, name: 'Lead guitar', instrument: 'Overdriven Guitar' },
      { ...guitar, index: 7, name: 'Vocals', is_vocal: true },
      { ...guitar, index: 4, name: 'Bass', instrument: 'Electric Bass (finger)' },
    ];
    await route.fulfill({ response, json: data });
  });
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lead guitar', exact: true })).toBeVisible();
  const others = page.getByTestId('song-study-result').locator('details');
  await expect(others).not.toHaveAttribute('open', '');
  for (const name of ['Drums', 'Vocals', 'Bass']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await others.locator('summary').press('Enter');
  await expect(page.getByRole('button', { name: 'Vocals', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const request = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/song-studies'));
  await page.getByRole('button', { name: 'Lead guitar', exact: true }).click();
  expect((await request).postDataJSON().track_index).toBe(0);
  await expect(page.getByTestId('song-study-title')).toContainText('Study Fixture');
});
