const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const layout = require('./fixtures/landing-layout.json');

const pageUrl = pathToFileURL(resolve(__dirname, '..', 'index.html')).href;
const coverName = 'Agentic Development in Practice book cover';
const coverTextIds = ['cover-eyebrow', 'cover-line-one', 'cover-line-two', 'cover-line-three', 'cover-edition'];

async function verifyCoverContrast(page) {
  const colors = await page.locator('#book-cover').evaluate((cover, expectedIds) => {
    const texts = [...cover.querySelectorAll('text')];
    if (JSON.stringify(texts.map((text) => text.id)) !== JSON.stringify(expectedIds)) {
      throw new Error('Cover text changed; contrast evidence needs review');
    }
    const supportedTags = ['title', 'desc', 'g', 'text', 'rect', 'circle', 'path'];
    for (const element of cover.querySelectorAll('*')) {
      if (!supportedTags.includes(element.localName)) {
        throw new Error(`Unsupported cover element: ${element.localName}`);
      }
    }
    const background = getComputedStyle(cover).backgroundColor;
    const shapes = [...cover.querySelectorAll('rect, circle, path, text')];
    return texts.map((text) => {
      for (let element = text; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.opacity !== '1' || style.filter !== 'none' || style.backdropFilter !== 'none'
          || style.mixBlendMode !== 'normal' || style.maskImage !== 'none'
          || style.clipPath !== 'none' || style.textShadow !== 'none'
          || style.backgroundImage !== 'none') {
          throw new Error(`Unsupported contrast effect on ${text.id}`);
        }
        if (element !== cover && cover.contains(element)
          && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          throw new Error(`Unsupported text background on ${text.id}`);
        }
      }
      const style = getComputedStyle(text);
      if (style.fillOpacity !== '1' || style.stroke !== 'none') {
        throw new Error(`Unsupported text paint on ${text.id}`);
      }
      const bounds = text.getBoundingClientRect();
      const coverBounds = cover.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0 || style.visibility !== 'visible'
        || bounds.left < coverBounds.left || bounds.right > coverBounds.right
        || bounds.top < coverBounds.top || bounds.bottom > coverBounds.bottom) {
        throw new Error(`Cover text not fully rendered: ${text.id}`);
      }
      for (const shape of shapes.filter((element) => element !== text)) {
        const shapeStyle = getComputedStyle(shape);
        const box = shape.getBoundingClientRect();
        const matrix = shape.getScreenCTM();
        const stroke = shapeStyle.stroke === 'none' ? 0 : parseFloat(shapeStyle.strokeWidth) / 2;
        const paddingX = stroke * Math.hypot(matrix.a, matrix.c);
        const paddingY = stroke * Math.hypot(matrix.b, matrix.d);
        if (bounds.left < box.right + paddingX && bounds.right > box.left - paddingX
          && bounds.top < box.bottom + paddingY && bounds.bottom > box.top - paddingY) {
          throw new Error(`Overlapping cover artwork on ${text.id}`);
        }
      }
      return { id: text.id, foreground: style.fill, background };
    });
  }, coverTextIds);

  const luminance = (color) => {
    const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color);
    if (!match) throw new Error(`Contrast requires an opaque solid color: ${color}`);
    const linear = match.slice(1).map((channel) => {
      const value = Number(channel) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const evidence = new Map();
  for (const { id, foreground, background } of colors) {
    const lightness = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
    const ratio = (lightness[1] + 0.05) / (lightness[0] + 0.05);
    if (ratio < 4.5) throw new Error(`Cover contrast below 4.5:1 on ${id}: ${ratio.toFixed(2)}:1`);
    evidence.set(id, ratio);
  }
  return evidence;
}

for (const viewport of layout.viewports) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeEach(async ({ page }) => {
      await page.goto(pageUrl);
      await page.evaluate(() => document.fonts.ready);
    });

    test('renders book content and a functional details CTA', async ({ page }) => {
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agentic Development in Practice');
      await expect(page.locator('#book-subtitle')).toHaveText('From individual prompts to governed delivery loops');
      await expect(page.locator('#book-author')).toHaveText('Author to be announced');
      await expect(page.locator('#book-blurb')).toContainText('Move beyond the one-off prompt.');
      for (const id of ['book-title', 'book-subtitle', 'book-author', 'book-blurb']) {
        await expect(page.locator(`#${id}`)).toBeVisible();
      }
      await expect(page.getByRole('img', { name: coverName, exact: true })).toBeVisible();
      await expect(page.getByText('Book launch / Demonstration', { exact: true })).toBeVisible();
      const cta = page.getByRole('link', { name: 'Explore the book', exact: true });
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', '#book-details');
      await cta.click();
      await expect(page).toHaveURL(`${pageUrl}#book-details`);
      await expect(page.getByRole('heading', { name: 'Build the loop. Keep the judgment.' })).toBeInViewport();
    });

    test('has no horizontal overflow and matches the frozen layout', async ({ page }) => {
      const actual = await page.evaluate((ids) => {
        const bounds = (element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        return {
          viewportWidth: window.innerWidth,
          scrollWidths: [document.documentElement.scrollWidth, document.body.scrollWidth],
          order: [...document.querySelectorAll('[id]')].map((element) => element.id).filter((id) => ids.includes(id)),
          elements: Object.fromEntries(ids.map((id) => [id, bounds(document.getElementById(id))])),
          intro: bounds(document.getElementById('book-intro')),
          main: bounds(document.querySelector('main')),
        };
      }, layout.semanticOrder);

      expect(actual.order).toEqual(layout.semanticOrder);
      for (const width of actual.scrollWidths) {
        expect(width).toBeLessThanOrEqual(actual.viewportWidth);
      }
      for (const box of Object.values(actual.elements)) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + layout.pixelTolerance);
      }
      const within = (value, range) => {
        expect(value).toBeGreaterThanOrEqual(range.min - layout.pixelTolerance);
        expect(value).toBeLessThanOrEqual(range.max + layout.pixelTolerance);
      };
      const cover = actual.elements['book-cover'];
      const details = actual.elements['book-details'];
      within(cover.width, viewport.coverWidth);
      within(actual.main.x, viewport.outerMargin);
      within(viewport.width - actual.main.x - actual.main.width, viewport.outerMargin);

      if (viewport.arrangement === 'stacked') {
        within(cover.y - actual.intro.y - actual.intro.height, viewport.columnGap);
        expect(Math.abs(cover.x + cover.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(layout.pixelTolerance);
      } else {
        within(cover.x - actual.intro.x - actual.intro.width, viewport.columnGap);
        const introCenter = actual.intro.y + actual.intro.height / 2;
        expect(Math.abs(cover.y + cover.height / 2 - introCenter)).toBeLessThanOrEqual(layout.pixelTolerance);
      }
      expect(details.y).toBeGreaterThan(cover.y + cover.height);
      expect(details.y).toBeGreaterThan(actual.intro.y + actual.intro.height);
      const orderedCopy = layout.semanticOrder.slice(0, 5).map((id) => actual.elements[id]);
      for (let index = 1; index < orderedCopy.length; index += 1) {
        expect(orderedCopy[index].y).toBeGreaterThanOrEqual(orderedCopy[index - 1].y + orderedCopy[index - 1].height);
      }
    });

    test('passes accessibility checks including contrast', async ({ page }) => {
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
      await expect(page.getByRole('img', { name: coverName, exact: true })).toHaveCount(1);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
      const coverContrast = await verifyCoverContrast(page);
      // Axe cannot infer SVG image backgrounds; only these measured nodes are covered.
      for (const result of results.incomplete.filter((result) => result.id === 'color-contrast')) {
        for (const node of result.nodes) {
          expect(node.target).toHaveLength(1);
          expect(typeof node.target[0]).toBe('string');
          const target = page.locator(node.target[0]);
          await expect(target).toHaveCount(1);
          const id = await target.evaluate((element) =>
            element.matches('#book-cover text') ? element.id : null);
          expect(coverContrast.has(id)).toBe(true);
          expect(node.all).toEqual([]);
          expect(node.none).toEqual([]);
          expect(node.any.length).toBeGreaterThan(0);
          for (const check of node.any) {
            expect(check.id).toBe('color-contrast');
            expect(check.data.messageKey).toBe('imgNode');
          }
        }
      }
      const contrastPass = results.passes.find((result) => result.id === 'color-contrast');
      expect(contrastPass).toBeDefined();
      let nonCoverPass = false;
      for (const node of contrastPass.nodes) {
        if (node.target.length === 1 && typeof node.target[0] === 'string') {
          const target = page.locator(node.target[0]);
          if (await target.count() === 1 && await target.evaluate((element) => !element.closest('svg'))) {
            nonCoverPass = true;
          }
        }
      }
      expect(nonCoverPass).toBe(true);
    });

    test('rejects low-contrast cover text rather than waiving it', async ({ page }) => {
      await verifyCoverContrast(page);
      await page.locator('#cover-eyebrow').evaluate((element) => {
        element.style.fill = getComputedStyle(element.closest('svg')).backgroundColor;
      });
      await expect(verifyCoverContrast(page)).rejects.toThrow('Cover contrast below 4.5:1 on cover-eyebrow');
    });

    test('rejects unsupported cover compositing effects', async ({ page }) => {
      await page.locator('#book-cover').evaluate((element) => {
        element.style.opacity = '0.5';
      });
      await expect(verifyCoverContrast(page)).rejects.toThrow('Unsupported contrast effect');
    });

    test('supports keyboard navigation with a visible focus indicator', async ({ page }) => {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
      await page.keyboard.press('Tab');
      const cta = page.getByRole('link', { name: 'Explore the book', exact: true });
      await expect(cta).toBeFocused();
      const focus = await cta.evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
      });
      expect(focus.width).toBeGreaterThanOrEqual(2);
      expect(focus.style).not.toBe('none');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('region', { name: 'Build the loop. Keep the judgment.' })).toBeFocused();
    });

    test('loads without remote runtime dependencies or page errors', async ({ page }) => {
      const remoteRequests = [];
      const errors = [];
      await page.route(/^https?:/, async (route) => {
        remoteRequests.push(route.request().url());
        await route.abort();
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(remoteRequests).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
