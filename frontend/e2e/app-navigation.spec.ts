import { expect, test } from '@playwright/test';

test('sidebar preserves the current session across destinations and collapses on mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Learn the fretboard', exact: true }).click();
  const session = await page.getByTestId('v2-active-session').textContent();
  const nav = page.getByRole('navigation', { name: 'Main navigation' }).or(page.getByRole('complementary', { name: 'Main navigation' }));
  await nav.getByRole('button', { name: 'Sessions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sessions', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'My Stuff', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My Stuff', level: 1 })).toBeVisible();
  await nav.getByRole('button', { name: 'Current workspace', exact: true }).click();
  await expect(page.getByTestId('v2-active-session')).toHaveText(session!);
  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-collapsed', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Sessions', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Expand navigation' }).click();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
