import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`session type and new-session choices stay clear at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: '+ New session', exact: true }).click();
    const chooser = page.getByRole('dialog', { name: 'Choose a session type' });
    await expect(chooser).toContainText('Explore scales, chords and voicings.');
    await chooser.getByRole('button', { name: /^Harmony/ }).click();
    await expect(page.getByRole('heading', { name: 'Harmony', exact: true, level: 1 })).toBeVisible();
    const firstSession = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '');
    await page.getByRole('button', { name: '+ New session', exact: true }).click();
    await chooser.getByRole('button', { name: /^Chord progression/ }).click();
    await expect(page.getByRole('heading', { name: 'Chord progression', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Chords in this progression' })).toBeVisible();
    await expect(page.getByTestId('v2-active-session')).not.toHaveText(`Session ${firstSession}`);
    await page.getByRole('button', { name: '+ New session', exact: true }).click();
    await expect(chooser).toBeVisible();
    const bounds = (await chooser.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/session-chooser-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(chooser).toBeHidden();
    await page.reload();
    await page.locator(`[data-session-id="${firstSession}"]`).click();
    await expect(page.getByRole('heading', { name: 'Harmony', exact: true, level: 1 })).toBeVisible();
  });
}
