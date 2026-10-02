import assert from 'node:assert/strict';
import { chromium } from '../node_modules/@playwright/test/index.mjs';

const prototypeUrl = process.env.PROTOTYPE_URL ?? 'http://localhost:5192/v2?variant=A';
const bottomReserve = 78;
const step = 16;
const largeStep = 48;

function closeEnough(actual, expected, message, tolerance = 2) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} +/- ${tolerance}, received ${actual}`,
  );
}

async function box(locator, name) {
  const value = await locator.boundingBox();
  assert.ok(value, `${name} must have a bounding box`);
  return value;
}

async function openSongFixture(page) {
  await page.goto(prototypeUrl);
  await page.getByRole('heading', { name: 'Explore', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Study a song', exact: true }).click();
  await page.getByLabel('Search songs').fill('fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Drop D guitar', exact: true }).click();
  await page.locator('.support-proto-floating').waitFor();
}

async function assertViewportBounds(page, floating, { horizontalGutter = 0 } = {}) {
  const viewport = page.viewportSize();
  assert.ok(viewport, 'page must have a fixed viewport');
  const bounds = await box(floating, 'floating recording');

  assert.ok(bounds.x >= horizontalGutter - 1, `recording starts inside viewport: x=${bounds.x}`);
  assert.ok(bounds.y >= -1, `recording starts inside viewport: y=${bounds.y}`);
  assert.ok(
    bounds.x + bounds.width <= viewport.width - horizontalGutter + 1,
    `recording ends inside viewport: right=${bounds.x + bounds.width}`,
  );
  assert.ok(
    bounds.y + bounds.height <= viewport.height - bottomReserve + 1,
    `recording leaves ${bottomReserve}px for the prototype switcher: bottom=${bounds.y + bounds.height}`,
  );

  return bounds;
}

async function waitForViewportClamp(page, horizontalGutter = 0) {
  const viewport = page.viewportSize();
  assert.ok(viewport, 'page must have a fixed viewport');
  await page.waitForFunction(
    ({ right, bottom }) => {
      const floating = document.querySelector('.support-proto-floating');
      if (!floating) return false;
      const bounds = floating.getBoundingClientRect();
      return bounds.right <= right + 1 && bounds.bottom <= bottom + 1;
    },
    { right: viewport.width - horizontalGutter, bottom: viewport.height - bottomReserve },
  );
}

async function assertPlayerUsable(page) {
  await page.getByRole('button', { name: 'Move recording', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Resize recording', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Pause preview video', exact: true }).waitFor();

  const video = await box(page.locator('.support-proto-video'), 'preview video');
  assert.ok(video.height >= 199, `preview video keeps a 200px minimum height: ${video.height}`);
}

async function checkDesktop(browser) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await openSongFixture(page);

  const floating = page.locator('.support-proto-floating');
  const move = page.getByRole('button', { name: 'Move recording', exact: true });
  const resize = page.getByRole('button', { name: 'Resize recording', exact: true });

  await page.getByRole('button', { name: 'Play preview video', exact: true }).click();
  await assertPlayerUsable(page);

  // Put the player at its canonical placement before testing pointer deltas.
  await move.focus();
  await page.keyboard.press('Home');
  const initial = await box(floating, 'initial floating recording');
  const moveBox = await box(move, 'move handle');
  await page.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBox.x + moveBox.width / 2 - 160, moveBox.y + moveBox.height / 2 - 160, {
    steps: 6,
  });
  await page.mouse.up();

  const dragged = await box(floating, 'mouse-dragged recording');
  assert.ok(dragged.x < initial.x - 130, `mouse drag changes x: ${initial.x} -> ${dragged.x}`);
  assert.ok(dragged.y < initial.y - 130, `mouse drag changes y: ${initial.y} -> ${dragged.y}`);
  closeEnough(dragged.width, initial.width, 'moving keeps width');
  closeEnough(dragged.height, initial.height, 'moving keeps height');
  await assertPlayerUsable(page);

  const resizeBox = await box(resize, 'resize handle');
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    resizeBox.x + resizeBox.width / 2 + 80,
    resizeBox.y + resizeBox.height / 2 + 48,
    { steps: 6 },
  );
  await page.mouse.up();

  const pointerResized = await box(floating, 'mouse-resized recording');
  assert.ok(pointerResized.width > dragged.width + 50, 'corner resize changes width');
  assert.ok(pointerResized.height > dragged.height + 25, 'corner resize changes height');
  await assertPlayerUsable(page);
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await page.screenshot({ path: '/tmp/support-player-moved-resized.png' });

  // Resize dimensions independently with the keyboard.
  await resize.focus();
  const beforeWidthKey = await box(floating, 'recording before width key');
  await page.keyboard.press('ArrowRight');
  const afterWidthKey = await box(floating, 'recording after width key');
  closeEnough(afterWidthKey.width, beforeWidthKey.width + step, 'ArrowRight grows width by 16px');
  closeEnough(afterWidthKey.height, beforeWidthKey.height, 'width key does not change height');

  await page.keyboard.press('Shift+ArrowDown');
  const afterHeightKey = await box(floating, 'recording after height key');
  closeEnough(afterHeightKey.height, afterWidthKey.height + largeStep, 'Shift+ArrowDown grows height by 48px');
  closeEnough(afterHeightKey.width, afterWidthKey.width, 'height key does not change width');

  // Movement uses the same steps, while Home restores the canonical placement.
  await move.focus();
  await page.keyboard.press('Home');
  const home = await box(floating, 'Home-positioned recording');
  await page.keyboard.press('ArrowLeft');
  const movedOneStep = await box(floating, 'keyboard-moved recording');
  closeEnough(movedOneStep.x, home.x - step, 'ArrowLeft moves by 16px');
  closeEnough(movedOneStep.y, home.y, 'horizontal move keeps y');
  await page.keyboard.press('Shift+ArrowUp');
  const movedLargeStep = await box(floating, 'shift-keyboard-moved recording');
  closeEnough(movedLargeStep.y, movedOneStep.y - largeStep, 'Shift+ArrowUp moves by 48px');
  closeEnough(movedLargeStep.x, movedOneStep.x, 'vertical move keeps x');
  await page.keyboard.press('Home');
  const reset = await box(floating, 'reset recording');
  closeEnough(reset.x, home.x, 'Home resets x');
  closeEnough(reset.y, home.y, 'Home resets y');
  await assertPlayerUsable(page);

  // Keep a non-default placement active so viewport shrinking exercises saved bounds.
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowUp');

  // A narrow viewport clamps the saved size and placement while preserving the player.
  const closeTutor = page.getByRole('button', { name: 'Close Tutor preview', exact: true });
  if (await closeTutor.isVisible().catch(() => false)) await closeTutor.click();
  await page.setViewportSize({ width: 360, height: 760 });
  await waitForViewportClamp(page, 12);
  const clamped = await assertViewportBounds(page, floating, { horizontalGutter: 12 });
  const expectedMinimumWidth = Math.min(296, 360 - 24);
  assert.ok(
    clamped.width >= expectedMinimumWidth - 1,
    `recording respects responsive minimum width ${expectedMinimumWidth}: ${clamped.width}`,
  );
  assert.ok(clamped.width <= 360 - 24 + 1, `recording fits between 12px gutters: ${clamped.width}`);
  await assertPlayerUsable(page);
  await page.screenshot({ path: '/tmp/support-player-phone.png' });

  await page.setViewportSize({ width: 844, height: 390 });
  await waitForViewportClamp(page, 12);
  await assertViewportBounds(page, floating, { horizontalGutter: 12 });
  await assertPlayerUsable(page);
  await page.getByRole('button', { name: 'Pause preview video', exact: true }).click();
  await page.getByRole('button', { name: 'Play preview video', exact: true }).click();
  await page.getByRole('button', { name: 'Pause preview video', exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/support-player-landscape.png' });

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('\n')}`);
  await page.close();
}

async function checkTouchDrag(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await openSongFixture(page);
  const closeTutor = page.getByRole('button', { name: 'Close Tutor preview', exact: true });
  if (await closeTutor.isVisible().catch(() => false)) await closeTutor.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForViewportClamp(page, 12);

  const floating = page.locator('.support-proto-floating');
  const move = page.getByRole('button', { name: 'Move recording', exact: true });
  await page.getByRole('button', { name: 'Play preview video', exact: true }).click();
  const before = await box(floating, 'touch recording before drag');
  const handle = await box(move, 'touch move handle');
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const end = { x: start.x - 40, y: start.y - 48 };

  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...start, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...end, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  const after = await box(floating, 'touch recording after drag');
  assert.ok(after.y < before.y - 20, `touch drag changes y: ${before.y} -> ${after.y}`);
  await assertViewportBounds(page, floating, { horizontalGutter: 12 });
  await assertPlayerUsable(page);

  await context.close();
}

const browser = await chromium.launch();
try {
  await checkDesktop(browser);
  await checkTouchDrag(browser);
  console.log('Support player movement, resizing, clamping, controls, and playback checks passed.');
} finally {
  await browser.close();
}
