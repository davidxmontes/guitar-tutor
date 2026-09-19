import { expect, test } from '@playwright/test';

test('a tutor answer continues after closing its tab and reconnects without duplicate turns', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Learn the fretboard', exact: true }).click();
  const session = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '');
  await page.getByLabel('Ask the Tutor').fill('Take your time answering');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.locator('.tutor-thinking')).toContainText('You can leave and return');
  await page.close();
  const returned = await context.newPage();
  await returned.goto('/');
  await returned.locator(`[data-session-id="${session}"]`).click();
  await expect(returned.locator('.tutor-thinking')).toContainText('You can leave and return');
  await expect(returned.locator('.tutor-message--assistant')).toContainText('Choose a degree', { timeout: 15000 });
  await expect(returned.locator('.tutor-message--user')).toHaveCount(1);
  await expect(returned.getByLabel('Ask the Tutor')).toBeEmpty();
  await returned.getByLabel('Ask the Tutor').fill('Take your time answering');
  await returned.reload();
  await returned.locator(`[data-session-id="${session}"]`).click();
  await expect(returned.getByLabel('Ask the Tutor')).toHaveValue('Take your time answering');
  await expect(returned.locator('.tutor-message--assistant')).toHaveCount(1);
  await expect(returned.locator('.tutor-message--user')).toHaveCount(1);
});

test('a failed background answer restores the question after reopening', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Learn the fretboard', exact: true }).click();
  const session = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '');
  await page.getByLabel('Ask the Tutor').fill('Simulate a failed tutor');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not finish');
  await page.reload();
  await page.locator(`[data-session-id="${session}"]`).click();
  await expect(page.getByLabel('Ask the Tutor')).toHaveValue('Simulate a failed tutor');
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
});
