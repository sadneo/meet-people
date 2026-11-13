import { expect, test, type Page } from '@playwright/test';
import { conversationId, wiringFixture } from './wiring-fixture';

// Approximate Android's 200% text setting without scaling the viewport or icons.
async function enlargeText(page: Page) {
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(element => !element.closest('svg'));
    const sizes = elements.map(element => {
      const style = getComputedStyle(element);
      return { font: parseFloat(style.fontSize) * 2, line: parseFloat(style.lineHeight) * 2 };
    });
    elements.forEach((element, index) => {
      element.style.fontSize = `${sizes[index].font}px`;
      if (Number.isFinite(sizes[index].line)) element.style.lineHeight = `${sizes[index].line}px`;
    });
  });
}

async function expectAccessibleTabs(page: Page, enlarged: boolean) {
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  const links = navigation.locator(':scope > a:not(:first-child)');
  await expect(links).toHaveCount(5);
  const tabs = await links.evaluateAll(elements => elements.map(element => {
    const label = element.querySelector('span:not(.activity-dot)')!;
    const range = document.createRange();
    range.selectNodeContents(label);
    return {
      name: label.textContent,
      target: element.getBoundingClientRect().toJSON(),
      glyphs: [...range.getClientRects()].map(rect => rect.toJSON()),
      font: parseFloat(getComputedStyle(label).fontSize),
      overflow: getComputedStyle(label).overflow,
      textOverflow: getComputedStyle(label).textOverflow,
    };
  }));
  expect(tabs.map(tab => tab.name)).toEqual(['Garden', 'Events', 'Discover', 'Messages', 'Profile']);
  for (const [index, tab] of tabs.entries()) {
    expect(tab.target.width).toBeGreaterThanOrEqual(44);
    expect(tab.target.height).toBeGreaterThanOrEqual(44);
    expect(tab.font).toBe(enlarged ? 20 : 10);
    expect(tab.overflow).toBe('visible');
    expect(tab.textOverflow).not.toBe('ellipsis');
    expect(tab.glyphs.length).toBeGreaterThan(0);
    for (const glyph of tab.glyphs) {
      expect(glyph.left, `${tab.name} text left`).toBeGreaterThanOrEqual(tab.target.left);
      expect(glyph.right, `${tab.name} text right`).toBeLessThanOrEqual(tab.target.right);
      expect(glyph.top, `${tab.name} text top`).toBeGreaterThanOrEqual(tab.target.top);
      expect(glyph.bottom, `${tab.name} text bottom`).toBeLessThanOrEqual(tab.target.bottom);
    }
    if (index) expect(tabs[index - 1].target.right).toBeLessThanOrEqual(tab.target.left);
  }
  const bar = await navigation.boundingBox();
  expect(bar!.height).toBe(76);
  expect(bar!.y + bar!.height).toBe(page.viewportSize()!.height);
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(navigation.locator('[aria-current="page"]')).toHaveText('Messages');
}

for (const width of [320, 390]) {
  for (const enlarged of [false, true]) {
    test(`bottom navigation at ${width}px and ${enlarged ? 200 : 100}% text`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await wiringFixture(page);
      await page.goto(`/messages/chat?conversation=${conversationId}`);
      const composer = page.getByRole('textbox', { name: 'Message', exact: true });
      await expect(composer).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (enlarged) await enlargeText(page);
      await expectAccessibleTabs(page, enlarged);
      await page.screenshot({ path: testInfo.outputPath('navigation.png') });

      // A reduced visual viewport approximates the keyboard/short-screen layout.
      await page.setViewportSize({ width, height: 380 });
      await composer.focus();
      await expectAccessibleTabs(page, enlarged);
      await composer.scrollIntoViewIfNeeded();
      const input = await composer.boundingBox();
      const bar = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
      expect(input!.y).toBeGreaterThanOrEqual(0);
      expect(input!.y + input!.height).toBeLessThanOrEqual(bar!.y);
      await page.screenshot({ path: testInfo.outputPath('short-navigation.png') });
    });
  }
}
