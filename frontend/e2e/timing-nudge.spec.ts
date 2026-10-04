import { expect, test, type Page } from '@playwright/test';
import { installYouTubeFake } from './youtube-fake';

async function openAlignedSong(page: Page, offset = 0, rawStart = 0) {
  await installYouTubeFake(page);
  await page.route('**/video-suggestions', route => route.fulfill({ json: { candidates: [], score_duration_seconds: null } }));
  await page.goto('/v2');
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: 'Expand navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
  await expect(page.getByTestId('song-study-title')).toContainText('Study Fixture');
  const id = new URL(page.url()).searchParams.get('song')!;
  const song = await (await page.request.get(`/api/v2/song-studies/${id}`)).json();
  const saved = await page.request.put(`/api/v2/song-studies/${id}/video-alignment`, { data: {
    expected_updated_at: song.updated_at,
    video_alignment: { video_id: 'M7lc1UVf-VE', recording_confirmed: true, offset_seconds: offset, passages: [{ id: 'verse', label: 'Verse', anchors: [
      { measure_index: 0, beat_index: 0, edge: 'start', video_seconds: rawStart },
      { measure_index: 0, beat_index: 1, edge: 'end', video_seconds: rawStart + 3 },
    ] }] },
  } });
  expect(saved.ok(), await saved.text()).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Open recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  return id;
}

const earlier = (page: Page) => page.getByRole('button', { name: 'Move notes earlier by 0.1 seconds', exact: true });
const later = (page: Page) => page.getByRole('button', { name: 'Move notes later by 0.1 seconds', exact: true });
const adjustment = (page: Page) => page.getByTestId('video-timing-adjustment');
const readAlignment = async (page: Page, id: string) => (await (await page.request.get(`/api/v2/song-studies/${id}`)).json()).payload.video_alignment;
const nativeTime = async (page: Page, time: number, state = 2) => page.evaluate(({ time, state }) => { window.youtubeFake.active.time = time; window.youtubeFake.active.emitState(state); }, { time, state });
const playerState = (page: Page) => page.evaluate(() => ({ time: window.youtubeFake.active.time, state: window.youtubeFake.active.state, players: window.youtubeFake.players.length }));
async function syncView(page: Page) {
  await page.getByLabel('Recording options', { exact: true }).click();
  await page.getByRole('button', { name: 'Sync with score', exact: true }).click();
}

test('live nudges align every score view without changing the recording and save/reset survive reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const id = await openAlignedSong(page);
  const original = await readAlignment(page, id);
  await page.getByRole('button', { name: 'Play-along', exact: true }).click();
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await nativeTime(page, 1.95, 1);
  await earlier(page).focus();
  await page.keyboard.press('Enter');
  await expect(adjustment(page)).toHaveText('−0.1s · Earlier');
  expect(await playerState(page)).toEqual({ time: 1.95, state: 1, players: 1 });
  await expect(page.getByTestId('song-study-fretboard')).toHaveAttribute('aria-label', /Active: rest/);
  expect(Number(await page.getByTestId('play-along').getAttribute('data-offset'))).toBeCloseTo(1.025);
  await page.getByRole('button', { name: 'Tab', exact: true }).click();
  await expect(page.locator('[data-video-playhead="true"] button')).toHaveAttribute('aria-label', 'Select beat 2 of measure 1');
  await page.getByRole('button', { name: 'Reset adjustment', exact: true }).click();
  await expect(adjustment(page)).toHaveText('Original timing');
  expect(await playerState(page)).toEqual({ time: 1.95, state: 1, players: 1 });
  await expect(page.getByTestId('song-study-fretboard')).not.toHaveAttribute('aria-label', /Active: rest/);
  await earlier(page).click();
  await page.getByRole('button', { name: 'Save timing', exact: true }).click();
  await expect(page.getByText('Video setup saved to My Stuff.', { exact: true })).toBeVisible();
  expect((await readAlignment(page, id)).offset_seconds).toBe(-0.1);
  expect((await readAlignment(page, id)).passages).toEqual(original.passages);
  expect(await playerState(page)).toEqual({ time: 1.95, state: 1, players: 1 });
  await page.screenshot({ path: '/tmp/timing-nudge-desktop.png' });
  await page.clock.resume();
  await page.reload();
  await page.getByRole('button', { name: 'Open recording', exact: true }).click();
  await expect(adjustment(page)).toHaveText('−0.1s · Earlier');
  await page.getByRole('button', { name: 'Reset adjustment', exact: true }).click();
  await page.getByRole('button', { name: 'Save timing', exact: true }).click();
  await expect.poll(async () => (await readAlignment(page, id)).offset_seconds).toBeUndefined();
});

test('an armed loop uses nudged boundaries including a zero-clipped earlier start', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openAlignedSong(page);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.getByLabel('Loop selection', { exact: true }).check();
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  for (const time of [0.5, 1, 1.5, 2, 2.85]) await nativeTime(page, time, 1);
  await earlier(page).click();
  expect(await playerState(page)).toEqual({ time: 2.85, state: 1, players: 1 });
  await nativeTime(page, 2.95, 1);
  expect(await playerState(page)).toEqual({ time: 0, state: 1, players: 1 });
  await later(page).click();
  await later(page).click();
  for (const time of [0.5, 1, 1.5, 2, 2.5, 3.05]) await nativeTime(page, time, 1);
  expect((await playerState(page)).time).toBe(3.05);
  await nativeTime(page, 3.15, 1);
  expect((await playerState(page)).time).toBe(0.1);
});

test('advanced timing preserves offset precision, marks physical times, rebases anchors and undoes while paused', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const id = await openAlignedSong(page, 2, 0.034);
  await syncView(page);
  await page.getByText('Adjust recording start', { exact: true }).click();
  await page.getByLabel('First aligned beat at (seconds)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Apply start time', exact: true }).click();
  await expect(page.getByLabel('Correct an anchor', { exact: true }).locator('option').nth(1)).toContainText('0:00.0');
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await expect(adjustment(page)).toHaveText('−0.034s · Earlier');
  await later(page).click();
  await expect(adjustment(page)).toHaveText('+0.066s · Later');
  await page.getByRole('button', { name: 'Save timing', exact: true }).click();
  await expect.poll(async () => (await readAlignment(page, id)).offset_seconds).toBe(0.066);
  expect((await readAlignment(page, id)).passages[0].anchors.map((a: { video_seconds: number }) => a.video_seconds)).toEqual([0.034, 3.034]);
  await syncView(page);
  await page.getByText('Adjust recording start', { exact: true }).click();
  await page.getByLabel('First aligned beat at (seconds)', { exact: true }).fill('2.034');
  await page.getByRole('button', { name: 'Apply start time', exact: true }).click();
  await nativeTime(page, 1);
  await page.getByRole('button', { name: 'Mark selection start', exact: true }).click();
  await page.getByRole('button', { name: 'Save video setup', exact: true }).click();
  await expect.poll(async () => (await readAlignment(page, id)).offset_seconds).toBe(1);
  const rebased = await readAlignment(page, id);
  expect(rebased.passages[0].anchors[0].video_seconds).toBe(0);
  expect(rebased.passages[0].anchors[1].video_seconds + rebased.offset_seconds).toBeCloseTo(5.034);
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await page.getByRole('button', { name: 'Play-along', exact: true }).click();
  await nativeTime(page, 2);
  const readOffset = async () => Number(await page.getByTestId('play-along').getAttribute('data-offset'));
  // Native samples reach the renderer through React; assert the musical position,
  // not whichever prior frame happened to be visible when the event returned.
  await expect.poll(readOffset).toBeCloseTo(1.5 / 4.034, 6);
  await later(page).click();
  await expect.poll(readOffset).toBeCloseTo(1.35 / 4.034, 6);
  await syncView(page);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect.poll(readOffset).toBeCloseTo(1.5 / 4.034, 6);
  await page.getByRole('button', { name: 'Select measure 2', exact: true }).click();
  await page.getByLabel('Occurrence name', { exact: true }).fill('Renamed while inspecting measure 2');
  await expect(page.getByTestId('play-along')).toContainText('Measure 2');
});

test('saving blocks timing edits, failed saves retain the draft, and nudge controls fit at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const id = await openAlignedSong(page);
  await earlier(page).click();
  const panel = page.getByRole('dialog', { name: 'Recording', exact: true });
  await expect(earlier(page)).toBeInViewport();
  await expect(later(page)).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Reset adjustment', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Save timing', exact: true })).toBeInViewport();
  expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(296);
  expect((await page.locator('iframe[title="YouTube video player"]').boundingBox())!.height).toBeGreaterThanOrEqual(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: '/tmp/timing-nudge-mobile.png' });
  let release: () => void = () => {};
  const saving = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/v2/song-studies/${id}/video-alignment`, async route => {
    await saving;
    await route.fulfill({ status: 409, json: { detail: 'Changed elsewhere' } });
  });
  await page.getByRole('button', { name: 'Save timing', exact: true }).click();
  await expect(earlier(page)).toBeDisabled();
  await expect(later(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reset adjustment', exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole('alert')).toContainText('Your draft is kept');
  await expect(adjustment(page)).toHaveText('−0.1s · Earlier');
  await expect(earlier(page)).toBeEnabled();
  await page.unroute(`**/api/v2/song-studies/${id}/video-alignment`);
  await page.getByRole('button', { name: 'Save timing', exact: true }).click();
  await expect.poll(async () => (await readAlignment(page, id)).offset_seconds).toBe(-0.1);
});
