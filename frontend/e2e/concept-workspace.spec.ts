import { expect, test } from '@playwright/test';

test('Explore comparison coordinates music, inspection, views, audio and autosaved recovery', async ({ page }) => {
  await page.addInitScript(() => {
    const starts: number[] = [];
    Object.assign(window, { workspaceAudioStarts: starts });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0) { starts.push(when); start.call(this, when); };
  });
  const tutorRequests: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/tutor/')) tutorRequests.push(request.url()); });
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Explore major vs minor' }).click();
  await expect(page.getByRole('heading', { name: 'G major vs G minor' })).toBeVisible();
  const sessionId = (await page.getByTestId('v2-active-session').innerText()).replace('Session ', '');
  const branchId = (await page.getByTestId('v2-active-branch').innerText()).replace('Branch ', '');
  const fretboard = page.getByRole('region', { name: 'Fretboard', exact: true });

  // Every rendered note is a keyboard-focusable element with a note/string/fret name.
  const firstNote = fretboard.getByRole('button', { name: /degree .+, string \d+, fret \d+/ }).first();
  await firstNote.focus();
  await expect(firstNote).toBeFocused();

  // Inspecting a changed note (via the keyboard) lights it on the fretboard; Back clears it.
  await fretboard.getByRole('button', { name: 'G minor: Bb,' }).first().press('Enter');
  await expect(fretboard.getByRole('button', { pressed: true }).first()).toHaveAccessibleName(/Bb/);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(fretboard.getByRole('button', { pressed: true })).toHaveCount(0);

  await page.getByLabel('Both roots').selectOption('D');
  await expect(page.getByRole('heading', { name: 'D major vs D minor' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Draft autosaved' })).toBeVisible();
  await fretboard.first().getByLabel('Labels').selectOption('intervals');
  await expect(page.getByRole('status').filter({ hasText: 'Draft autosaved' })).toBeVisible();

  await page.getByRole('button', { name: 'Hear comparison' }).click();
  await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
  const starts = await page.evaluate(() => (window as unknown as { workspaceAudioStarts: number[] }).workspaceAudioStarts);
  expect(starts).toHaveLength(16);
  expect(starts[8] - starts[0]).toBeCloseTo(2.4);
  await page.getByRole('button', { name: 'Stop playback' }).click();

  // A second fretboard bound only to the major scale reacts to the global pointer
  // when it contains the inspected note, and stays quiet when it does not.
  await page.getByRole('button', { name: 'Add View' }).click();
  await page.getByLabel('Musical source').selectOption({ label: 'D major' });
  await expect(page.getByLabel('View type')).toHaveText(/FretboardDegree strip/);
  await page.getByLabel('View type').selectOption('fretboard');
  await page.getByRole('button', { name: 'Add selected view' }).click();
  await expect(fretboard).toHaveCount(2);
  await fretboard.first().getByRole('button', { name: 'D minor: F,' }).first().click();
  await expect(fretboard.first().getByRole('button', { pressed: true }).first()).toBeVisible();
  await expect(fretboard.last().getByRole('button', { pressed: true })).toHaveCount(0);
  await fretboard.first().getByRole('button', { name: 'D minor: A,' }).first().click();
  await expect(fretboard.last().getByRole('button', { pressed: true }).first()).toHaveAccessibleName(/A,/);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await fretboard.last().getByRole('button', { name: 'Remove View' }).click();
  await expect(fretboard).toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: 'Draft autosaved' })).toBeVisible();

  const session = await page.request.get(`/api/v2/sessions/${sessionId}`).then(r => r.json());
  const draft = session.branches.find((b: {id: string}) => b.id === branchId).working_draft;
  expect(draft.entities.map((e: {root: string}) => e.root)).toEqual(['D', 'D']);
  expect(draft.blocks).toHaveLength(2);
  expect(draft.blocks[0].settings.labels).toBe('intervals');
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });
  await page.reload();
  await page.locator(`[data-session-id="${sessionId}"]`).click();
  await page.getByRole('tab', { name: /G major vs G minor/ }).click();
  await expect(page.getByRole('heading', { name: 'D major vs D minor' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Fretboard', exact: true }).getByLabel('Labels')).toHaveValue('intervals');
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Hear comparison' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop playback' })).toBeFocused();
  await page.screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true });
  expect(tutorRequests).toEqual([]);
});

test('Failed autosave preserves editable music and retries without partial server state', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Explore major vs minor' }).click();
  await expect(page.getByRole('heading', { name: 'G major vs G minor' })).toBeVisible();
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  await page.route('**/branches/*/workspace', route => route.fulfill({ status: 503, body: '{}' }));
  await page.getByLabel('Both roots').selectOption('Bb');
  await expect(page.getByRole('alert')).toContainText('Your edits are still here');
  await expect(page.getByRole('button', { name: 'My Stuff', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Bb major vs Bb minor' })).toBeVisible();
  await page.unroute('**/branches/*/workspace');
  await page.getByRole('button', { name: 'Retry autosave' }).click();
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'My Stuff', exact: true })).toBeEnabled();
  await page.getByLabel('Scale 2 mode').selectOption('dorian');
  await expect(page.getByRole('heading', { name: 'Bb major vs Bb dorian' })).toBeVisible();
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  await page.getByLabel('Tuning', { exact: true }).selectOption('[64,59,55,50,45,38]');
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route('**/concept-workspaces/resolve', route => route.fulfill({ status: 422, body: '{}' }));
  await page.getByLabel('Scale 1 root').selectOption('C');
  await expect(page.getByRole('alert')).toContainText('previous draft is unchanged');
  await expect(page.getByRole('heading', { name: 'Bb major vs Bb dorian' })).toBeVisible();
});
