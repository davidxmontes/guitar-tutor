import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installYouTubeFake } from './youtube-fake';

async function playerView(page: Page) {
  const back = page.getByRole('button', { name: '← Back', exact: true });
  if (await back.isVisible()) await back.click();
  await expect(page.getByRole('button', { name: 'Move recording', exact: true })).toBeVisible();
}

async function recordingTask(page: Page, task: 'Sync with score' | 'Change recording') {
  await playerView(page);
  await page.getByLabel('Recording options', { exact: true }).click();
  await page.getByRole('button', { name: task, exact: true }).click();
  await expect(page.getByRole('button', { name: '← Back', exact: true })).toBeVisible();
}

async function openRecording(page: Page, initiallyCollapsed = true) {
  const launcher = page.getByRole('button', { name: 'Open recording', exact: true });
  const panel = page.getByRole('dialog', { name: 'Recording', exact: true });
  if (initiallyCollapsed) {
    await expect(launcher).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
    await launcher.click();
  } else if (!(await panel.isVisible())) {
    await launcher.click();
  }
  await expect(panel).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close recording', exact: true })).toBeVisible();
}

async function openSong(page: Page, attachManually = true, query = 'fixture') {
  await installYouTubeFake(page);
  if (attachManually) await page.route('**/video-suggestions', route => route.fulfill({ json: { candidates: [], score_duration_seconds: null, duration_note: 'Score duration unavailable.' } }));
  await page.goto('/v2', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: 'Expand navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill(query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
  await expect(page.getByLabel('Playback source')).toHaveValue('video');
  await openRecording(page);
  if (!attachManually) return;
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await page.getByLabel('YouTube link or video ID').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Attach recording', exact: true }).click();
  await expect(page.locator('iframe[title="YouTube video player"]')).toBeVisible();
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

test('floating recording moves and resizes without replacing the native player', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openSong(page);
  await playerView(page);
  const panel = page.getByRole('dialog', { name: 'Recording', exact: true });
  const move = page.getByRole('button', { name: 'Move recording', exact: true });
  const resize = page.getByRole('button', { name: 'Resize recording', exact: true });
  const before = await panel.boundingBox();
  const handle = await move.boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2 - 64, handle!.y + handle!.height / 2 - 48, { steps: 4 });
  await page.mouse.up();
  const moved = await panel.boundingBox();
  expect(moved!.x).toBeLessThan(before!.x - 40);
  expect(moved!.y).toBeLessThan(before!.y - 30);
  expect(moved!.width).toBeCloseTo(before!.width, 0);
  expect(moved!.height).toBeCloseTo(before!.height, 0);

  await page.evaluate(() => { window.youtubeFake.active.time = 12; window.youtubeFake.active.emitState(2); });
  await move.press('Home');
  for (let index = 0; index < 10; index += 1) await move.press('Shift+ArrowLeft');
  for (let index = 0; index < 4; index += 1) await move.press('Shift+ArrowUp');
  for (let index = 0; index < 9; index += 1) await resize.press('Shift+ArrowRight');
  for (let index = 0; index < 10; index += 1) await resize.press('ArrowUp');
  const wide = await panel.boundingBox();
  expect(wide!.width).toBeGreaterThan(750);
  expect(wide!.height).toBeCloseTo(350, 0);
  expect((await page.locator('iframe[title="YouTube video player"]').boundingBox())!.height).toBeGreaterThanOrEqual(200);
  await page.getByRole('button', { name: 'Play selection', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => ({ count: window.youtubeFake.players.length, time: window.youtubeFake.active.time, destroyed: window.youtubeFake.active.destroyed })))
    .toEqual({ count: 1, time: 12, destroyed: false });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: 'Close Tutor', exact: true }).click();
  await expect(panel).toBeVisible();
  await expect.poll(async () => {
    const box = (await panel.boundingBox())!;
    return box.x >= 12 && box.y >= 12 && box.x + box.width <= 308 && box.y + box.height <= 832;
  }).toBe(true);
  await expect(page.getByRole('button', { name: 'Close recording', exact: true })).toBeInViewport();
});

test('calibration saves, follows actual time without changing selection, and reopens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page);
  await alignFirstMeasure(page);
  await page.getByRole('button', { name: 'Save video setup', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Video setup saved to My Stuff.');
  await playerView(page);
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
  await openRecording(page);
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  await expect(page.locator('iframe[title="YouTube video player"]')).toBeVisible();
});

test('native scrubbing releases an armed selection loop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page); await alignFirstMeasure(page);
  await playerView(page);
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
  await playerView(page);
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
  await recordingTask(page, 'Change recording');
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await page.getByLabel('YouTube link or video ID').fill('dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Replace recording and reset alignment', exact: true }).click();
  await expect(page.getByLabel('I checked that this recording matches the score arrangement.')).not.toBeChecked();
  await expect(page.getByLabel('Correct an anchor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save video setup', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Confirm that this recording');
  await expect(page.getByRole('button', { name: 'Mark selection start', exact: true })).toBeEnabled();
  await recordingTask(page, 'Change recording');
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
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
  await playerView(page);
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeDisabled();
  await expect(page.getByText('Choose which occurrence to play.', { exact: true })).toBeVisible();
  await recordingTask(page, 'Sync with score');
  await page.getByLabel('Video occurrence').selectOption({ label: 'Second verse' });
  await playerView(page);
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
  await playerView(page);
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
  await openRecording(page, false);
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  await page.getByRole('navigation', { name: 'Song navigation' }).getByRole('button', { name: 'Explore', exact: true }).click();
  expect(await page.evaluate(() => window.youtubeFake.active.destroyed)).toBe(true);
});

test('unsupported links and player errors recover without losing calibrated work', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page); await alignFirstMeasure(page);
  await recordingTask(page, 'Change recording');
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await page.getByLabel('YouTube link or video ID').fill('https://youtube.com.evil.test/watch?v=M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Replace recording and reset alignment', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not supported');
  await recordingTask(page, 'Sync with score');
  await expect(page.getByLabel('Correct an anchor').locator('option')).toHaveCount(3);
  await playerView(page);
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
  await expect(page.locator('.song-video-calibration')).toHaveCSS('overflow-y', 'visible');
  await page.getByRole('button', { name: 'Save video setup', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Save video setup', exact: true })).toBeInViewport();
  await page.screenshot({ path: '/tmp/song-video-mobile-expanded.png', fullPage: false });
  await playerView(page);
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
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.locator('iframe[title="YouTube video player"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview recording 1: Study Fixture recording', exact: true }).click();
  await expect(page.getByLabel('I checked that this recording matches the score arrangement.')).not.toBeChecked();
  await page.getByLabel('I checked that this recording matches the score arrangement.').check();
  await alignFirstMeasure(page);
  await page.getByRole('button', { name: 'Save video setup', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Video setup saved');
  await recordingTask(page, 'Change recording');
  await expect(page.getByRole('button', { name: 'Preview recording 1: Study Fixture recording', exact: true })).toBeDisabled();
  await expect(page.getByText('Choosing another recording resets alignment. Undo restores it.', { exact: true })).toBeVisible();
  await recordingTask(page, 'Sync with score');
  await expect(page.getByLabel('Correct an anchor').locator('option')).toHaveCount(3);
  await recordingTask(page, 'Change recording');
  await page.getByRole('button', { name: 'Preview recording 2: Study Fixture backing', exact: true }).click();
  await expect(page.getByLabel('I checked that this recording matches the score arrangement.')).not.toBeChecked();
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Correct an anchor').locator('option')).toHaveCount(3);
  await expect(page.getByLabel('I checked that this recording matches the score arrangement.')).toBeChecked();
  await page.getByLabel('Playback source').selectOption('practice');
  await expect(page.locator('iframe[title="YouTube video player"]')).toHaveCount(0);
  await page.getByLabel('Playback source').selectOption('video');
  await openRecording(page, false);
  await playerView(page);
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  await page.reload();
  await openRecording(page);
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
});

test('no linked recording leaves a usable collapsed URL fallback', async ({ page }) => {
  await page.route('**/video-suggestions', route => route.fulfill({ json: { candidates: [], score_duration_seconds: null, duration_note: 'Score duration unavailable.' } }));
  await openSong(page, false);
  await expect(page.getByText('No linked recordings found.', { exact: false })).toBeVisible();
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await expect(page.getByLabel('YouTube link or video ID')).toBeVisible();
  await page.getByLabel('YouTube link or video ID').fill('M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Attach recording', exact: true }).click();
  await page.getByRole('button', { name: 'Discard and reload', exact: true }).click();
  await expect(page.locator('iframe[title="YouTube video player"]')).toHaveCount(0);
  await expect(page.getByText('Paste a YouTube link instead', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '← Back', exact: true })).toHaveCount(0);
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
  await openRecording(page, false);
  await expect(page.getByRole('button', { name: 'Preview recording 1: Late recording' })).toBeVisible();
  await expect(page.locator('iframe[title="YouTube video player"]')).toHaveCount(0);
  await page.getByText('Paste a YouTube link instead', { exact: true }).click();
  await page.getByRole('button', { name: 'Attach recording', exact: true }).click();
  await expect(page.locator('iframe[title="YouTube video player"]')).toHaveAttribute('src', /M7lc1UVf-VE/);
});


test('selection playback continues, jumps only while playing and pauses at an unknown selection', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page);
  await playerView(page);
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeDisabled();
  await expect(page.locator('#song-video-play-reason')).toContainText('mark selection start');
  await nativeTime(page, 10);
  await recordingTask(page, 'Sync with score');
  await page.getByRole('button', { name: 'Mark selection start', exact: true }).click();
  await playerView(page);
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Loop selection', { exact: true })).toBeDisabled();
  await nativeTime(page, 15);
  await recordingTask(page, 'Sync with score');
  await page.getByRole('button', { name: 'Mark selection end', exact: true }).click();
  await playerView(page);
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
    await recordingTask(page, 'Sync with score');
    await page.getByText('Adjust recording start', { exact: true }).click();
    await page.getByLabel('First aligned beat at (seconds)').fill('86401');
    await page.getByRole('button', { name: 'Apply start time', exact: true }).click();
    expect(await page.getByLabel('First aligned beat at (seconds)').evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);
    await page.getByLabel('First aligned beat at (seconds)').fill('10');
    await page.getByRole('button', { name: 'Apply start time', exact: true }).click();
    await playerView(page);
    await page.getByRole('button', { name: 'Play selection', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(14);
    await recordingTask(page, 'Sync with score');
    await expect(page.getByLabel('I checked that this recording matches the score arrangement.')).not.toBeChecked();
    await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
    await expect(page.getByLabel('First aligned beat at (seconds)')).toHaveValue('0');
    await page.getByText('Adjust recording start', { exact: true }).click();
    await page.getByLabel('First aligned beat at (seconds)').fill('10');
    await page.getByRole('button', { name: 'Apply start time', exact: true }).click();
    await page.getByRole('button', { name: 'Save video setup', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Video setup saved');
    await page.reload();
    await openRecording(page);
    await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Play selection', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(10);
    await recordingTask(page, 'Sync with score');
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
  await recordingTask(page, 'Sync with score');
  await page.getByText('Adjust recording start', { exact: true }).click();
  await expect(page.getByText('Initially estimated from score tempo at 0:00.', { exact: false })).toBeVisible();
});


test('video speed follows supported player rates without autoplay or changing score timing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page); await alignFirstMeasure(page);
  await playerView(page);
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
  await playerView(page);
  const neck = page.getByTestId('song-study-fretboard');
  await expect(page.getByTestId('song-video-position')).toContainText('Unaligned');
  await expect(neck).toHaveAttribute('aria-label', /Active: rest\./);
  await page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true }).click();
  await expect(neck).toHaveAttribute('aria-label', /Active: string 5 fret 3\./);
  await expect(page.getByTestId('fretboard-active-note')).toHaveCount(1);
  await page.getByRole('button', { name: 'Select beat 2 of measure 1', exact: true }).click();
  await expect(neck).toHaveAttribute('aria-label', /Active: rest\./);
  await page.getByRole('button', { name: 'Select measure 1', exact: true }).click();
  await recordingTask(page, 'Sync with score');
  await alignFirstMeasure(page);
  await playerView(page);
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
  // Starting native playback requires reaching the visible recording above the score.
  await page.locator('iframe[title="YouTube video player"]').scrollIntoViewIfNeeded();
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
  await playerView(page);
  const upcoming = page.getByTestId('fretboard-upcoming-note');
  await expect(upcoming).toHaveCount(0);
  await page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true }).click();
  await expect(upcoming).toHaveCount(1);
  await expect(upcoming).toHaveAttribute('data-string', '5');
  await expect(upcoming).toHaveAttribute('data-fret', '3');
  await expect(upcoming).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('[data-testid="fretboard-active-note"][data-string="6"][data-fret="0"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Select measure 1', exact: true }).click();
  await recordingTask(page, 'Sync with score');
  await alignFirstMeasure(page);
  await playerView(page);
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

for (const width of [1280, 320]) {
  test(`loop span controls select a beat, whole measure and multiple measures at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/video-suggestions', route => route.fulfill({ json: {
      candidates: [{ video_id: 'M7lc1UVf-VE', title: 'Loop recording', channel: null, kind: 'musicvideo', match_note: 'Linked', timing: {
        source: 'estimated', note: 'Estimated score timing.', passages: [{ id: 'score', label: 'Written score', anchors: [
          { measure_index: 0, beat_index: 0, edge: 'start', video_seconds: 0 },
          { measure_index: 7, beat_index: 1, edge: 'end', video_seconds: 32 },
        ] }],
      } }], score_duration_seconds: 32, duration_note: 'Written score estimate.',
    } }));
    await openSong(page, false);
    await page.getByRole('button', { name: 'Close recording', exact: true }).click();
    await page.getByRole('button', { name: 'Select beat 2 of measure 1', exact: true }).click();
    await openRecording(page, false);
    await expect(page.getByTestId('video-selected-span')).toHaveText('Selection: M1 · beat 2');
    await page.getByLabel('Loop selection', { exact: true }).check();
    await page.getByRole('button', { name: 'Play selection', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBeCloseTo(8 / 3, 5);
    for (let time = 3; time <= 4; time += 0.25) await nativeTime(page, time, 1);
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBeCloseTo(8 / 3, 5);
    await page.getByText('Selection options', { exact: true }).click();
    await page.getByRole('button', { name: 'Whole measure', exact: true }).click();
    await expect(page.getByTestId('video-selected-span')).toHaveText('Selection: M1 (whole measure)');
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(0);
    for (let time = 0.5; time <= 4; time += 0.5) await nativeTime(page, time, 1);
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(0);
    await page.getByLabel('From measure', { exact: true }).fill('2');
    await page.getByLabel('Through measure', { exact: true }).fill('3');
    expect(await page.evaluate(() => window.youtubeFake.active.time)).toBe(0);
    await expect(page.getByTestId('video-selected-span')).toHaveText('Selection: M1 (whole measure)');
    if (width === 320) await page.screenshot({ path: '/tmp/song-video-range-mobile.png', fullPage: false });
    await page.getByRole('button', { name: 'Apply range', exact: true }).click();
    await expect(page.getByTestId('video-selected-span')).toHaveText('Selection: M2–3');
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(4);
    for (let time = 4.5; time <= 12; time += 0.5) await nativeTime(page, time, 1);
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(4);
    await page.getByText('Selection options', { exact: true }).click();
    await page.getByLabel('From measure', { exact: true }).fill('4');
    await page.getByLabel('Through measure', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Apply range', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('end at or after the start');
    await expect(page.getByTestId('video-selected-span')).toHaveText('Selection: M2–3');
    expect(await page.evaluate(() => window.youtubeFake.active.time)).toBe(4);
    await page.getByLabel('From measure', { exact: true }).fill('0');
    expect(await page.getByLabel('From measure', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);
  });
}

for (const width of [1280, 320]) {
  test(`fretboard techniques follow selected and video beats at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/api/v2/song-studies', async route => {
      const response = await route.fetch();
      const song = await response.json();
      const beats = song.payload.tab_data.measures[0].voices[0].beats;
      beats[0].notes = [{ string: 4, fret: 3, slide: true, hp: true, bend: true }];
      beats[0].palmMute = true;
      beats[1].rest = false;
      beats[1].notes = [{ string: 2, fret: 7, vibrato: true, harmonic: true }, { string: 0, fret: 99, dead: true }];
      beats[1].letRing = true;
      await route.fulfill({ response, json: song });
    });
    await openSong(page);
    await playerView(page);
    if (width === 320) await page.getByRole('button', { name: 'Close recording', exact: true }).click();
    const active = page.getByTestId('fretboard-active-techniques');
    const upcoming = page.getByTestId('fretboard-upcoming-techniques');
    const neck = page.getByTestId('song-study-fretboard');
    await expect(active).toHaveCount(0);
    await page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true }).click();
    await expect(active).toContainText('String 5, fret 3: slide, bend, hammer-on / pull-off');
    await expect(active).toContainText('Palm mute');
    await expect(upcoming).toContainText('String 3, fret 7: vibrato, harmonic');
    await expect(upcoming).toContainText('String 1: muted note');
    await expect(upcoming).toContainText('Let ring');
    await expect(neck).toHaveAttribute('aria-label', /Active techniques: String 5, fret 3: slide, bend, hammer-on \/ pull-off/);
    await expect(page.locator('[data-fret="99"]')).toHaveCount(0);
    if (width === 320) {
      await page.getByRole('button', { name: 'Fretboard', exact: true }).click();
      await neck.scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/song-video-techniques-mobile.png' });
      const bounds = await active.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
      await page.getByRole('button', { name: 'Score', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Select measure 1', exact: true }).click();
    await openRecording(page, false);
    await recordingTask(page, 'Sync with score');
    await alignFirstMeasure(page);
    await playerView(page);
    await nativeTime(page, 14, 1);
    await expect(active).toContainText('vibrato, harmonic');
    await expect(active).not.toContainText('slide');
    await nativeTime(page, 14, 2);
    if (width === 320) await page.getByRole('button', { name: 'Close recording', exact: true }).click();
    await page.getByRole('button', { name: 'Select measure 2', exact: true }).click();
    await page.getByRole('button', { name: 'Select beat 2 of measure 2', exact: true }).click();
    await expect(active).toHaveCount(0);
    await expect(upcoming).toHaveCount(0);
    await nativeTime(page, 40, 2);
    await expect(active).toHaveCount(0);
    await expect(upcoming).toHaveCount(0);
  });
}


for (const width of [1280, 320]) {
  test(`cross-section M9–10 selection drives the aligned recording loop at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/video-suggestions', route => route.fulfill({ json: {
      candidates: [{ video_id: 'M7lc1UVf-VE', title: 'Boundary recording', channel: null, kind: 'musicvideo', match_note: 'Linked', timing: {
        source: 'estimated', note: 'Estimated score timing.', passages: [{ id: 'score', label: 'Written score', anchors: [
          { measure_index: 0, beat_index: 0, edge: 'start', video_seconds: 0 },
          { measure_index: 11, beat_index: 1, edge: 'end', video_seconds: 48 },
        ] }],
      } }], score_duration_seconds: 48, duration_note: 'Written score estimate.',
    } }));
    await openSong(page, false, 'boundary fixture');
    await page.getByRole('button', { name: 'Close recording', exact: true }).click();
    await page.getByRole('button', { name: 'Select range', exact: true }).click();
    if (width === 320) {
      await page.getByRole('button', { name: 'Next measures', exact: true }).click();
      await page.getByRole('button', { name: 'Next measures', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Select measure 9', exact: true }).click();
    await nativeTime(page, 35, 2);
    await page.getByRole('button', { name: 'Ending', exact: true }).click();
    expect(await page.evaluate(() => window.youtubeFake.active.time)).toBe(35);
    await expect(page.getByText('Choose the last measure', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Select measure 10', exact: true }).click();
    await expect(page.getByTestId('practice-selected-span')).toHaveText('M9–10');
    await page.getByRole('button', { name: 'Play-along', exact: true }).click();
    await openRecording(page, false);
    await expect(page.getByTestId('video-selected-span')).toHaveText('Selection: M9–10');
    await page.getByLabel('Loop selection', { exact: true }).check();
    await page.getByRole('button', { name: 'Play selection', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(32);
    for (let time = 32.5; time <= 39.5; time += 0.5) await nativeTime(page, time, 1);
    await expect(page.getByTestId('song-video-position')).toContainText('M10');
    await nativeTime(page, 40, 1);
    await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(32);
    await expect(page.getByTestId('video-selected-span')).toHaveText('Selection: M9–10');
    await page.getByRole('button', { name: 'Close recording', exact: true }).click();
    await page.getByRole('button', { name: 'Tab', exact: true }).click();
    await expect(page.getByTestId('practice-selected-span')).toHaveText('M9–10');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
