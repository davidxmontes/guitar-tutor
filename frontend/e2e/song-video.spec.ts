import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installYouTubeFake } from './youtube-fake';

async function openSong(page: Page, attachManually = true) {
  await installYouTubeFake(page);
  if (attachManually) await page.route('**/video-suggestions', route => route.fulfill({ json: { candidates: [], score_duration_seconds: null, duration_note: 'Score duration unavailable.' } }));
  await page.goto('/v2', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: 'Expand navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
  await expect(page.getByLabel('Playback source')).toHaveValue('video');
  if (!attachManually) return;
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await page.getByLabel('YouTube link or video ID').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Attach recording', exact: true }).click();
  await expect(page.locator('iframe[title="YouTube video player"]')).toBeVisible();
  await page.getByText('Calibrate recording', { exact: false }).click();
  await page.getByLabel('I checked that this recording matches the score arrangement.').check();
}
async function nativeTime(page: Page, seconds: number, state = 2) {
  await page.evaluate(({ seconds, state }) => { window.youtubeFake.active.time = seconds; window.youtubeFake.active.emitState(state); }, { seconds, state });
}
async function alignFirstMeasure(page: Page) {
  await nativeTime(page, 10);
  await page.getByRole('button', { name: 'Mark selection start', exact: true }).click();
  await nativeTime(page, 15);
  await page.getByRole('button', { name: 'Mark selection end', exact: true }).click();
}

test('calibration saves, follows actual time without changing selection, and reopens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page);
  await alignFirstMeasure(page);
  await page.getByRole('button', { name: 'Save video setup', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Video setup saved to My Stuff.');
  await page.getByText('Calibrate recording', { exact: true }).click();
  await page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true }).click();
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(10);
  await nativeTime(page, 14, 3);
  await expect(page.getByTestId('song-video-position')).toContainText('beat 2');
  await expect(page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-video-playhead="true"] button')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('song-study-fretboard')).toHaveAttribute('aria-label', /Active: rest/);
  await page.getByRole('button', { name: 'Select measure 2', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(15);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  await expect(page.locator('iframe[title="YouTube video player"]')).toBeVisible();
});

test('native scrubbing releases an armed selection loop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page); await alignFirstMeasure(page);
  await page.getByText('Calibrate recording', { exact: false }).click();
  await page.getByLabel('Loop selection', { exact: true }).check();
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  await nativeTime(page, 40, 1);
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(40);
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.state)).toBe(1);
  await expect(page.getByTestId('song-video-position')).toContainText('Unaligned');
});

test('paused video does not trap score navigation during calibration', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page); await alignFirstMeasure(page);
  await nativeTime(page, 11);
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Measures 5–8', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(11);
});

test('corrections, local undo, replacement confirmation and conflict reload preserve the draft', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page); await alignFirstMeasure(page);
  await page.getByRole('button', { name: 'Save video setup', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Video setup saved');
  await page.getByLabel('Correct an anchor', { exact: true }).selectOption('1');
  await nativeTime(page, 16);
  await page.getByRole('button', { name: 'Use current video time', exact: true }).click();
  await expect(page.getByLabel('Correct an anchor').locator('option').last()).toContainText('0:16.0');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Correct an anchor').locator('option').last()).toContainText('0:15.0');
  await page.getByLabel('Correct an anchor').selectOption('1');
  await page.getByRole('button', { name: 'Remove anchor', exact: true }).click();
  await expect(page.getByLabel('Correct an anchor').locator('option')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await page.getByLabel('Occurrence name').fill('My local draft');
  const artifacts = await (await page.request.get('/api/v2/library')).json();
  const latest = artifacts.filter((a: { kind: string }) => a.kind === 'song_study')[0];
  const remote = await (await page.request.get(`/api/v2/song-studies/${latest.id}`)).json();
  const changed = await page.request.put(`/api/v2/song-studies/${latest.id}/video-alignment`, { data: {
    expected_updated_at: remote.updated_at,
    video_alignment: { ...remote.payload.video_alignment, passages: remote.payload.video_alignment.passages.map((p: object) => ({ ...p, label: 'Changed elsewhere' })) },
  } });
  expect(changed.ok()).toBe(true);
  await page.getByRole('button', { name: 'Save video setup', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your draft is kept');
  await expect(page.getByLabel('Occurrence name')).toHaveValue('My local draft');
  await page.getByRole('button', { name: 'Discard and reload', exact: true }).click();
  await expect(page.getByLabel('Occurrence name')).toHaveValue('Changed elsewhere');
  await page.getByText('Change or remove recording', { exact: true }).click();
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await page.getByLabel('YouTube link or video ID').fill('dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Replace recording and reset alignment', exact: true }).click();
  await expect(page.getByLabel('I checked that this recording matches the score arrangement.')).not.toBeChecked();
  await expect(page.getByLabel('Correct an anchor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save video setup', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Confirm that this recording');
  await expect(page.getByRole('button', { name: 'Mark selection start', exact: true })).toBeEnabled();
  await page.getByLabel('YouTube link or video ID').fill('dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Replace recording and reset alignment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark selection start', exact: true })).toBeEnabled();
});

test('repeated score occurrences require a choice and bounded loops honor native controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page); await alignFirstMeasure(page);
  await page.getByLabel('Occurrence name').fill('First verse');
  await page.getByRole('button', { name: 'Add occurrence', exact: true }).click();
  await page.getByLabel('Occurrence name').fill('Second verse');
  await nativeTime(page, 30);
  await page.getByRole('button', { name: 'Mark selection start', exact: true }).click();
  await nativeTime(page, 35);
  await page.getByRole('button', { name: 'Mark selection end', exact: true }).click();
  await page.getByLabel('Video occurrence').selectOption('');
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeDisabled();
  await expect(page.getByText('Choose which occurrence to play.', { exact: true })).toBeVisible();
  await page.getByLabel('Video occurrence').selectOption({ label: 'Second verse' });
  await page.getByText('Calibrate recording', { exact: false }).click();
  await page.getByLabel('Loop selection', { exact: true }).check();
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  expect(await page.evaluate(() => window.youtubeFake.active.time)).toBe(30);
  // Advance reported time in ordinary playback increments, not a native seek.
  for (let time = 30.5; time <= 35; time += 0.5) await nativeTime(page, time, 1);
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(30);
  await page.getByLabel('Loop selection', { exact: true }).uncheck();
  for (let time = 30.5; time <= 35; time += 0.5) await nativeTime(page, time, 1);
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.state)).toBe(1);
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  await page.locator('iframe[title="YouTube video player"]').focus();
  for (let time = 30.5; time <= 35.5; time += 0.5) await nativeTime(page, time, 1);
  expect(await page.evaluate(() => window.youtubeFake.active.time)).toBe(35.5);
  expect(await page.evaluate(() => window.youtubeFake.active.state)).toBe(1);
  await nativeTime(page, 40, 1);
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(40);
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.state)).toBe(1);
});

test('source switching and navigation stop video before synthesized practice starts', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page); await alignFirstMeasure(page);
  await page.getByText('Calibrate recording', { exact: false }).click();
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  await page.getByLabel('Playback source').selectOption('practice');
  await expect(page.locator('iframe[title="YouTube video player"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.youtubeFake.active.destroyed)).toBe(true);
  await page.getByRole('button', { name: 'Practice selection', exact: true }).click();
  await page.getByLabel('Count in').selectOption('0');
  await page.getByLabel('Practice audio').selectOption('guide');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByTestId('practice-status')).toHaveText('Playing');
  await page.getByLabel('Playback source').selectOption('video');
  await expect(page.getByTestId('practice-status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  await page.getByRole('navigation', { name: 'Song navigation' }).getByRole('button', { name: 'Explore', exact: true }).click();
  expect(await page.evaluate(() => window.youtubeFake.active.destroyed)).toBe(true);
});

test('unsupported links and player errors recover without losing calibrated work', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page); await alignFirstMeasure(page);
  await page.getByText('Change or remove recording', { exact: true }).click();
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await page.getByLabel('YouTube link or video ID').fill('https://youtube.com.evil.test/watch?v=M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Replace recording and reset alignment', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not supported');
  await expect(page.getByLabel('Correct an anchor').locator('option')).toHaveCount(3);
  await page.evaluate(() => window.youtubeFake.active.fail(101));
  await expect(page.getByText('The owner of this video does not allow embedding.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry video', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  await page.evaluate(() => window.youtubeFake.active.block());
  await expect(page.getByText('Press Play in the video to start playback.', { exact: true })).toBeVisible();
});

test('mobile dark calibration keeps a visible native player and usable score', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openSong(page); await alignFirstMeasure(page);
  expect((await page.locator('.song-video').boundingBox())!.height).toBeLessThan(630);
  await page.screenshot({ path: '/tmp/song-video-mobile-expanded.png', fullPage: false });
  await page.getByText('Calibrate recording', { exact: false }).click();
  if (await page.getByRole('button', { name: 'Expand navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await page.getByRole('button', { name: /Switch to dark/ }).click();
  await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Play selection', exact: true }).focus();
  await page.keyboard.press('Enter');
  const frame = page.locator('iframe[title="YouTube video player"]');
  const bounds = await frame.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(200);
  expect(bounds?.height).toBeGreaterThanOrEqual(200);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await nativeTime(page, 14, 3);
  await expect(page.getByTestId('song-video-position')).toContainText('beat 2');
  expect(await frame.boundingBox()).toEqual(bounds);
  await page.screenshot({ path: '/tmp/song-video-mobile-dark.png', fullPage: false });
});


test('recording discovery retries, previews without URL and preserves saved alignment', async ({ page }) => {
  let unavailable = true;
  await page.route('**/video-suggestions', route => {
    return unavailable ? route.fulfill({ status: 503, json: { detail: 'Unavailable' } }) : route.fulfill({ json: {
      candidates: [
        { video_id: 'M7lc1UVf-VE', title: 'Study Fixture recording', channel: 'Practice Band', kind: 'musicvideo', match_note: 'Linked recording' },
        { video_id: 'dQw4w9WgXcQ', title: 'Study Fixture backing', channel: null, kind: 'backing', match_note: 'Backing track' },
      ], score_duration_seconds: 100, duration_note: 'Score estimate excludes repeats.',
    } });
  });
  await openSong(page, false);
  await expect(page.getByRole('alert')).toContainText('Unavailable');
  unavailable = false;
  await page.getByRole('button', { name: 'Retry recordings' }).click();
  await expect(page.getByLabel('YouTube link or video ID')).not.toBeVisible();
  await expect(page.locator('iframe[title="YouTube video player"]')).toBeVisible();
  expect(await page.evaluate(() => window.youtubeFake.active.state)).not.toBe(1);
  await expect(page.getByTestId('video-duration-comparison')).toContainText('20.0 seconds longer');
  await page.getByText('Calibrate recording', { exact: false }).click();
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.locator('iframe[title="YouTube video player"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview recording 1: Study Fixture recording', exact: true }).click();
  await page.getByText('Calibrate recording', { exact: false }).click();
  await expect(page.getByLabel('I checked that this recording matches the score arrangement.')).not.toBeChecked();
  await page.getByLabel('I checked that this recording matches the score arrangement.').check();
  await alignFirstMeasure(page);
  await page.getByRole('button', { name: 'Save video setup', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Video setup saved');
  await page.getByText('Change or remove recording', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview recording 1: Study Fixture recording', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Correct an anchor').locator('option')).toHaveCount(3);
  await expect(page.getByText('Choosing another recording resets alignment. Undo restores it.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preview recording 2: Study Fixture backing', exact: true }).click();
  await expect(page.getByLabel('I checked that this recording matches the score arrangement.')).not.toBeChecked();
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Correct an anchor').locator('option')).toHaveCount(3);
  await expect(page.getByLabel('I checked that this recording matches the score arrangement.')).toBeChecked();
  await page.getByLabel('Playback source').selectOption('practice');
  await expect(page.locator('iframe[title="YouTube video player"]')).toHaveCount(0);
  await page.getByLabel('Playback source').selectOption('video');
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
});

test('no linked recording leaves a usable collapsed URL fallback', async ({ page }) => {
  await page.route('**/video-suggestions', route => route.fulfill({ json: { candidates: [], score_duration_seconds: null, duration_note: 'Score duration unavailable.' } }));
  await openSong(page, false);
  await expect(page.getByText('No linked recordings found.', { exact: false })).toBeVisible();
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await expect(page.getByLabel('YouTube link or video ID')).toBeVisible();
});


test('pending discovery respects a typed URL and explicit playback source choice', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/video-suggestions', async route => {
    await pending;
    await route.fulfill({ json: { candidates: [{ video_id: 'dQw4w9WgXcQ', title: 'Late recording', channel: null, kind: 'other', match_note: 'Linked' }], score_duration_seconds: null, duration_note: 'Unknown score duration.' } });
  });
  await openSong(page, false);
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await page.getByLabel('YouTube link or video ID').fill('M7lc1UVf-VE');
  await page.getByLabel('Playback source').selectOption('practice');
  release();
  await page.getByLabel('Playback source').selectOption('video');
  await expect(page.getByRole('button', { name: 'Preview recording 1: Late recording' })).toBeVisible();
  await expect(page.locator('iframe[title="YouTube video player"]')).toHaveCount(0);
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await page.getByRole('button', { name: 'Attach recording', exact: true }).click();
  await expect(page.locator('iframe[title="YouTube video player"]')).toHaveAttribute('src', /M7lc1UVf-VE/);
});


test('selection playback continues, jumps only while playing and pauses at an unknown selection', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page);
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeDisabled();
  await expect(page.locator('#song-video-play-reason')).toContainText('mark selection start');
  await nativeTime(page, 10);
  await page.getByRole('button', { name: 'Mark selection start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Loop selection', { exact: true })).toBeDisabled();
  await nativeTime(page, 15);
  await page.getByRole('button', { name: 'Mark selection end', exact: true }).click();
  await page.getByText('Calibrate recording', { exact: false }).click();
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  for (let time = 10.5; time <= 16; time += 0.5) await nativeTime(page, time, 1);
  expect(await page.evaluate(() => window.youtubeFake.active.state)).toBe(1);
  expect(await page.evaluate(() => window.youtubeFake.active.time)).toBe(16);
  await page.getByRole('button', { name: 'Select beat 2 of measure 1', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBeCloseTo(13.333, 2);
  await nativeTime(page, 14, 1);
  await page.getByRole('button', { name: 'Select beat 2 of measure 1', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBeCloseTo(13.333, 2);
  await nativeTime(page, 14, 2);
  await page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true }).click();
  expect(await page.evaluate(() => window.youtubeFake.active.time)).toBe(14);
  expect(await page.evaluate(() => window.youtubeFake.active.state)).toBe(2);
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  await page.getByRole('button', { name: 'Select measure 3', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.state)).toBe(2);
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Align selected start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark selection start', exact: true })).toBeVisible();
});


for (const source of ['estimated', 'songsterr'] as const) {
  test(`${source} timing plays immediately and a start adjustment saves without false confirmation`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.route('**/video-suggestions', route => route.fulfill({ json: {
      candidates: [{ video_id: 'M7lc1UVf-VE', title: 'Timed recording', channel: 'Practice Band', kind: 'musicvideo', match_note: 'Linked recording', timing: {
        source, note: source === 'estimated' ? 'Estimated from score tempo; adjust the recording start.' : 'Timing supplied by Songsterr; check the arrangement.',
        passages: [{ id: 'timed', label: 'Written score', anchors: [
          { measure_index: 0, beat_index: 0, edge: 'start', video_seconds: 0 },
          { measure_index: 1, beat_index: 0, edge: 'start', video_seconds: 4 },
          { measure_index: 1, beat_index: 1, edge: 'end', video_seconds: 8 },
        ] }],
      } }], score_duration_seconds: 16, duration_note: 'Written score estimate.',
    } }));
    await openSong(page, false);
    await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Play selection', exact: true }).click();
    expect(await page.evaluate(() => window.youtubeFake.active.time)).toBe(0);
    await page.getByRole('button', { name: 'Select measure 2', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(4);
    await nativeTime(page, 5, 1);
    await expect(page.getByTestId('song-video-position')).toContainText('M2');
    await page.getByText('Adjust recording start', { exact: true }).click();
    await page.getByLabel('First aligned beat at (seconds)').fill('86400');
    await page.getByRole('button', { name: 'Apply start time', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('valid video time');
    await page.getByLabel('First aligned beat at (seconds)').fill('10');
    await page.getByRole('button', { name: 'Apply start time', exact: true }).click();
    await page.getByRole('button', { name: 'Play selection', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(14);
    await page.getByText('Calibrate recording', { exact: false }).click();
    await expect(page.getByLabel('I checked that this recording matches the score arrangement.')).not.toBeChecked();
    await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
    await expect(page.getByLabel('First aligned beat at (seconds)')).toHaveValue('0');
    await page.getByLabel('First aligned beat at (seconds)').fill('10');
    await page.getByRole('button', { name: 'Apply start time', exact: true }).click();
    await page.getByRole('button', { name: 'Save video setup', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Video setup saved');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Play selection', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(10);
    await page.getByText('Calibrate recording', { exact: false }).click();
    await expect(page.getByLabel('I checked that this recording matches the score arrangement.')).not.toBeChecked();
  });
}


test('a pasted video can use the available score-tempo estimate when discovery has no matches', async ({ page }) => {
  await page.route('**/video-suggestions', route => route.fulfill({ json: {
    candidates: [], score_duration_seconds: 4, duration_note: 'Written score estimate.',
    estimated_timing: { source: 'estimated', note: 'Initially estimated from score tempo at 0:00.', passages: [{ id: 'estimate', label: 'Written score', anchors: [
      { measure_index: 0, beat_index: 0, edge: 'start', video_seconds: 0 },
      { measure_index: 0, beat_index: 1, edge: 'end', video_seconds: 4 },
    ] }] },
  } }));
  await openSong(page, false);
  await expect(page.getByText('No linked recordings found.', { exact: false })).toBeVisible();
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await page.getByLabel('YouTube link or video ID').fill('M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Attach recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  await expect(page.getByText('Estimated from score tempo', { exact: true })).toBeVisible();
  await page.getByText('Adjust recording start', { exact: true }).click();
  await expect(page.getByText('Initially estimated from score tempo at 0:00.', { exact: false })).toBeVisible();
});


test('video speed follows supported player rates without autoplay or changing score timing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page); await alignFirstMeasure(page);
  await page.getByText('Calibrate recording', { exact: false }).click();
  const speed = page.getByLabel('Video speed', { exact: true });
  await expect(speed.locator('option')).toHaveText(['0.25×', '0.5×', '0.75×', '1×', '1.5×', '2×']);
  await speed.selectOption('0.5');
  await expect(speed).toHaveValue('0.5');
  expect(await page.evaluate(() => window.youtubeFake.active.state)).toBe(2);
  await page.evaluate(() => window.youtubeFake.active.emitRate(0.75));
  await expect(speed).toHaveValue('0.75');
  await page.evaluate(() => { window.youtubeFake.active.rejectRates = true; });
  await speed.selectOption('0.5');
  await expect(speed).toHaveValue('0.75');
  expect(await page.evaluate(() => window.youtubeFake.active.state)).toBe(2);
  await page.getByLabel('Loop selection', { exact: true }).check();
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  for (let time = 10.5; time <= 14; time += 0.5) await nativeTime(page, time, 1);
  await expect(page.getByTestId('song-video-position')).toContainText('beat 2');
  await nativeTime(page, 14.5, 1); await nativeTime(page, 15, 1);
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(10);
  await expect(speed).toHaveValue('0.75');
  await page.evaluate(() => { window.youtubeFake.active.rates.push(0.6); window.youtubeFake.active.emitRate(0.6); });
  await expect(speed).toHaveValue('0.6');
  await page.evaluate(() => window.youtubeFake.active.fail(101));
  await expect(speed).toHaveValue('1');
  await expect(speed).toBeDisabled();
});

test('paused lead-note selection drives the fretboard while video following still shows rests', async ({ page }) => {
  await page.route('**/api/v2/song-studies', async route => {
    const response = await route.fetch();
    const song = await response.json();
    // Same zero-based single-note shape as the public Wonderwall lead entrance.
    song.payload.tab_data.measures[0].voices[0].beats[0].notes = [{ string: 4, fret: 3 }];
    await route.fulfill({ response, json: song });
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page);
  const neck = page.getByTestId('song-study-fretboard');
  await expect(page.getByTestId('song-video-position')).toContainText('Unaligned');
  await expect(neck).toHaveAttribute('aria-label', /Active: rest\./);
  await page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true }).click();
  await expect(neck).toHaveAttribute('aria-label', /Active: string 5 fret 3\./);
  await expect(page.getByTestId('fretboard-active-note')).toHaveCount(1);
  await page.getByRole('button', { name: 'Select beat 2 of measure 1', exact: true }).click();
  await expect(neck).toHaveAttribute('aria-label', /Active: rest\./);
  await page.getByRole('button', { name: 'Select measure 1', exact: true }).click();
  await alignFirstMeasure(page);
  await nativeTime(page, 14, 1);
  await expect(neck).toHaveAttribute('aria-label', /Active: rest\./);
  await nativeTime(page, 14, 2);
  await page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true }).click();
  await expect(neck).toHaveAttribute('aria-label', /Active: string 5 fret 3\./);
  expect(await page.evaluate(() => window.youtubeFake.active.time)).toBe(14);
  expect(await page.evaluate(() => window.youtubeFake.active.state)).toBe(2);
  await nativeTime(page, 14.25, 2);
  await expect(neck).toHaveAttribute('aria-label', /Active: rest\./);
  await page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true }).click();
  await expect(neck).toHaveAttribute('aria-label', /Active: string 5 fret 3\./);
  await nativeTime(page, 14.25, 1);
  await expect(neck).toHaveAttribute('aria-label', /Active: rest\./);
  await page.getByRole('button', { name: 'Select measure 3', exact: true }).click();
  await expect(neck).toHaveAttribute('aria-label', /Active: string 6 fret 2/);
  expect(await page.evaluate(() => window.youtubeFake.active.state)).toBe(2);
  await nativeTime(page, 40, 2);
  await expect(page.getByTestId('song-video-position')).toContainText('Unaligned');
  await expect(neck).toHaveAttribute('aria-label', /Active: rest\./);
});

test('video and paused selection preview the next written beat without skipping rests', async ({ page }) => {
  await page.route('**/api/v2/song-studies', async route => {
    const response = await route.fetch();
    const song = await response.json();
    const next = song.payload.tab_data.measures[0].voices[0].beats[1];
    next.rest = false;
    next.notes = [{ string: 5, fret: 0 }, { string: 4, fret: 3 }];
    await route.fulfill({ response, json: song });
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page);
  const upcoming = page.getByTestId('fretboard-upcoming-note');
  await expect(upcoming).toHaveCount(0);
  await page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true }).click();
  await expect(upcoming).toHaveCount(1);
  await expect(upcoming).toHaveAttribute('data-string', '5');
  await expect(upcoming).toHaveAttribute('data-fret', '3');
  await expect(upcoming).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('[data-testid="fretboard-active-note"][data-string="6"][data-fret="0"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Select measure 1', exact: true }).click();
  await alignFirstMeasure(page);
  await nativeTime(page, 11, 1);
  await expect(upcoming).toHaveAttribute('data-fret', '3');
  await nativeTime(page, 14, 1);
  await expect(page.getByTestId('song-study-fretboard')).toHaveAttribute('aria-label', /Upcoming: string 6 fret 1, string 5 fret 3\./);
  await nativeTime(page, 14, 2);
  await page.getByRole('button', { name: 'Select measure 2', exact: true }).click();
  await expect(upcoming).toHaveCount(0);
  await page.getByRole('button', { name: 'Verse', exact: true }).click();
  await page.getByRole('button', { name: 'Select measure 8', exact: true }).click();
  await page.getByRole('button', { name: 'Select beat 2 of measure 8', exact: true }).click();
  await expect(upcoming).toHaveCount(0);
  await nativeTime(page, 40, 2);
  await expect(upcoming).toHaveCount(0);
});
