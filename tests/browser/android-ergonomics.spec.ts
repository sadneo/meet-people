import { expect, test, type Locator } from '@playwright/test';
import { conversationId, wiringFixture } from './wiring-fixture';

async function touchTarget(control: Locator) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect.soft(box?.width, `${await control.getAttribute('aria-label') || await control.textContent()} width`).toBeGreaterThanOrEqual(44);
  expect.soft(box?.height, `${await control.getAttribute('aria-label') || await control.textContent()} height`).toBeGreaterThanOrEqual(44);
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, reducedMotion: 'reduce' });

    test('MOBILE-01 candidate identity clears fixed decisions without scrolling', async ({ page }, testInfo) => {
      await wiringFixture(page);
      await page.goto('/matchmaking');
      await page.waitForLoadState('networkidle');
      const identity = page.getByRole('heading', { name: 'Taylor, 23', exact: true });
      await expect(identity).toBeVisible();
      const name = await identity.boundingBox();
      const actions = await page.locator('.discovery-card-slot:not([hidden]) .dating-actions').boundingBox();
      await page.screenshot({ path: testInfo.outputPath('discover.png') });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(name).not.toBeNull();
      expect(actions).not.toBeNull();
      expect(name!.y + name!.height).toBeLessThanOrEqual(actions!.y);
      expect(await identity.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
      await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    });

    test('MOBILE-02 discovery and preference targets are at least 44px', async ({ page }, testInfo) => {
      await wiringFixture(page);
      await page.goto('/matchmaking');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: 'Taylor, 23', exact: true })).toBeVisible();
      for (const control of [
        page.getByRole('button', { name: 'Friends preferences', exact: true }),
        page.getByRole('link', { name: 'Matches and activity', exact: true }),
        page.getByRole('button', { name: 'Friends', exact: true }),
        page.getByRole('button', { name: 'Dating', exact: true }),
        page.locator('.discovery-card-slot:not([hidden]) .photo-more'),
      ]) await touchTarget(control);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: testInfo.outputPath('discovery-targets.png') });
      await page.getByRole('button', { name: 'Friends preferences', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('link', { name: 'Edit profile', exact: true })).toBeVisible();
      for (const name of ['Edit profile', 'Edit']) {
        const link = dialog.getByRole('link', { name, exact: true });
        await link.scrollIntoViewIfNeeded();
        await touchTarget(link);
      }
      await page.screenshot({ path: testInfo.outputPath('preferences-targets.png') });
    });

    test('MOBILE-02 conversation back and menu targets are at least 44px', async ({ page }, testInfo) => {
      await wiringFixture(page);
      await page.goto(`/messages/chat?conversation=${conversationId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('button', { name: 'View conversation members', exact: true })).toBeVisible();
      await touchTarget(page.getByRole('link', { name: 'Back to conversations', exact: true }));
      const options = page.getByLabel('Conversation options and safety', { exact: true });
      await touchTarget(options);
      await options.click();
      for (const name of ['View people', 'Refresh messages', 'Remove connection']) {
        await touchTarget(page.getByRole('button', { name, exact: true }));
      }
      await page.screenshot({ path: testInfo.outputPath('chat-targets.png') });
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    });
  });
}
