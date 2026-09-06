import { expect, test } from '@playwright/test'

for (const width of [320, 1280]) {
  for (const pattern of ['hero-with-support', 'comparison', 'master-detail', 'explanation-led', 'nested']) {
    test(`${pattern} has focal dominance at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`/e2e/presentation.html?pattern=${pattern}`)
      const root = page.getByTestId('composition').first()
      const focal = root.locator(':scope > [data-focal="true"]')
      await expect(focal).toBeVisible()
      const bounds = await focal.boundingBox()
      for (const support of await root.locator(':scope > [data-focal="false"]').all()) {
        const other = await support.boundingBox()
        expect(bounds!.width * bounds!.height).toBeGreaterThan(other!.width * other!.height * 1.4)
        expect(bounds!.y).toBeLessThanOrEqual(other!.y)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      if (pattern === 'nested') await expect(page.getByTestId('composition')).toHaveCount(2)
      if (pattern === 'hero-with-support') await page.screenshot({ path: `test-results/presentation-${width}.png`, fullPage: true })
    })
  }
}

test('view nudges belong to this viewer and reset on the next live turn', async ({ page }) => {
  await page.goto('/e2e/presentation.html')
  await page.getByLabel('First fret').fill('5')
  await page.getByLabel('Note labels').selectOption('degrees')
  await expect(page.getByTestId('view-config')).toHaveText('Frets 5–12 · degrees')
  await page.getByRole('button', { name: 'Musical edit' }).click()
  await expect(page.getByTestId('view-config')).toHaveText('Frets 5–12 · degrees')
  await page.getByRole('button', { name: 'Next turn' }).click()
  await expect(page.getByTestId('view-config')).toHaveText('Frets 0–12 · notes')
  await page.getByLabel('First fret').fill('7')
  await page.reload()
  await expect(page.getByTestId('view-config')).toHaveText('Frets 0–12 · notes')
})

test('the hierarchy measurement rejects an equal-card layout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/e2e/presentation.html')
  await page.addStyleTag({ content: '.composition { grid-template-columns: 1fr 1fr !important; } .composition-slot { box-sizing: border-box; height: 300px !important; min-height: 300px !important; max-height: 300px !important; }' })
  const focal = await page.locator('[data-focal="true"]').boundingBox()
  const support = await page.locator('[data-focal="false"]').boundingBox()
  expect(focal!.width * focal!.height > support!.width * support!.height * 1.4).toBe(false)
})
