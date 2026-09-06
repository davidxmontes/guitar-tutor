import { expect, test } from '@playwright/test';

// T5 (#93): the key-family Block renders a key's diatonic chords; clicking a numeral
// inspects that derived chord {root, quality}; a bound circle and fretboard react
// pull-based; the chord can be materialized into a Chord Entity and re-bound.
// Host: the physical-resolution starter — a bare G-major Key + a circle, no progression.
test('key-family inspects diatonic chords across views and materializes them', async ({ page }) => {
  let turns = 0;
  page.on('request', r => { if (r.url().endsWith('/tutor/turns')) turns++; });
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Why does D resolve to G?' }).click();
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();

  const sid = (await page.getByTestId('v2-active-session').innerText()).replace('Session ', '');
  const bid = (await page.getByTestId('v2-active-branch').innerText()).replace('Branch ', '');
  const draft = () => page.request.get(`/api/v2/sessions/${sid}`).then(r => r.json())
    .then(s => s.branches.find((b: { id: string }) => b.id === bid).working_draft);
  const keyId = (await draft()).entities.find((e: { kind: string }) => e.kind === 'key').id;

  // --- Add a key-family view bound to the G-major key (also: key-family in Add view) ---
  await page.getByRole('button', { name: 'Add View', exact: true }).click();
  await page.getByLabel('Musical source').selectOption(keyId);
  await expect(page.getByLabel('View type')).toContainText('Key family');
  await page.getByLabel('View type').selectOption('key_family');
  await page.getByRole('button', { name: 'Add selected view', exact: true }).click();

  const keyFamily = page.getByRole('region', { name: 'Key family', exact: true });
  await expect(keyFamily.getByRole('button', { name: 'Inspect I G, major' })).toBeVisible();
  await expect(keyFamily.getByRole('button', { name: 'Inspect ii Am, minor' })).toBeVisible();
  await expect(keyFamily.getByRole('button', { name: 'Inspect iii Bm, minor' })).toBeVisible();
  await expect(keyFamily.getByRole('button', { name: 'Inspect IV C, major' })).toBeVisible();
  await expect(keyFamily.getByRole('button', { name: 'Inspect V D, major' })).toBeVisible();
  await expect(keyFamily.getByRole('button', { name: 'Inspect vi Em, minor' })).toBeVisible();
  await expect(keyFamily.getByRole('button', { name: 'Inspect vii° F#dim, diminished' })).toBeVisible();

  // --- Add a fretboard bound to the same key so a numeral can light its tones ---
  await page.getByRole('button', { name: 'Add View', exact: true }).click();
  await page.getByLabel('Musical source').selectOption(keyId);
  await page.getByLabel('View type').selectOption('fretboard');
  await page.getByRole('button', { name: 'Add selected view', exact: true }).click();

  // DOM order of fretboard regions: [0] the transition board, [1] the key board.
  const keyFret = page.getByRole('region', { name: 'Fretboard', exact: true }).nth(1);
  const circle = page.getByRole('region', { name: 'Circle', exact: true });

  // --- Click ii: it presses, and bound views react pull-based ---
  await keyFamily.getByRole('button', { name: 'Inspect ii Am, minor' }).click();
  await expect(keyFamily.getByRole('button', { name: 'Inspect ii Am, minor' })).toHaveAttribute('aria-pressed', 'true');
  await expect(keyFamily.getByRole('button', { name: 'Inspect I G, major' })).toHaveAttribute('aria-pressed', 'false');

  // Circle: the ii root (A) lights on the wheel; a non-chord position (B) does not.
  await expect(circle.getByLabel('Circle position A', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(circle.getByLabel('Circle position B', { exact: true })).toHaveAttribute('aria-pressed', 'false');

  // Fretboard: all of A / C / E light; F# (in key, not in the chord) does not.
  await expect(keyFret.getByRole('button', { name: /G major: A, .*string 5, fret 0/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(keyFret.getByRole('button', { name: /G major: C, .*string 5, fret 3/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(keyFret.getByRole('button', { name: /G major: E, .*string 6, fret 0/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(keyFret.getByRole('button', { name: /G major: F#, .*string 6, fret 2/ })).toHaveAttribute('aria-pressed', 'false');

  // --- Materialize the inspected ii into a Chord Entity ---
  await keyFamily.getByRole('button', { name: 'Materialize Am' }).click();
  await expect(page.getByText('Draft autosaved', { exact: true })).toBeVisible();
  await expect.poll(async () => (await draft()).entities.filter((e: { kind: string; root?: string }) => e.kind === 'chord' && e.root === 'A').length).toBe(1);
  const amId = (await draft()).entities.find((e: { kind: string; root?: string; quality?: string }) => e.kind === 'chord' && e.root === 'A' && e.quality === 'minor').id;

  // --- Bind the new Chord to a fretboard via Add view; it renders ---
  await page.getByRole('button', { name: 'Add View', exact: true }).click();
  await page.getByLabel('Musical source').selectOption(amId);
  await page.getByLabel('View type').selectOption('fretboard');
  await page.getByRole('button', { name: 'Add selected view', exact: true }).click();

  const amFret = page.getByRole('region', { name: 'Fretboard', exact: true }).last();
  await expect(amFret.getByRole('button', { name: /A minor: A, / }).first()).toBeVisible();
  await expect(amFret.getByRole('button', { name: /A minor: C, / }).first()).toBeVisible();
  await expect(amFret.getByRole('button', { name: /A minor: E, / }).first()).toBeVisible();

  expect(turns).toBe(0);
});
