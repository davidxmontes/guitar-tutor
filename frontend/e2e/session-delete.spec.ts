import { expect, test } from '@playwright/test';

test('delete a session from recent work and keep it deleted after reload', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Learn the fretboard', exact: true }).click();
  const id = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const row = page.locator('.learning-session-row').filter({ has: page.locator(`[data-session-id="${id}"]`) });
  page.once('dialog', dialog => dialog.dismiss());
  await row.getByRole('button', { name: /^Delete session:/ }).click();
  await expect(row).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: /^Delete session:/ }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(page.locator(`[data-session-id="${id}"]`)).toHaveCount(0);
});
