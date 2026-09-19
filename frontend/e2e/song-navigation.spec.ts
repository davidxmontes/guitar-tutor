import { expect, test } from '@playwright/test';

async function openSong(page: import('@playwright/test').Page) {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
  await expect(page.getByTestId('song-study-title')).toContainText('Study Fixture');
  return new URL(page.url()).searchParams.get('song')!;
}

test('unsaved song refresh, cached search breadcrumb and history keep song identity', async ({ page }) => {
  const id = await openSong(page);
  await expect(page.getByRole('navigation', { name: 'Song navigation' })).toContainText('Study Fixture');
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'Song search', exact: true }).click();
  await expect(page.getByLabel('Search songs')).toHaveValue('fixture');
  await expect(page.getByRole('button', { name: 'Drop D guitar', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('song-study-title')).toContainText('Study Fixture');
  expect(new URL(page.url()).searchParams.get('song')).toBe(id);
  await page.goForward();
  await expect(page.getByLabel('Search songs')).toHaveValue('fixture');
  await page.goBack();
  await expect(page.getByTestId('song-study-title')).toBeVisible();
  const sessionsBefore = await (await page.request.get('/api/v2/sessions')).json();
  await page.reload();
  await expect(page.getByTestId('song-study-title')).toContainText('Study Fixture');
  expect(new URL(page.url()).searchParams.get('song')).toBe(id);
  expect(await (await page.request.get('/api/v2/sessions')).json()).toEqual(sessionsBefore);
  await page.getByRole('button', { name: 'Song search', exact: true }).click();
  await expect(page.getByLabel('Search songs')).toHaveValue('fixture');
  await page.reload();
  await expect(page.getByLabel('Search songs')).toHaveValue('fixture');
});

test('saved song reopens by URL and breadcrumb clears different-query results', async ({ page }) => {
  const id = await openSong(page);
  await page.getByRole('button', { name: 'Save to My Stuff', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved to My Stuff', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Song navigation' }).getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByRole('button', { name: 'Open Practice Band - Study Fixture', exact: true }).first().click();
  await expect(page.getByTestId('song-study-title')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('song-study-title')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('song')).toBe(id);
  await page.getByRole('button', { name: 'Song search', exact: true }).click();
  await page.getByLabel('Search songs').fill('missing');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No songs found');
  await page.goBack();
  await expect(page.getByTestId('song-study-title')).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('Search songs')).toHaveValue('missing');
  await expect(page.getByTestId('song-study-result')).toHaveCount(0);
});

test('missing song recovers to search and late owned fetch cannot reopen after leaving', async ({ page }) => {
  await page.goto('/v2?song=missing-owned-song&songQuery=fixture');
  await expect(page.getByRole('alert')).toContainText('no longer available');
  await page.getByRole('button', { name: 'Song search', exact: true }).click();
  await expect(page.getByLabel('Search songs')).toHaveValue('fixture');
  const id = await openSong(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/v2/song-studies/${id}`, async route => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Opening your song');
  await page.getByRole('navigation', { name: 'Song navigation' }).getByRole('button', { name: 'Explore', exact: true }).click();
  const delivered = page.waitForResponse(response => response.url().includes('/api/v2/song-studies'));
  release();
  await delivered;
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  await expect(page.getByTestId('song-study-title')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('song')).toBe(false);
});

test('search creates no session until track selection and late import cannot navigate back', async ({ page }) => {
  await page.goto('/v2');
  const before = await (await page.request.get('/api/v2/sessions')).json();
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await expect(page.getByLabel('Search songs')).toBeVisible();
  expect(await (await page.request.get('/api/v2/sessions')).json()).toEqual(before);
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v2/song-studies', async route => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Loading...', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Song navigation' }).getByRole('button', { name: 'Explore', exact: true }).click();
  const delivered = page.waitForResponse(response => response.url().includes('/api/v2/song-studies'));
  release();
  await delivered;
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  await expect(page.getByTestId('song-study-title')).toHaveCount(0);
});


test('malformed song links cannot change the requested API path', async ({ page }) => {
  const songRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/v2/')) songRequests.push(new URL(request.url()).pathname); });
  await page.goto('/v2?song=..%2Flibrary');
  await expect(page.getByRole('alert')).toContainText('song link is invalid');
  expect(songRequests.every(path => path === '/api/v2/sessions')).toBe(true);
  await page.getByRole('button', { name: 'Song search', exact: true }).click();
  await expect(page.getByLabel('Search songs')).toBeVisible();
});
