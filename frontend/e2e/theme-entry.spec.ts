import { expect, test } from '@playwright/test';

test('theme follows system preference then persists across independently loaded app entries', async ({ page }) => {
  let modules: string[] = [];
  page.on('pageerror', error => { throw error; });
  page.on('request', request => modules.push(new URL(request.url()).pathname));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByTestId('v2-start-session')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(modules).toContain('/src/v2/V2App.tsx');
  expect(modules).not.toContain('/src/App.tsx');
  expect(modules).not.toContain('/src/stores/useAppStore.ts');

  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('darkMode'))).toBe('false');

  modules = [];
  await page.goto('/classic');
  await expect(page.getByRole('button', { name: 'Chords', exact: true })).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  expect(modules).toContain('/src/App.tsx');
  expect(modules).not.toContain('/src/v2/V2App.tsx');
  await page.getByTitle('Switch to dark mode', { exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('darkMode'))).toBe('true');

  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('link', { name: 'Return to Guitar Tutor', exact: true }).click();
  await expect(page.getByTestId('v2-start-session')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch to light mode', exact: true })).toBeVisible();
});
