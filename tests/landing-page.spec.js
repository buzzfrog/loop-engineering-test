const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const fixture = require('./fixtures/landing-page.json');

const pageUrl = pathToFileURL(resolve(__dirname, '..', 'index.html')).href;

async function openPage(page) {
  const externalRequests = [];
  page.on('request', request => {
    if (/^https?:/.test(request.url())) externalRequests.push(request.url());
  });
  await page.goto(pageUrl);
  return externalRequests;
}

test('approved content and embedded cover work offline without external assets', async ({ page }) => {
  const externalRequests = await openPage(page);
  await expect(page).toHaveTitle(fixture.pageTitle);
  for (const [selector, text] of Object.entries(fixture.content)) {
    await expect(page.locator(selector)).toHaveCount(1);
    await expect(page.locator(selector)).toHaveText(text);
    await expect(page.locator(selector)).toBeVisible();
  }

  const cover = page.getByRole('img', { name: fixture.coverAlt, exact: true });
  await expect(cover).toHaveCount(1);
  await expect(cover).toBeVisible();
  await expect(cover).toHaveAttribute('src', /^data:image\/svg\+xml,/);
  await expect.poll(() => cover.evaluate(image =>
    image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  )).toBe(true);
  await expect(page.locator('script, link[rel="stylesheet"], iframe, form')).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test('semantic landmarks and visible keyboard focus lead to the intended CTA destination', async ({ page }) => {
  await openPage(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  for (const role of ['banner', 'main', 'contentinfo']) {
    await expect(page.getByRole(role)).toHaveCount(1);
    await expect(page.getByRole(role)).toBeVisible();
  }

  const cta = page.getByRole('link', { name: fixture.content['.cta'], exact: true });
  await expect(cta).toHaveAttribute('href', fixture.ctaTarget);
  await page.keyboard.press('Tab');
  await expect(cta).toBeFocused();
  const focusStyle = await cta.evaluate(element => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor };
  });
  expect(focusStyle.style).not.toBe('none');
  expect(focusStyle.width).toBeGreaterThanOrEqual(2);
  expect(focusStyle.color).not.toBe('rgba(0, 0, 0, 0)');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${pageUrl}${fixture.ctaTarget}`);
  await expect(page.locator(fixture.ctaTarget)).toBeFocused();
  await expect(page.locator(fixture.ctaTarget)).toBeInViewport();
});

test('frozen reading order and responsive layout remain contained without clipping', async ({ page }) => {
  await openPage(page);
  const width = page.viewportSize().width;
  const layout = fixture.layout[width];
  expect(layout, `No frozen layout contract for ${width}px`).toBeDefined();
  const actualOrder = await page.locator(fixture.readingOrder.join(', ')).evaluateAll(
    (elements, selectors) => elements.map(element => selectors.find(selector => element.matches(selector))),
    fixture.readingOrder
  );
  expect(actualOrder).toEqual(fixture.readingOrder);

  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.documentClientWidth);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.bodyClientWidth);
  for (const selector of ['header', 'main', 'footer', 'figure', 'img', ...fixture.readingOrder.slice(1)]) {
    const element = page.locator(selector);
    await expect(element).toBeVisible();
    const box = await element.boundingBox();
    expect(box.width, selector).toBeGreaterThan(0);
    expect(box.height, selector).toBeGreaterThan(0);
    expect(box.x, selector).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, selector).toBeLessThanOrEqual(width);
    const unclipped = await element.evaluate(node => {
      for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (ancestor.scrollWidth > ancestor.clientWidth + 1) return false;
        // Glyphs may extend past a tight line box without being clipped.
        if (style.overflowY !== 'visible' && ancestor.scrollHeight > ancestor.clientHeight + 1) return false;
      }
      return true;
    });
    expect(unclipped, `${selector} must not clip its content`).toBe(true);
  }

  const main = await page.getByRole('main').boundingBox();
  expect(main.x).toBeGreaterThanOrEqual(fixture.minimumPageInset);
  expect(width - main.x - main.width).toBeGreaterThanOrEqual(fixture.minimumPageInset);
  expect(main.width).toBeLessThanOrEqual(fixture.maximumContentWidth);
  const cover = await page.locator('figure').boundingBox();
  const copy = await page.locator('.copy').boundingBox();
  expect(cover.width).toBeLessThanOrEqual(fixture.maximumCoverWidth);
  for (const box of [cover, copy]) {
    expect(box.x).toBeGreaterThanOrEqual(main.x);
    expect(box.x + box.width).toBeLessThanOrEqual(main.x + main.width + 1);
    expect(box.y).toBeGreaterThanOrEqual(main.y);
    expect(box.y + box.height).toBeLessThanOrEqual(main.y + main.height + 1);
  }
  if (layout.direction === 'stacked') {
    expect(copy.y - cover.y - cover.height).toBeGreaterThanOrEqual(layout.minimumGap - 1);
  } else {
    expect(layout.direction).toBe('side-by-side');
    expect(copy.x - cover.x - cover.width).toBeGreaterThanOrEqual(layout.minimumGap - 1);
    expect(Math.max(cover.y, copy.y)).toBeLessThan(Math.min(cover.y + cover.height, copy.y + copy.height));
  }
  let previousBottom = 0;
  for (const selector of fixture.copyOrder) {
    const box = await page.locator(selector).boundingBox();
    expect(box.y, `${selector} must follow the preceding copy without overlap`).toBeGreaterThanOrEqual(previousBottom);
    previousBottom = box.y + box.height;
  }
});

test('automated WCAG A and AA checks include color contrast', async ({ page }) => {
  await openPage(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(results.incomplete.filter(result => result.id === 'color-contrast')).toEqual([]);
  expect(results.passes.map(result => result.id)).toContain('color-contrast');
});
