import { expect, test } from '@playwright/test';

test('D to G coordinates physical views, Hear, direct Tutor reshaping and Undo', async ({ page }) => {
  let turns = 0;
  page.on('request', r => { if (r.url().endsWith('/tutor/turns')) turns++; });
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Why does D resolve to G?' }).click();
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why D resolves to G' })).toBeVisible();
  const diagrams = page.getByRole('region', { name: 'Chord diagrams', exact: true });
  const fretboard = page.getByRole('region', { name: 'Fretboard', exact: true });
  const circle = page.getByRole('region', { name: 'Circle', exact: true });
  await diagrams.getByRole('button', { name: 'Inspect D major', exact: true }).click();
  await expect(circle.getByRole('button', { name: 'Inspect D major' })).toHaveAttribute('aria-pressed', 'true');
  await expect(fretboard.getByRole('button', { name: /D open: F#.*string 1, fret 2/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(fretboard.getByRole('button', { name: /G open: G.*string 1, fret 3/ })).toHaveAttribute('aria-pressed', 'false');
  await diagrams.getByRole('button', { name: 'D open: F#, string 1, fret 2' }).click();
  await expect(fretboard.getByRole('button', { name: /D open: F#.*string 1, fret 2/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(circle.getByRole('button', { name: 'Inspect D major' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Hear D to G', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop playback' }).click();
  expect(turns).toBe(0);
  await page.screenshot({ path:'/private/tmp/issue64-desktop.png', fullPage:true });
  if (!(await page.getByRole('complementary', {name:'Tutor',exact:true}).isVisible())) await page.getByRole('button', {name:'Open Tutor',exact:true}).click();
  await page.getByTestId('tutor-chat-input').fill('Give me a smoother way to move from D to G');
  await page.getByTestId('tutor-chat-send').click();
  await expect(page.getByText('Tutor change applied', { exact:true })).toBeVisible();
  await expect(diagrams.getByRole('button', { name:'Inspect G over D · compact', exact:true })).toBeVisible();
  await expect(diagrams.getByRole('img', { name:/G over D · compact.*String 3 fret 4/ })).toBeVisible();
  if (!(await page.getByRole('complementary', {name:'Tutor',exact:true}).isVisible())) await page.getByRole('button', {name:'Open Tutor',exact:true}).click();
  await page.getByTestId('tutor-chat-input').fill('Try an invalid voicing');
  await page.getByTestId('tutor-chat-send').click();
  await expect(page.getByText(/No change was applied:/)).toBeVisible();
  await page.getByRole('button', { name:'Undo Tutor change', exact:true }).click();
  await expect(diagrams.getByRole('button', { name:'Inspect G open', exact:true })).toBeVisible();
  await page.setViewportSize({ width:320, height:800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path:'/private/tmp/issue64-mobile.png', fullPage:true });
  await page.getByRole('button', { name:'Save as study', exact:true }).click();
  await expect(page.getByText('Study saved in My Stuff.', { exact:true })).toBeVisible();
  const sid = (await page.getByTestId('v2-active-session').innerText()).replace('Session ', '');
  const bid = (await page.getByTestId('v2-active-branch').innerText()).replace('Branch ', '');
  await page.reload();
  await page.locator(`[data-session-id="${sid}"]`).click();
  await page.getByLabel('Current workspace', { exact:true }).selectOption(bid);
  await expect(diagrams.getByRole('button', { name:'Inspect G open', exact:true })).toBeVisible();
  if (!(await page.getByRole('complementary', {name:'Tutor',exact:true}).isVisible())) await page.getByRole('button', {name:'Open Tutor',exact:true}).click();
  await page.getByRole('button', { name:'Preview turn workspace', exact:true }).first().click();
  await expect(page.getByRole('region', { name:'Turn snapshot preview' }).getByRole('img', { name:/G over D · compact/ })).toBeVisible();
  await page.getByRole('button', { name:'Return to current', exact:true }).click();
  expect(turns).toBe(2);
});

test('physical audio schedules selected tuning and positions on one clock and stops both shapes', async ({ page }) => {
  await page.goto('/v2');
  const result = await page.evaluate(async () => {
    const starts: number[] = []; let stops = 0;
    class TestAudioContext {
      state = 'running'; currentTime = 10; sampleRate = 44100; destination = {};
      createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
      createBufferSource() { return { connect() {}, start(time: number) { starts.push(time); }, stop() { stops++; } }; }
    }
    Object.defineProperty(window, 'AudioContext', { value:TestAudioContext });
    const path = '/src/utils/audio.ts';
    const { playChordSequence, getFrequency } = await import(path);
    const tuning = [64,59,55,50,45,38];
    const stop = playChordSequence([{ positions:[{string:6,fret:0},{string:1,fret:2}], tuning }, { positions:[{string:6,fret:5}], tuning }]);
    stop();
    return { starts, stops, low: getFrequency(6,0,tuning), high:getFrequency(1,2,tuning) };
  });
  expect(result.starts).toEqual([10,10.03,11.2]);
  expect(result.stops).toBe(3);
  expect(result.low).toBeCloseTo(73.416, 2);
  expect(result.high).toBeCloseTo(369.994, 2);
});
