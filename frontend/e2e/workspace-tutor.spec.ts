import { expect, test } from '@playwright/test';

test('Tutor applies directly, reloads history, and undoes an exact workspace snapshot', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Explore major vs minor' }).click();
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  const sid = (await page.getByTestId('v2-active-session').innerText()).replace('Session ', '');
  const bid = (await page.getByTestId('v2-active-branch').innerText()).replace('Branch ', '');
  const branch = () => page.request.get(`/api/v2/sessions/${sid}`).then(r => r.json()).then(s => s.branches.find((b: {id: string}) => b.id === bid));
  const original = (await branch()).working_draft;
  await page.getByRole('region', { name: 'Degree strip' }).getByRole('button', { name: 'G major: B, degree 3, changed' }).click();
  await page.getByTestId('tutor-chat-input').fill('Change the first scale to G Dorian');
  await page.getByTestId('tutor-chat-send').click();
  await expect(page.getByText('Tutor change applied', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'G dorian vs G minor' })).toBeVisible();
  expect((await branch()).working_draft.entities[0].mode).toBe('dorian');
  await page.reload();
  await page.locator(`[data-session-id="${sid}"]`).click();
  await page.getByRole('tab', { name: /G major vs G minor/ }).click();
  await expect(page.getByRole('button', { name: 'Undo Tutor change' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo Tutor change' }).click();
  await expect(page.getByRole('heading', { name: 'G major vs G minor' })).toBeVisible();
  const restored = (await branch()).working_draft;
  expect(restored).toEqual({ ...original, version: 3 });
  await expect(page.getByTestId('tutor-chat-message-assistant').first()).toContainText('now G Dorian');
  await expect(page.getByText('Tutor change undone', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo Tutor change' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/tutor-workspace-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByTestId('tutor-chat-input').focus();
  await expect(page.getByTestId('tutor-chat-input')).toBeFocused();
  await page.screenshot({ path: 'test-results/tutor-workspace-mobile.png', fullPage: true });
});

test('Invalid and stale Tutor changes preserve conversation and the current draft', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Explore major vs minor' }).click();
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  await page.getByTestId('tutor-chat-input').fill('Try an invalid change');
  await page.getByTestId('tutor-chat-send').click();
  await expect(page.getByTestId('tutor-chat-message-assistant')).toContainText('explanation remains visible');
  await expect(page.getByRole('alert')).toContainText('No change was applied');
  await expect(page.getByRole('heading', { name: 'G major vs G minor' })).toBeVisible();
  const sid = (await page.getByTestId('v2-active-session').innerText()).replace('Session ', '');
  const bid = (await page.getByTestId('v2-active-branch').innerText()).replace('Branch ', '');
  const branch = await page.request.get(`/api/v2/sessions/${sid}`).then(r => r.json()).then(s => s.branches.find((b: {id: string}) => b.id === bid));
  await page.getByTestId('tutor-chat-input').fill('Make a slow change');
  const sent = page.waitForRequest('**/api/v2/tutor/turns');
  await page.getByTestId('tutor-chat-send').click();
  await sent;
  await page.waitForTimeout(150); // The scripted model waits 1 second, exposing a real stale-response race.
  branch.working_draft.entities[0].root = 'D';
  const saved = await page.request.put(`/api/v2/sessions/${sid}/branches/${bid}/workspace`, { data: { workspace: branch.working_draft, expected_version: 1 } });
  expect(saved.ok()).toBe(true);
  await expect(page.getByTestId('tutor-chat-message-assistant').last()).toContainText('older draft');
  await expect(page.getByRole('heading', { name: 'D major vs G minor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo Tutor change' })).toHaveCount(0);
});

test('Tutor alternatives are normal scales with editable music and removable dependent views', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Explore major vs minor' }).click();
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  await page.getByTestId('tutor-chat-input').fill('Show two alternatives');
  await page.getByTestId('tutor-chat-send').click();
  await expect(page.getByText('Tutor change applied', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Brighter option:/ }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Degree strip' })).toHaveCount(2);
  await page.getByText('Edit each scale and tuning', { exact: true }).click();
  await page.getByLabel('Scale 3 root', { exact: true }).selectOption('D');
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove scale 3', exact: true }).click();
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Degree strip' })).toHaveCount(1);
  await expect(page.getByLabel('Scale 4 root', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'G major vs G minor' })).toBeVisible();
});

test('A failed post-turn view request preserves the authoritative saved draft and offers reload', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Explore major vs minor' }).click();
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  await page.route('**/api/v2/concept-workspaces/resolve', route => route.abort());
  await page.getByTestId('tutor-chat-input').fill('Change the first scale to G Dorian');
  await page.getByTestId('tutor-chat-send').click();
  await expect(page.getByText('Tutor change applied', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Your Tutor change is saved');
  await page.getByText('Edit each scale and tuning', { exact: true }).click();
  await expect(page.getByLabel('Scale 1 mode', { exact: true })).toHaveValue('dorian');
  await expect(page.getByRole('button', { name: 'Retry autosave' })).toHaveCount(0);
  await page.unroute('**/api/v2/concept-workspaces/resolve');
  await page.getByRole('button', { name: 'Undo Tutor change' }).click();
  await expect(page.getByRole('heading', { name: 'G major vs G minor' })).toBeVisible();
});
