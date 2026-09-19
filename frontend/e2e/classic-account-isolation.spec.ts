import { expect, test, type Page, type Route } from '@playwright/test';

async function favoriteTitles(page: Page) {
  return page.evaluate(async () => {
    const storeModule = '/src/stores/useAppStore.ts';
    const { useAppStore } = await import(storeModule);
    return useAppStore.getState().favorites.map((favorite: { title: string }) => favorite.title);
  });
}

test('Classic isolates account histories, ignores old work, and retains anonymous and unowned data', async ({ page }) => {
  let account: string | null = 'account-a';
  let pendingChat: Route | undefined;
  const requests: Array<{ account: string | undefined; body: { message: string; bootstrap_history: unknown[] } }> = [];
  const legacyHistory = JSON.stringify([{ id: 'legacy', role: 'assistant', content: 'Unowned private history', timestamp: '2026-01-01' }]);
  page.on('pageerror', error => { throw error; });
  await page.addInitScript(history => {
    if (sessionStorage.getItem('legacy-history-seeded')) return;
    localStorage.setItem('guitar-tutor-messages', history);
    localStorage.setItem('guitar-tutor-thread-id', 'unowned-thread');
    sessionStorage.setItem('legacy-history-seeded', 'true');
  }, legacyHistory);
  await page.route('**/src/lib/authBypass.ts', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export { AUTH_DEV_BYPASS, useAppAuth } from '/e2e/account-isolation-auth.ts';
      import '/e2e/account-isolation-auth.ts';
      window.dispatchEvent(new CustomEvent('test-account', { detail: { userId: ${JSON.stringify(account)}, isLoaded: true } }));`,
  }));
  await page.route('**/@clerk_clerk-react.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export const ClerkProvider = ({ children }) => children; export const SignInButton = ClerkProvider; export const UserButton = () => null; export const useAuth = () => ({});',
  }));
  await page.route('**/api/user/**', route => {
    const owner = route.request().headers().authorization?.replace('Bearer ', '');
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith('/favorites') ? [
      { id: `${owner}-favorite`, songsterr_song_id: 113, title: `${owner} favorite`, artist: 'Practice Band', created_at: '2026-01-01' },
    ] : [] });
  });
  await page.route('**/api/agent/chat/stream', route => {
    const owner = route.request().headers().authorization?.replace('Bearer ', '');
    const body = route.request().postDataJSON();
    requests.push({ account: owner, body });
    if (body.message === 'Pending account A question') {
      pendingChat = route;
      return;
    }
    return route.fulfill({ contentType: 'text/event-stream', body: `event: answer\ndata: ${JSON.stringify({
      answer: `Reply for ${owner ?? 'anonymous'}`, scale: null, chord_choices: [], visualizations: false,
      out_of_scope: false, interrupted: false, actions: [],
    })}\n\n` });
  });

  const switchAccount = async (next: string | null) => {
    account = next;
    const loaded = page.waitForEvent('load');
    await page.evaluate(userId => window.dispatchEvent(new CustomEvent('test-account', { detail: { userId, isLoaded: true } })), next);
    await loaded;
    await expect(page.locator('aside textarea')).toBeVisible();
    await expect(page.getByText('Unowned private history', { exact: true })).toHaveCount(0);
  };
  const send = async (message: string) => {
    await page.locator('aside textarea').fill(message);
    await page.locator('aside textarea').press('Enter');
  };

  await page.goto('/classic');
  await expect.poll(() => favoriteTitles(page)).toEqual(['account-a favorite']);
  await expect(page.getByText('Unowned private history', { exact: true })).toHaveCount(0);
  await send('Private account A question');
  await expect(page.locator('aside').getByText('Reply for account-a', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-account', { detail: { userId: 'account-a', isLoaded: false } })));
  await expect(page.locator('aside')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-account', { detail: { userId: 'account-a', isLoaded: true } })));
  await expect(page.locator('aside').getByText('Private account A question', { exact: true })).toBeVisible();
  await send('Pending account A question');
  await expect.poll(() => Boolean(pendingChat)).toBe(true);
  await switchAccount('account-b');
  await pendingChat!.fulfill({ contentType: 'text/event-stream', body: 'event: answer\ndata: {"answer":"Late private reply for account A","actions":[]}\n\n' });
  await expect.poll(() => favoriteTitles(page)).toEqual(['account-b favorite']);
  await expect(page.getByText('Private account A question', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Late private reply for account A', { exact: true })).toHaveCount(0);

  await switchAccount(null);
  await expect.poll(() => favoriteTitles(page)).toEqual([]);
  await expect(page.getByText('Private account A question', { exact: true })).toHaveCount(0);
  await send('New anonymous question');
  await expect(page.locator('aside').getByText('Reply for anonymous', { exact: true })).toBeVisible();
  await switchAccount('account-b');
  await expect(page.getByText('New anonymous question', { exact: true })).toHaveCount(0);
  await switchAccount(null);
  await expect(page.locator('aside').getByText('New anonymous question', { exact: true })).toBeVisible();
  await switchAccount('account-a');
  await expect(page.locator('aside').getByText('Private account A question', { exact: true })).toBeVisible();
  await expect(page.getByText('New anonymous question', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('guitar-tutor-messages'))).toBe(legacyHistory);
  expect(await page.evaluate(() => localStorage.getItem('guitar-tutor-thread-id'))).toBe('unowned-thread');
  expect(requests.map(request => request.account)).toEqual(['account-a', 'account-a', undefined]);
  expect(requests.every(request => request.body.bootstrap_history.length === 0)).toBe(true);
});
