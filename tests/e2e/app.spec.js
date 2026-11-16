// End-to-end smoke tests of the main user flows.
import { test, expect } from '@playwright/test';

/** Collect console errors so every test can assert there were none. */
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|images-api|net::ERR/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function boot(page, hash = '') {
  await page.addInitScript(() => {
    // Fresh state, English UI, quiet audio, instant text for fast tests
    localStorage.clear();
    localStorage.setItem('mars-explorer:settings', JSON.stringify({ language: 'en', muted: true, quality: 'low', autoRotate: false }));
  });
  // Photos come from the NASA API: stub it so tests are deterministic and offline-safe
  await page.route('https://images-api.nasa.gov/**', (route) => route.fulfill({ json: { collection: { items: [] } } }));
  // mars.nasa.gov blocks headless Chrome, so its feeds are stubbed with small real-shaped fixtures
  await page.route('https://mars.nasa.gov/**', (route) => {
    const url = route.request().url();
    if (url.includes('feed=weather'))
      return route.fulfill({
        json: { sols: [{ sol: '1127', terrestrial_date: '2024-04-21', ls: '240.2', min_temp: -77.3, max_temp: -19.6, pressure: 774 }] },
      });
    if (url.includes('M20_waypoints'))
      return route.fulfill({
        json: { features: [{ properties: { sol: 13, site: 3, drive: 0, lat: 18.44463, lon: 77.45089, elev_geoid: -2569.9, yaw: 130 } }] },
      });
    if (url.includes('M20_traverse'))
      return route.fulfill({
        json: {
          features: [
            {
              geometry: {
                type: 'LineString',
                coordinates: [
                  [77.45089, 18.44463],
                  [77.4515, 18.4451],
                ],
              },
            },
          ],
        },
      });
    if (url.includes('raw_images')) return route.fulfill({ json: { images: [] } });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route('https://api.nasa.gov/**', (route) => route.fulfill({ json: [] }));
  await page.goto(`/${hash}`);
  await expect(page.locator('#loading')).toHaveClass(/done/, { timeout: 45_000 });
}

test('start screen loads without errors and switches language', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#start-objectives [data-objective]')).toHaveCount(3);
  await expect(page.locator('#start-objectives [data-objective="life"]')).toHaveCount(0);
  await expect(page.locator('#start-objectives [data-objective="geology"]')).toContainText('Geological history');
  await expect(page.locator('#btn-tour')).toBeVisible();
  await expect(page.locator('#start-objectives [data-objective="free"]')).toContainText('Free exploration');
  await expect(page.locator('#btn-start-mission')).toHaveCount(0); // guided mission removed
  await page.click('#btn-language');
  await expect(page.locator('#start-objectives [data-objective="geology"]')).toContainText('História geológica');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  expect(errors).toEqual([]);
});

test('guided mission: best site with its reasons, chooser with filters, then a Marswalk', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.locator('#start-objectives [data-objective="geology"]').click();
  await expect(page.locator('#guide-step-site')).toBeVisible();
  // one recommendation, with plain-language reasons
  await expect(page.locator('.rec-card h4')).toHaveText('Gale Crater');
  await expect(page.locator('.rec-card .rec-why li.plus').first()).toBeVisible();
  // a filter changes the recommendation
  await page.click('.rec-chip[data-filter="hydration"]');
  await expect(page.locator('.rec-card h4')).toHaveText('Mawrth Vallis');
  // the chooser lists every site over a blurred screen; picking one makes it "your choice"
  await page.click('#btn-change-site');
  await expect(page.locator('#site-picker')).toBeVisible();
  await expect(page.locator('#site-picker .picker-option')).toHaveCount(12);
  await page.click('#site-picker .picker-chip[data-filter="general"]');
  await page.click('#site-picker .picker-option[data-option="jezero"]');
  await expect(page.locator('#site-picker')).toHaveCount(0);
  await expect(page.locator('.rec-card h4')).toHaveText('Jezero Crater');
  await expect(page.locator('.rec-tag.picked')).toBeVisible();
  // zones: the best one, and every zone in the chooser
  await page.locator('.sci-view').nth(1).click();
  await expect(page.locator('.rec-card h4')).not.toHaveText('');
  await page.click('#btn-change-zone');
  await expect(page.locator('#zone-picker .picker-option')).toHaveCount(40);
  await page.keyboard.press('Escape');
  await page.locator('.sci-view').nth(0).click();
  await page.getByRole('button', { name: /Plan Marswalk/ }).click();
  await expect(page.locator('#guide-step-route')).toBeVisible();
  expect(await page.locator('#route-panel .rt-points li').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.guide-step-btn[data-step="route"]')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});

test('globe: NASA and computed layers react to the guide', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.locator('#start-objectives [data-objective="geology"]').click();
  // layers live in a flyout opened from the tool rail
  await page.click('#btn-layers');
  await page.selectOption('#layer-select', 'mola');
  await expect(page.locator('#legend-badge')).toBeVisible();
  await page.selectOption('#layer-select', 'slope');
  await expect(page.locator('#legend-badge')).toContainText('computed');
  await page.click('.rec-chip[data-filter="exposure"]');
  await expect(page.locator('.rec-card h4')).not.toHaveText('');
  await expect(page.locator('#guide-objective-name')).toContainText('Geological');
  expect(errors).toEqual([]);
});

test('deep link opens a science site in the guide', async ({ page }) => {
  await boot(page, '#site=gale');
  await expect(page.locator('#guide-step-site')).toBeVisible();
  await expect(page.locator('.sci-detail h4')).toHaveText('Gale Crater');
});

test('seamless zoom: the globe streams real terrain down to the ground', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.click('#start-objectives [data-objective="geology"]');
  await page.evaluate(() => window.__mars.orbitView.flyTo({ lat: 18.4446, lon: 77.4509, range: 2500, heading: 0, tilt: 50 }, 0));
  await expect
    .poll(() => page.evaluate(() => window.__mars.orbitView.terrain.levelAt(18.4446, 77.4509)), { timeout: 90_000 })
    .toBeGreaterThanOrEqual(13);
  const alt = await page.evaluate(() => window.__mars.orbitView.controls.altitude());
  expect(alt).toBeLessThan(5000);
  expect(errors).toEqual([]);
});

test('route between points on the globe, then walk it in first person and come back', async ({ page }) => {
  test.setTimeout(360_000);
  const errors = trackErrors(page);
  await boot(page, '#site=jezero-landing');
  await expect(page.locator('#route-panel')).toBeVisible();
  await page.evaluate(() => {
    const r = window.__mars.route;
    r.add(18.44463, 77.45089);
    r.add(18.4462, 77.4532);
  });
  await expect(page.locator('#rt-walk')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#route-panel .pl-kv').first()).toContainText('Distance');
  const res = await page.evaluate(() => {
    const r = window.__mars.route.state.result;
    return { length: r.evaluation.length, cell: r.finestCell, path: r.path.length };
  });
  expect(res.length).toBeGreaterThan(200);
  expect(res.cell).toBeLessThan(3);
  // Screenshot on the globe carries the route card
  await page.click('#btn-screenshot');
  await expect(page.locator('#snap-download')).toBeVisible();
  await expect(page.locator('#snap-info')).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.locator('#snap-download')).toBeHidden();
  await page.click('#rt-walk');
  await expect(page.locator('#surface-hud')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#eva-hud')).toContainText('DIST');
  await expect.poll(() => page.evaluate(() => window.__mars.traverse.world.chunks.stats().ready), { timeout: 60_000 }).toBeGreaterThan(8);
  // real time (×1) by default; speed up for the test
  expect(await page.evaluate(() => window.__mars.traverse.timeScale)).toBe(1);
  await page.click('#btn-faster');
  await page.click('#btn-faster');
  await page.click('#btn-faster');
  expect(await page.evaluate(() => window.__mars.traverse.timeScale)).toBe(10);
  const s0 = await page.evaluate(() => window.__mars.traverse.world.s);
  await expect.poll(() => page.evaluate(() => window.__mars.traverse.world.s), { timeout: 60_000 }).toBeGreaterThan(s0 + 5);
  // Screenshot during the rehearsal: preview with the EVA card, download, walk resumes after closing
  await page.keyboard.press('k');
  await expect(page.locator('#snap-download')).toBeVisible();
  expect(await page.evaluate(() => window.__mars.traverse.world.paused)).toBe('snapshot');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#snap-download')]);
  expect(dl.suggestedFilename()).toMatch(/^mars-explorer-.*\.png$/);
  await expect(page.locator('#snap-download')).toBeHidden();
  expect(await page.evaluate(() => window.__mars.traverse.world.paused)).toBe(false);
  await page.click('#btn-surface-exit');
  await expect(page.locator('#app-header')).toBeVisible();
  await expect(page.locator('#surface-hud')).toBeHidden();
  expect(errors).toEqual([]);
});

test('phone layout: bottom sheets and no horizontal overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await boot(page);
  await page.click('#start-objectives [data-objective="survival"]');
  await expect(page.locator('#mobile-toggles')).toBeVisible();
  // Choosing the objective opens the guide sheet automatically.
  await expect(page.locator('#right-panel')).toHaveClass(/open/);
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.locator('#right-panel [data-close-panel]').click();
  await expect(page.locator('#right-panel')).not.toHaveClass(/open/);
  await page.locator('#mobile-toggles [data-panel="right-panel"]').click();
  await expect(page.locator('#right-panel')).toHaveClass(/open/);
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await context.close();
});

test('settings: language, units and key remapping persist', async ({ page }) => {
  await boot(page);
  await page.locator('#start-screen [data-open="settings"]').click();
  await page.selectOption('#set-units', 'imperial');
  await page.selectOption('#set-language', 'pt');
  await expect(page.locator('#start-objectives [data-objective="survival"]')).toContainText('Sobrevivência humana');
  await page.getByRole('tab', { name: 'Controls' }).click();
  await page.locator('.keybind').first().click();
  await page.keyboard.press('KeyI');
  await expect(page.locator('.keybind').first()).toContainText('I');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mars-explorer:settings')));
  expect(saved.units).toBe('imperial');
  expect(saved.bindings.forward[0]).toBe('KeyI');
});

test('GENIE explains an indicator with the rest of the screen blurred', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.click('#start-objectives [data-objective="free"]');
  await expect(page.locator('#guide-step-route')).toBeVisible();
  await page.locator('#telemetry [data-genie="radiation"]').click();
  await expect(page.locator('.genie-bubble')).toBeVisible();
  await expect(page.locator('.genie-bubble')).toContainText('GENIE');
  await expect(page.locator('.genie-bubble')).toContainText('0.64 mSv');
  await expect(page.locator('.genie-pane')).toHaveCount(4);
  await expect(page.locator('.genie-robot')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.genie-layer')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('GENIE tour walks through the app from the start screen', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.click('#btn-tour');
  await expect(page.locator('.genie-bubble')).toContainText('GENIE');
  await expect(page.locator('.genie-step')).toHaveText('1 of 8');
  for (let i = 2; i <= 8; i++) {
    await page.locator('.genie-actions .genie-btn:not(.ghost)').click();
    await expect(page.locator('.genie-step')).toHaveText(`${i} of 8`);
  }
  // the tour entered the map on its own
  await expect(page.locator('#app-header')).toBeVisible();
  await page.locator('.genie-actions .genie-btn:not(.ghost)').click();
  await expect(page.locator('.genie-layer')).toHaveCount(0);
  await expect(page.locator('#guide-step-site')).toBeVisible();
  expect(errors).toEqual([]);
});
