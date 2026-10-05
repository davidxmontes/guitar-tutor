import { expect, test, type Page } from '@playwright/test';
import { installYouTubeFake } from './youtube-fake';

async function openSong(page: Page) {
  await installYouTubeFake(page);
  await page.route('**/video-suggestions', route => route.fulfill({ json: { candidates: [], score_duration_seconds: null, duration_note: 'Score duration unavailable.' } }));
  await page.goto('/v2');
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: 'Expand navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
  await expect(page.getByTestId('song-study-title')).toContainText('Study Fixture');
}

const position = async (page: Page) => Number(await page.getByTestId('play-along').getAttribute('data-offset'));
async function nativeTime(page: Page, seconds: number, state = 2) {
  await page.evaluate(({ seconds, state }) => { window.youtubeFake.active.time = seconds; window.youtubeFake.active.emitState(state); }, { seconds, state });
}

test('Play-along shares count-in, fractional rests, pause, tempo, looping and tab navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page);
  await page.getByLabel('Playback source').selectOption('practice');
  await page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true }).click();
  await page.getByRole('button', { name: 'Play-along', exact: true }).click();
  const lanes = page.getByTestId('play-along');
  await expect(lanes).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('song-study-fretboard')).toBeVisible();
  await expect(lanes.locator('.play-along-string')).toHaveText(['E', 'B', 'G', 'D', 'A', 'D']);
  await expect(lanes.locator('[data-current="true"]')).toHaveCount(2);
  const current = await lanes.locator('[data-current="true"]').evaluateAll(notes => notes.map(note => note.getAttribute('transform')?.split(',')[0]));
  expect(new Set(current).size).toBe(1);
  await page.getByRole('button', { name: 'Practice selection', exact: true }).click();
  await page.getByLabel('Practice tempo').fill('60');
  await page.getByLabel('Practice tempo').press('Enter');
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(500);
  await expect(lanes).toHaveAttribute('data-state', 'count-in');
  await expect(page.getByTestId('song-study-tuning')).toBeVisible();
  expect(await position(page)).toBeCloseTo(-3.5, 1);
  await page.getByRole('button', { name: 'Tab', exact: true }).click();
  await expect(page.getByTestId('practice-status')).toContainText('Count in');
  await expect(page.getByTestId('song-study-tuning')).toBeVisible();
  await page.getByRole('button', { name: 'Play-along', exact: true }).click();
  await page.clock.runFor(4650);
  expect(await position(page)).toBeGreaterThan(1);
  await expect(lanes.locator('[data-current="true"]')).toHaveCount(0); // The fractional rest.
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await position(page);
  await page.clock.runFor(1000);
  expect(await position(page)).toBe(paused);
  await page.getByLabel('Practice tempo').fill('120');
  await page.getByLabel('Practice tempo').press('Enter');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(350);
  expect(await position(page)).toBeLessThan(0.5); // Wraps the same 1.5-beat measure.
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByLabel('Count in', { exact: true }).selectOption('0');
  await page.getByLabel('Loop', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(lanes).toHaveAttribute('data-state', 'ended');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(lanes).toHaveAttribute('data-state', 'paused');
  await page.getByRole('button', { name: 'Exit Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Tab', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Full Tab', exact: true }).click();
  await expect(page.getByTestId('song-study-full-tab')).toBeVisible();
});

test('recording samples reconcile pause, buffering, rate, native seek, gaps, explicit repeats and selection loops', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openSong(page);
  const id = new URL(page.url()).searchParams.get('song');
  const song = await (await page.request.get(`/api/v2/song-studies/${id}`)).json();
  const result = await page.request.put(`/api/v2/song-studies/${id}/video-alignment`, { data: {
    expected_updated_at: song.updated_at,
    video_alignment: { video_id: 'M7lc1UVf-VE', recording_confirmed: true, passages: [
      { id: 'first', label: 'First verse', anchors: [
        { measure_index: 0, beat_index: 0, edge: 'start', video_seconds: 10 },
        { measure_index: 0, beat_index: 1, edge: 'end', video_seconds: 13 },
      ] },
      { id: 'repeat', label: 'Repeat', anchors: [
        { measure_index: 0, beat_index: 0, edge: 'start', video_seconds: 20 },
        { measure_index: 0, beat_index: 1, edge: 'end', video_seconds: 26 },
      ] },
    ] },
  } });
  expect(result.ok()).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Play-along', exact: true }).click();
  const lanes = page.getByTestId('play-along');
  await expect(lanes).toHaveAttribute('data-state', 'ready'); // No recording has played.
  await page.getByRole('button', { name: 'Open recording', exact: true }).click();
  await expect(page.locator('iframe[title="YouTube video player"]')).toBeVisible();
  await nativeTime(page, 11);
  await expect(page.getByTestId('song-study-tuning')).toBeVisible();
  await expect(page.getByTestId('song-study-tuning')).toHaveText('Tuning (low to high): D A D G B E');
  await expect(lanes).toHaveAttribute('data-state', 'paused');
  expect(await position(page)).toBeCloseTo(0.5);
  await expect(lanes.locator('[data-measure="1"]')).toHaveCount(0); // Lookahead ends at the occurrence.
  await nativeTime(page, 11.3); // A same-beat native seek still refreshes the paused view.
  expect(await position(page)).toBeCloseTo(0.65);
  await nativeTime(page, 22, 3);
  expect(await position(page)).toBeCloseTo(0.5); // Explicit repeat has a different slope.
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.clock.runFor(800);
  expect(await position(page)).toBeCloseTo(0.5); // Buffering freezes progress.
  await nativeTime(page, 22, 1);
  await page.evaluate(() => window.youtubeFake.active.emitRate(2));
  await page.clock.runFor(100);
  expect(await position(page)).toBeGreaterThan(0.53);
  await nativeTime(page, 15);
  await expect(lanes).toHaveAttribute('data-state', 'unavailable');
  await expect(lanes).toContainText('no usable timing');
  await page.getByLabel('Video occurrence', { exact: true }).selectOption('first');
  await page.getByLabel('Loop selection', { exact: true }).check();
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  // Use normal successive samples so the fake follows playback rather than a native seek.
  for (const time of [10.5, 11, 11.5, 12, 12.8]) {
    await page.clock.runFor(200);
    await nativeTime(page, time, 1);
  }
  await page.clock.runFor(200);
  await nativeTime(page, 13.01, 1);
  await expect.poll(() => page.evaluate(() => window.youtubeFake.active.time)).toBe(10);
  expect(await position(page)).toBeLessThan(0.3);
  await page.getByRole('button', { name: 'Tab', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select measure 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.youtubeFake.players.length)).toBe(1);
});

test('Play-along keeps desktop and phone layouts contained and provides a stepped motion option', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSong(page);
  await page.getByLabel('Playback source').selectOption('practice');
  await page.getByRole('button', { name: 'Intro', exact: true }).click();
  await page.getByRole('button', { name: 'Play-along', exact: true }).focus();
  await page.keyboard.press('Enter');
  const lanes = page.getByTestId('play-along');
  await expect(lanes).toBeVisible();
  await page.screenshot({ path: '/tmp/play-along-desktop-tutor.png' });
  await page.getByRole('button', { name: 'Close Tutor', exact: true }).click();
  await page.screenshot({ path: '/tmp/play-along-desktop.png' });
  if (await page.getByRole('button', { name: 'Expand navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await page.screenshot({ path: '/tmp/play-along-desktop-dark.png' });
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await lanes.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect(lanes.locator('.play-along-note').first().locator('text')).toHaveCSS('font-size', '13px');
    await page.screenshot({ path: `/tmp/play-along-mobile-${width}.png` });
    await page.getByRole('button', { name: 'Fretboard', exact: true }).click();
    await expect(page.getByTestId('song-study-fretboard')).toBeVisible();
    await expect(lanes).toBeHidden();
    await page.getByRole('button', { name: 'Score', exact: true }).click();
    await expect(lanes).toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(lanes).toHaveAttribute('data-motion', 'stepped');
  await page.getByRole('button', { name: 'Practice selection', exact: true }).click();
  await page.getByLabel('Count in', { exact: true }).selectOption('0');
  await page.getByLabel('Practice tempo').fill('60');
  await page.getByLabel('Practice tempo').press('Enter');
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(500);
  expect(await position(page)).toBe(0);
  await page.clock.runFor(600);
  expect(await position(page)).toBe(1);
});

test('missing rhythm stays unavailable, while dead notes remain readable as muted hits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSong(page);
  const id = new URL(page.url()).searchParams.get('song');
  const song = await (await page.request.get(`/api/v2/song-studies/${id}`)).json();
  const firstBeat = song.payload.tab_data.measures[0].voices[0].beats[0];
  delete firstBeat.duration;
  await page.route(`**/api/v2/song-studies/${id}`, route => route.fulfill({ json: song }));
  await page.reload();
  await page.getByLabel('Playback source').selectOption('practice');
  await page.getByRole('button', { name: 'Play-along', exact: true }).click();
  await expect(page.getByTestId('play-along')).toHaveAttribute('data-state', 'unavailable');
  await expect(page.getByRole('button', { name: 'Practice selection', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Tab', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select beat 1 of measure 1', exact: true })).toBeVisible();
  firstBeat.duration = [1, 4];
  firstBeat.notes = [{ string: 5, fret: 0, dead: true }];
  await page.reload();
  await page.getByRole('button', { name: 'Play-along', exact: true }).click();
  await expect(page.getByTestId('play-along').locator('[data-current="true"]')).toHaveAttribute('data-fret', 'x');
});

test('dense fractional notes remain separated at phone width while crossing the play line', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openSong(page);
  const id = new URL(page.url()).searchParams.get('song');
  const song = await (await page.request.get(`/api/v2/song-studies/${id}`)).json();
  song.payload.tab_data.measures[0].voices = [{ beats: [
    { duration: [1, 16], notes: [{ string: 0, fret: 12 }] },
    { duration: [1, 24], notes: [{ string: 0, fret: 14 }] },
    { duration: [1, 16], notes: [{ string: 0, fret: 15 }] },
    { duration: [1, 8], notes: [{ string: 0, fret: 17 }] },
  ] }];
  await page.route(`**/api/v2/song-studies/${id}`, route => route.fulfill({ json: song }));
  await page.reload();
  await page.getByLabel('Playback source').selectOption('practice');
  await page.getByRole('button', { name: 'Play-along', exact: true }).click();
  const notes = page.getByTestId('play-along').locator('.play-along-note');
  const minimumGap = async () => notes.evaluateAll(items => {
    const boxes = items.map(item => item.getBoundingClientRect());
    return Math.min(...boxes.slice(1).map((box, index) => box.left - boxes[index].right));
  });
  expect(await minimumGap()).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Practice selection', exact: true }).click();
  await page.getByLabel('Count in', { exact: true }).selectOption('0');
  await page.getByLabel('Practice tempo').fill('60');
  await page.getByLabel('Practice tempo').press('Enter');
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(180);
  expect(await minimumGap()).toBeGreaterThanOrEqual(3);
  await expect(notes.filter({ hasText: '12' })).toHaveCount(0); // Whole badges leave the lane, never a clipped second digit.
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByTestId('play-along').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/play-along-mobile-dense.png' });
});
