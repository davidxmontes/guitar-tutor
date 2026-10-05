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
      { ...guitar, index: 1, name: 'Standard guitar', tuning: [64, 59, 55, 50, 45, 40] },
      { ...guitar, index: 2, name: 'Unknown guitar', tuning: null },
      { ...guitar, index: 3, name: 'Empty guitar', tuning: [] },
      { ...guitar, index: 7, name: 'Vocals', is_vocal: true },
      { ...guitar, index: 8, name: 'Lead Vocals', is_vocal: false },
      { ...guitar, index: 4, name: 'Bass', instrument: 'Electric Bass (finger)' },
    ];
    await route.fulfill({ response, json: data });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lead guitar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lead guitar', exact: true })).toHaveAccessibleDescription('Tuning (low to high): D A D G B E');
  await expect(page.getByRole('button', { name: 'Standard guitar', exact: true })).toHaveAccessibleDescription('Tuning (low to high): E A D G B E');
  for (const name of ['Unknown guitar', 'Empty guitar']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveAccessibleDescription('Tuning unavailable');
  }
  await page.screenshot({ path: '/tmp/song-tuning-search-desktop.png', fullPage: true });
  const others = page.getByTestId('song-study-result').locator('details');
  await expect(others).not.toHaveAttribute('open', '');
  for (const name of ['Drums', 'Vocals', 'Lead Vocals', 'Bass']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await others.locator('summary').press('Enter');
  await expect(page.getByRole('button', { name: 'Vocals', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: '/tmp/song-tuning-search-mobile.png', fullPage: true });
  const request = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/song-studies'));
  await page.getByRole('button', { name: 'Lead guitar', exact: true }).focus();
  await page.keyboard.press('Enter');
  expect((await request).postDataJSON().track_index).toBe(0);
  await expect(page.getByTestId('song-study-title')).toContainText('Study Fixture');
});

for (const scenario of [
  { name: 'track precedence', track: [64, 59, 55, 50, 45, 38], tab: [64, 59, 55, 50, 45, 40], label: 'Tuning (low to high): D A D G B E', low: 'D' },
  { name: 'null track fallback', track: null, tab: [64, 59, 55, 50, 45, 40], label: 'Tuning (low to high): E A D G B E', low: 'E' },
  { name: 'empty track fallback', track: [], tab: [64, 59, 55, 50, 45, 38], label: 'Tuning (low to high): D A D G B E', low: 'D' },
  { name: 'null tuning unavailable', track: null, tab: null, label: 'Tuning unavailable', low: null },
  { name: 'empty tuning unavailable', track: [], tab: [], label: 'Tuning unavailable', low: null },
]) {
  test(`selected song tuning uses ${scenario.name} across its music`, async ({ page }) => {
    await page.route('**/api/v2/song-studies', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      const song = await response.json();
      song.payload.track.tuning = scenario.track;
      song.payload.tab_data.tuning = scenario.tab;
      await route.fulfill({ response, json: song });
    });
    await page.goto('/v2');
    await page.getByRole('button', { name: 'Study a song', exact: true }).click();
    await page.getByLabel('Search songs').fill('fixture');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
    const label = page.getByTestId('song-study-tuning');
    await expect(label).toHaveText(scenario.label);
    await page.getByLabel('Playback source').selectOption('practice');
    await expect(label).toBeVisible();
    await page.getByRole('button', { name: 'Play-along', exact: true }).click();
    await expect(label).toBeVisible();
    if (scenario.low) {
      await expect(page.getByTestId('play-along').locator('.play-along-string').last()).toHaveText(scenario.low);
      await page.getByRole('button', { name: 'Practice selection', exact: true }).click();
      await page.getByLabel('Practice audio').selectOption('guide');
      await page.getByRole('button', { name: 'Focus practice', exact: true }).click();
      await expect(label).toBeVisible();
    } else {
      await expect(page.getByText('No tuning data for this track — showing tab only.', { exact: true })).toBeVisible();
    }
  });
}
