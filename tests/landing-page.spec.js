const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fixture = require('./fixtures/landing-layout.json');

const pageUrl = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const title = 'Agentic Development in Practice';
const subtitle = 'From individual prompts to reliable delivery loops';
const author = 'Author name (placeholder)';

async function assertLayout(page, width) {
  const expected = fixture.viewports[width];
  const actual = await page.evaluate(({ heroOrder, copyOrder }) => {
    const hero = document.querySelector('.hero');
    const copy = document.querySelector('.book-copy');
    const cover = document.querySelector('.book-cover');
    const heading = document.querySelector('h1');
    const cta = document.querySelector('.cta');
    const rect = (element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      landmarks: [...document.body.children].map((element) => element.tagName),
      heroOrder: [...hero.children].map((element) =>
        heroOrder.find((selector) => element.matches(selector)) ?? element.tagName),
      copyOrder: [...copy.children].map((element) =>
        copyOrder.find((selector) => element.matches(selector)) ?? element.tagName),
      hero: rect(hero),
      copy: rect(copy),
      cover: rect(cover),
      details: rect(document.querySelector('#about-the-book')),
      heroGap: parseFloat(getComputedStyle(hero).gap),
      heroPadding: parseFloat(getComputedStyle(hero).paddingTop),
      headingFontSize: parseFloat(getComputedStyle(heading).fontSize),
      colors: {
        pageBackground: getComputedStyle(document.documentElement).backgroundColor,
        pageText: getComputedStyle(document.documentElement).color,
        ctaBackground: getComputedStyle(cta).backgroundColor,
        ctaText: getComputedStyle(cta).color,
        coverBackground: getComputedStyle(cover).backgroundColor
      }
    };
  }, fixture);

  expect(actual.landmarks).toEqual(fixture.landmarks);
  expect(actual.heroOrder).toEqual(fixture.heroOrder);
  expect(actual.copyOrder).toEqual(fixture.copyOrder);
  expect(actual.colors).toEqual(fixture.colors);
  expect(actual.hero.width).toBeCloseTo(expected.shellWidth, 0);
  expect(actual.hero.x).toBeCloseTo(expected.shellX, 0);
  expect(actual.cover.width).toBeCloseTo(expected.coverWidth, 0);
  expect(actual.heroGap).toBe(expected.heroGap);
  expect(actual.heroPadding).toBe(expected.heroPadding);
  expect(actual.headingFontSize).toBe(expected.headingFontSize);
  expect(actual.details.y).toBeGreaterThanOrEqual(actual.hero.y + actual.hero.height);
  if (expected.layout === 'stacked') {
    expect(actual.cover.y).toBeCloseTo(actual.copy.y + actual.copy.height + expected.heroGap, 0);
    expect(actual.copy.width).toBeCloseTo(expected.shellWidth, 0);
  } else {
    const columnWidth = (expected.shellWidth - expected.heroGap) * 1.15 / 2;
    expect(actual.copy.width).toBeCloseTo(columnWidth, 0);
    expect(actual.cover.x).toBeGreaterThanOrEqual(actual.copy.x + actual.copy.width + expected.heroGap);
    expect(Math.abs(
      actual.copy.y + actual.copy.height / 2 - actual.cover.y - actual.cover.height / 2
    )).toBeLessThan(0.5);
  }
}

for (const width of [375, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.goto(pageUrl);
    });

    test('renders book content and a keyboard-operable details CTA', async ({ page }) => {
      await expect(page).toHaveTitle(`${title} | Book launch demo`);
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      await expect(page.locator('.subtitle')).toHaveText(subtitle);
      await expect(page.locator('.subtitle')).toBeVisible();
      await expect(page.locator('.author')).toHaveText(author);
      await expect(page.locator('.author')).toBeVisible();
      await expect(page.locator('.blurb')).toContainText('verifiable feedback');
      await expect(page.locator('.blurb')).toBeVisible();
      const image = page.getByRole('img', { name: /Original cover illustration/ });
      await expect(image).toBeVisible();
      expect(await image.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(page.getByRole('contentinfo')).toContainText('publishing details are provisional');

      const cta = page.getByRole('link', { name: 'Explore the book', exact: true });
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', '#about-the-book');
      await page.keyboard.press('Tab');
      await expect(cta).toBeFocused();
      expect(await cta.evaluate((element) => {
        const style = getComputedStyle(element);
        return element.matches(':focus-visible') &&
          style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 3;
      })).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(`${pageUrl}#about-the-book`);
      await expect(page.locator('#about-the-book')).toBeInViewport();
    });

    test('fits the viewport and matches the frozen layout contract', async ({ page }) => {
      const overflow = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const selectors = [
          'header', '.hero', '.book-copy', '.book-copy > *', '.book-cover',
          '.book-cover img', 'figcaption', 'figcaption p', '.book-details',
          '.book-details > *', 'footer', 'footer p'
        ];
        return {
          viewport,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          outside: [...document.querySelectorAll(selectors.join(','))].filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < -0.5 || rect.right > viewport + 0.5 ||
              element.scrollWidth > element.clientWidth + 1;
          }).map((element) => element.outerHTML)
        };
      });
      expect(overflow.viewport).toBe(width);
      expect(overflow.documentWidth).toBeLessThanOrEqual(width);
      expect(overflow.bodyWidth).toBeLessThanOrEqual(width);
      expect(overflow.outside).toEqual([]);
      await assertLayout(page, width);
    });

    test('rejects layout drift without regenerating the fixture', async ({ page }) => {
      await assertLayout(page, width);
      await page.addStyleTag({ content: '.hero { gap: 4px; }' });
      await expect(assertLayout(page, width)).rejects.toThrow();
    });

    test('has semantic landmarks, image alternatives and passing WCAG AA checks', async ({ page }) => {
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
      await expect(page.getByRole('region', { name: title, exact: true })).toHaveCount(1);
      await expect(page.getByRole('region', { name: 'A practice, not just a prompt' })).toHaveCount(1);
      for (const image of await page.locator('img').all()) {
        await expect(image).toHaveAttribute('alt', /\S+/);
      }
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
      expect(results.incomplete.filter((result) => result.id === 'color-contrast')).toEqual([]);
      expect(results.passes.some((result) => result.id === 'color-contrast')).toBe(true);
    });

    test('works offline with no external assets or runtime scripts', async ({ page, context }) => {
      const externalRequests = [];
      page.on('request', (request) => {
        if (!request.url().startsWith('file:') && !request.url().startsWith('data:')) {
          externalRequests.push(request.url());
        }
      });
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      await expect(page.locator('script, link, iframe, form')).toHaveCount(0);
      expect(await page.locator('img').evaluateAll((images) =>
        images.every((image) => image.src.startsWith('data:') && image.complete && image.naturalWidth > 0)
      )).toBe(true);
      expect(externalRequests).toEqual([]);
    });
  });
}
