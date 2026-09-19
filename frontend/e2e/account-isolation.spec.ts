import { expect, test, type Page, type Route } from '@playwright/test';

const session = (id: string) => ({ id, branches: [], created_at: '2026-01-01', updated_at: '2026-01-01' });
async function switchAccount(page: Page, userId: string | null, isLoaded = true) {
  await page.evaluate(detail => window.dispatchEvent(new CustomEvent('test-account', { detail })), { userId, isLoaded });
}
async function releaseList(page: Page, route: Route, id: string) {
  const received = page.waitForResponse(response => response.request() === route.request());
  await route.fulfill({ json: [session(id)] });
  await (await received).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
  // Script the external auth boundary without Clerk credentials or network calls.
  await page.route('**/src/lib/authBypass.ts', route => route.fulfill({
    contentType: 'application/javascript',
    body: "export { AUTH_DEV_BYPASS, useAppAuth } from '/e2e/account-isolation-auth.ts';",
  }));
  await page.route('**/@clerk_clerk-react.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export const ClerkProvider = ({ children }) => children; export const SignInButton = ClerkProvider; export const UserButton = () => null; export const useAuth = () => ({});',
  }));
});

test('account changes clear workspace and library state and ignore the previous account response', async ({ page }) => {
  const pending: Route[] = [];
  const libraryAccounts: (string | undefined)[] = [];
  let delay = false;
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const account = route.request().headers().authorization?.replace('Bearer ', '');
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v2/library') {
      libraryAccounts.push(account);
      await route.fulfill({ json: [{ id: `${account}-saved`, kind: 'exercise', title: `${account} saved exercise`, created_at: '2026-01-01' }] });
    } else if (path === '/api/v2/sessions') {
      if (delay && account === 'account-a') pending.push(route);
      else await route.fulfill({ json: [session(`${account}-session`)] });
    } else {
      await route.fulfill({ json: session(`${account}-session`) });
    }
  });
  await page.goto('/');
  await expect(page.locator('[data-session-id="account-a-session"]')).toBeVisible();
  await page.locator('[data-session-id="account-a-session"]').click();
  await expect(page.getByTestId('v2-active-session')).toHaveText('Session account-a-session');
  delay = true;
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  await switchAccount(page, 'account-b');
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Current workspace', exact: true })).toHaveCount(0);
  await expect(page.getByText('account-b saved exercise', { exact: true })).toBeVisible();
  await expect(page.getByText('account-a saved exercise', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-session-id="account-b-session"]')).toBeVisible();
  for (const route of pending) await releaseList(page, route, 'account-a-session');
  await expect(page.locator('[data-session-id="account-a-session"]')).toHaveCount(0);
  await expect(page.locator('[data-session-id="account-b-session"]')).toBeVisible();
  expect(libraryAccounts.every(account => account === 'account-a' || account === 'account-b')).toBe(true);
  await switchAccount(page, null);
  await expect(page.getByRole('button', { name: 'Sign in to Guitar Tutor' })).toBeVisible();
  await expect(page.getByTestId('library-item')).toHaveCount(0);
  await switchAccount(page, 'account-b', false);
  await expect(page.getByRole('status')).toHaveText('Opening Guitar Tutor…');
  await switchAccount(page, 'account-b');
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Current workspace', exact: true })).toHaveCount(0);
});

test('late session lists cannot replace newer results or restore deleted sessions', async ({ page }) => {
  const pending: Route[] = [];
  let delay = false;
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'DELETE') await route.fulfill({ json: { deleted: true } });
    else if (path === '/api/v2/sessions') {
      if (delay) pending.push(route);
      else await route.fulfill({ json: [session('existing-session')] });
    } else await route.fulfill({ json: [] });
  });
  await page.goto('/');
  await expect(page.locator('[data-session-id="existing-session"]')).toBeVisible();
  delay = true;
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect.poll(() => pending.length).toBe(2);
  await releaseList(page, pending[1], 'existing-session');
  await releaseList(page, pending[0], 'stale-session');
  await expect(page.locator('[data-session-id="existing-session"]')).toBeVisible();
  await expect(page.locator('[data-session-id="stale-session"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await expect.poll(() => pending.length).toBe(3);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete session: Saved work' }).click();
  await expect(page.locator('[data-session-id="existing-session"]')).toHaveCount(0);
  await releaseList(page, pending[2], 'existing-session');
  await expect(page.getByRole('heading', { name: 'A fresh start.' })).toBeVisible();
  await expect(page.locator('[data-session-id="existing-session"]')).toHaveCount(0);
});
