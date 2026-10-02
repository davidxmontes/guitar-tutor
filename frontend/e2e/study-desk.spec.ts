import { expect, test, type Page } from '@playwright/test';
import { installYouTubeFake } from './youtube-fake';

async function openSong(page: Page) {
  await page.goto('/v2');
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: 'Expand navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
  await expect(page.getByTestId('song-study-title')).toContainText('Study Fixture');
}

test('mobile measure selection keeps, revisits and removes a passage without creating an exercise', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSong(page);
  await page.getByLabel('Playback source').selectOption('practice');
  const songId = new URL(page.url()).searchParams.get('song');
  const exercisesBefore = await (await page.request.get('/api/v2/exercises')).json();
  const measures = page.getByTestId('song-study-overview-measure');
  await expect(measures).toHaveCount(4);
  await page.getByRole('button', { name: 'Select range', exact: true }).click();
  await page.getByRole('button', { name: 'Select measure 2', exact: true }).click();
  await page.getByRole('button', { name: 'Select measure 4', exact: true }).click();
  await expect(page.getByTestId('practice-selected-span')).toHaveText('M2–4');
  await page.getByRole('button', { name: 'Keep passage', exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/v2/song-studies/${songId}`)).json()).payload.saved_ranges)
    .toEqual([{ label: 'Intro · M2–4', start_measure: 2, end_measure: 4 }]);
  expect(await (await page.request.get('/api/v2/exercises')).json()).toHaveLength(exercisesBefore.length);
  await page.reload();
  await page.getByLabel('Playback source').selectOption('practice');
  await page.getByTestId('song-kept-passages').locator('summary').click();
  const kept = page.getByRole('button', { name: /^Revisit Intro · M2–4/ });
  await kept.click();
  await expect(page.getByTestId('practice-selected-span')).toHaveText('M2–4');
  await expect(page.getByRole('button', { name: 'Select measure 2, kept passage', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const remove = page.getByRole('button', { name: 'Remove kept passage Intro · M2–4', exact: true });
  await page.route('**/ranges', route => route.fulfill({ status: 409, json: { detail: 'Changed elsewhere' } }));
  await remove.click();
  await expect(page.getByRole('alert')).toContainText('Could not');
  await expect(kept).toBeVisible();
  await page.unroute('**/ranges');
  await remove.click();
  await expect(kept).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get(`/api/v2/song-studies/${songId}`)).json()).payload.saved_ranges).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('recording survives musical view switches and pauses before the mobile Tutor covers it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installYouTubeFake(page);
  await page.route('**/video-suggestions', route => route.fulfill({ json: { candidates: [], score_duration_seconds: null, duration_note: 'Score duration unavailable.' } }));
  await openSong(page);
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await page.getByLabel('YouTube link or video ID').fill('M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Attach recording', exact: true }).click();
  const player = page.locator('iframe[title="YouTube video player"]');
  await expect(player).toBeVisible();
  await page.evaluate(() => { window.youtubeFake.active.time = 12; window.youtubeFake.active.emitState(1); });
  await page.getByRole('button', { name: 'Fretboard', exact: true }).click();
  await expect(page.getByTestId('song-study-fretboard')).toBeVisible();
  await expect(player).toBeInViewport();
  await page.getByRole('button', { name: 'Score', exact: true }).click();
  await expect(player).toBeInViewport();
  await page.getByRole('button', { name: 'Tutor', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Tutor', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.state)).toBe(2);
  await page.getByRole('button', { name: 'Close Tutor', exact: true }).click();
  expect(await page.evaluate(() => ({ count: window.youtubeFake.players.length, time: window.youtubeFake.active.time, destroyed: window.youtubeFake.active.destroyed })))
    .toEqual({ count: 1, time: 12, destroyed: false });
  await expect(page.getByRole('button', { name: /Resume recording/ })).toBeVisible();
  await page.getByRole('button', { name: /Resume recording/ }).click();
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.state)).toBe(1);
  await expect(player).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Tutor', exact: true }).click();
  await page.getByLabel('Ask the Tutor').fill('Explain this passage');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.locator('.tutor-message--assistant')).toBeInViewport();
  const recording = await page.locator('.song-video').boundingBox();
  const conversation = await page.getByRole('region', { name: 'Tutor', exact: true }).boundingBox();
  expect(recording!.x + recording!.width).toBeLessThanOrEqual(conversation!.x);
  await expect(page.getByLabel('Ask the Tutor')).toBeInViewport();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Ask', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeInViewport();
  expect((await page.getByLabel('Tutor conversation').boundingBox())!.height).toBeGreaterThanOrEqual(320);
  expect((await player.boundingBox())!.height).toBeGreaterThanOrEqual(200);
  const transport = page.getByLabel('Video speed');
  await transport.scrollIntoViewIfNeeded();
  await expect(transport).toBeInViewport();
  const video = await player.boundingBox();
  expect((await transport.boundingBox())!.x).toBeGreaterThan(video!.x + video!.width);
  await page.getByText('Calibrate recording', { exact: false }).click();
  await page.getByRole('button', { name: 'Save video setup', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Save video setup', exact: true })).toBeInViewport();
  await expect(page.locator('.song-video-calibration')).toHaveCSS('overflow-y', 'visible');
  expect(await page.evaluate(() => ({ count: window.youtubeFake.players.length, destroyed: window.youtubeFake.active.destroyed })))
    .toEqual({ count: 1, destroyed: false });
});

test('Harmony and songs share Tutor layout preferences while leaving music a broad stage', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Learn the fretboard', exact: true }).click();
  const tutor = page.getByRole('region', { name: 'Tutor', exact: true });
  await expect(tutor).toBeVisible();
  await page.getByRole('separator', { name: 'Resize Tutor width', exact: true }).press('End');
  await page.getByLabel('Ask the Tutor').fill('Keep my Harmony draft');
  await page.getByRole('button', { name: 'Close Tutor', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tutor', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
  await page.getByLabel('Playback source').selectOption('practice');
  await expect(page.getByRole('button', { name: 'Tutor', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Tutor', exact: true }).click();
  await expect(tutor).toHaveCSS('width', '520px');
  expect((await page.locator('.song-study-score').boundingBox())!.width).toBeGreaterThanOrEqual(600);
  expect((await page.getByTestId('song-study-fretboard').boundingBox())!.width).toBeGreaterThanOrEqual(600);
  await page.getByRole('button', { name: 'Practice selection', exact: true }).click();
  await page.getByRole('button', { name: 'Focus practice', exact: true }).click();
  await expect(tutor).toBeHidden();
  expect((await page.locator('.song-study-score').boundingBox())!.width).toBeGreaterThan(1200);
  await page.getByRole('button', { name: 'Exit Focus', exact: true }).click();
  await expect(tutor).toBeVisible();
  await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
  await expect(page.getByLabel('Ask the Tutor')).toHaveValue('Keep my Harmony draft');
});


test('touch range selection spans pages of an unmarked section', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.route(url => /\/api\/v2\/song-studies(?:\/[^/]+\/ranges)?$/.test(url.pathname), async route => {
    const response = await route.fetch();
    const song = await response.json();
    // Keep the unmarked source consistent through import and passage-save responses.
    for (const measure of song.payload.tab_data.measures) measure.marker = null;
    await route.fulfill({ response, json: song });
  });
  await openSong(page);
  await page.getByLabel('Playback source').selectOption('practice');
  await page.getByRole('button', { name: 'Select range', exact: true }).click();
  await page.getByRole('button', { name: 'Select measure 2', exact: true }).click();
  await page.getByRole('button', { name: 'Next measures', exact: true }).click();
  await expect(page.getByTestId('song-study-overview-measure')).toHaveCount(4);
  await page.getByRole('button', { name: /Select measure 7/ }).click();
  await expect(page.getByTestId('practice-selected-span')).toHaveText('M2–7');
  await expect(page.getByRole('button', { name: 'Select measure 7', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Keep passage', exact: true }).click();
  await expect(page.getByText('Kept passages · 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Select measure 7/ }).click();
  await page.getByText('Kept passages · 1', { exact: true }).click();
  await page.getByTestId('song-kept-passage').click();
  await expect(page.getByRole('button', { name: 'Select measure 2, kept passage', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Select measure 1', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
