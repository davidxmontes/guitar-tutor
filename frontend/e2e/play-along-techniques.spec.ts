import { expect, test, type Page } from '@playwright/test';
import { installYouTubeFake } from './youtube-fake';

async function openTechniqueSong(page: Page) {
  await installYouTubeFake(page);
  await page.route('**/video-suggestions', route => route.fulfill({ json: { candidates: [], score_duration_seconds: null } }));
  await page.route('**/api/v2/song-studies', async route => {
    const response = await route.fetch();
    const song = await response.json();
    song.payload.tab_data.measures[0].voices = [{ beats: [
      { duration: [1, 16], palmMute: true, letRing: true, pickStroke: 'up', notes: [
        { string: 0, fret: 13, slide: true, bend: true, hp: true, vibrato: true, harmonic: true, ghost: true, staccato: true, accentuated: true },
        { string: 1, fret: 7, bend: true, harmonic: true },
        { string: 3, fret: 5, rest: true, slide: true },
      ] },
      { duration: [1, 16], downStroke: true, notes: [{ string: 0, fret: 15, slide: true, hp: true }] },
      { duration: [1, 16], rest: true, palmMute: true, notes: [{ string: 0, fret: 19, bend: true }] },
      { duration: [1, 8], notes: [{ string: 4, fret: 99, dead: true, bend: true, hp: true }] },
    ] }];
    song.payload.video_alignment = { video_id: 'M7lc1UVf-VE', recording_confirmed: true, passages: [{ id: 'phrase', label: 'Phrase', anchors: [
      { measure_index: 0, beat_index: 0, edge: 'start', video_seconds: 0 },
      { measure_index: 0, beat_index: 3, edge: 'end', video_seconds: 5 },
    ] }] };
    await route.fulfill({ response, json: song });
  });
  await page.goto('/v2');
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: 'Expand navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
  await expect(page.getByTestId('song-study-title')).toContainText('Study Fixture');
  await page.getByRole('button', { name: 'Play-along', exact: true }).click();
}

test('technique cues sit at their fret and beat positions, travel with practice, and describe only supplied actions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTechniqueSong(page);
  await page.getByLabel('Playback source').selectOption('practice');
  const board = page.getByTestId('play-along');
  const note = board.locator('.play-along-note[data-fret="13"]');
  await expect(note.locator('.play-along-technique')).toHaveText(['S', 'B', 'H/P', '~', '◇', '( )', '·', '>']);
  await expect(note).toHaveAttribute('aria-label', /String 1, fret 13: slide, bend, hammer-on \/ pull-off, vibrato, harmonic, ghost note, staccato, accent/);
  await expect(board.locator('svg')).toHaveAccessibleDescription(/String 1, fret 13: slide, bend, hammer-on \/ pull-off/);
  await expect(board.locator('.play-along-beat-cues[data-beat="0"]')).toContainText('P.M.');
  await expect(board.locator('.play-along-beat-cues[data-beat="0"]')).toContainText('ring');
  await expect(board.locator('.play-along-beat-cues[data-beat="0"]')).toContainText('↑');
  await expect(board.locator('.play-along-beat-cues[data-beat="1"]')).toContainText('↓');
  await expect(board.locator('[data-fret="19"], [data-fret="5"]')).toHaveCount(0);
  await expect(board.locator('.play-along-note[data-fret="x"] .play-along-technique')).toHaveCount(0);
  await expect(board.locator('.play-along-beat-cues[data-beat="2"]')).toHaveCount(0);
  await board.getByText('Technique key', { exact: true }).click();
  await expect(board.getByText('hammer-on / pull-off', { exact: true })).toBeVisible();
  await expect(board.getByText('Pick up', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/play-along-techniques-desktop.png' });
  await page.getByRole('button', { name: 'Practice selection', exact: true }).click();
  await page.getByLabel('Count in', { exact: true }).selectOption('0');
  await page.getByLabel('Practice tempo').fill('60');
  await page.getByLabel('Practice tempo').press('Enter');
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  const start = await note.getAttribute('transform');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(30);
  await expect(note).not.toHaveAttribute('transform', start!);
  await expect(note.locator('.play-along-technique')).toHaveCount(8);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await note.getAttribute('transform');
  await page.clock.runFor(300);
  await expect(note).toHaveAttribute('transform', paused!);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(50);
  await expect(note).toHaveCount(0); // Whole combined pill leaves; fret13 cannot become a clipped3.
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(100);
  await expect(note).toHaveAttribute('transform', start!);
  await expect(note.locator('.play-along-technique')).toHaveCount(8);
});

test('dense combined cues stay whole and readable at 320px in both themes and follow recording seeks', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openTechniqueSong(page);
  const board = page.getByTestId('play-along');
  const note = board.locator('.play-along-note[data-fret="13"]');
  await expect(note.locator('.play-along-technique')).toHaveCount(8);
  await expect(note.locator('.play-along-fret')).toHaveCSS('font-size', '13px');
  await expect(board.locator('.play-along-note[data-string="0"]')).toHaveCount(2);
  const first = (await note.boundingBox())!;
  const adjacent = (await board.locator('.play-along-note[data-fret="7"]').boundingBox())!;
  expect(first.y + first.height + 4).toBeLessThanOrEqual(adjacent.y); // Include the active stroke in the painted bounds.
  const separated = async () => board.locator('.play-along-note[data-string="0"]').evaluateAll(notes => {
    const boxes = notes.map(node => node.getBoundingClientRect());
    return boxes.every((box, index) => index === 0 || box.left >= boxes[index - 1].right + 3);
  });
  expect(await separated()).toBe(true);
  const contained = async () => board.locator('.play-along-lanes').evaluate(svg => {
    const bounds = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('.play-along-note, .play-along-beat-cues')].every(node => {
      const box = node.getBoundingClientRect();
      return box.left >= bounds.left + 35 && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
    });
  });
  expect(await contained()).toBe(true);
  await board.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/play-along-techniques-mobile.png' });
  if (await page.getByRole('button', { name: 'Expand navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  if (await page.getByRole('button', { name: 'Collapse navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
  await board.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/play-along-techniques-dense-dark.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('button', { name: 'Open recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play selection', exact: true })).toBeEnabled();
  await page.evaluate(() => { window.youtubeFake.active.time = 1.1; window.youtubeFake.active.emitState(2); });
  await expect(board.locator('.play-along-note[data-current="true"]')).toHaveAttribute('data-fret', '15');
  await expect(board.locator('.play-along-note[data-current="true"] .play-along-technique')).toHaveText(['S', 'H/P']);
  await expect(board.locator('.play-along-beat-cues[data-current="true"]')).toHaveAttribute('aria-label', /Pick down/);
  await page.evaluate(() => { window.youtubeFake.active.time = 2.1; window.youtubeFake.active.emitState(2); });
  await expect(board.locator('.play-along-note[data-current="true"], .play-along-beat-cues[data-current="true"]')).toHaveCount(0);
  await page.evaluate(() => { window.youtubeFake.active.time = 3.1; window.youtubeFake.active.emitState(2); });
  await expect(board.locator('.play-along-note[data-current="true"]')).toHaveAttribute('data-fret', 'x');
  await expect(board.locator('.play-along-note[data-current="true"] .play-along-technique')).toHaveCount(0);
});
