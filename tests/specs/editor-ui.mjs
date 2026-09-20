import assert from 'node:assert/strict';
import { gotoGallery, startDemoDeck } from '../helpers.mjs';

export default function register(test) {
  test('toolbar insertion, layer selection and keyboard panel switching work together', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    await startDemoDeck(page);
    const count = () => page.evaluate(() => window.__slideDesigns.deck().slides[0].elements.length);
    const initial = await count();
    await page.getByTestId('tool-text').click();
    assert.equal(await count(), initial + 1);
    await page.getByTestId('text-content').fill('A more thoughtful presentation');
    await page.getByTestId('text-content').press('Tab');
    await page.getByTestId('tool-shape').click();
    assert.equal(await count(), initial + 2);
    await page.getByTestId('layers-tab').click();
    assert.equal(await page.locator('.layer-row').count(), initial + 2);
    await page.getByRole('button', { name: 'A more thoughtful presentation', exact: true }).click();
    assert.equal(await page.locator('.layer-row.is-selected').textContent(), 'A more thoughtful presentation');
    await page.screenshot({ path: dir + '/layers.png' });
    const beforeTabSwitch = await page.evaluate(() => window.__slideDesigns.deck());
    await page.getByTestId('layers-tab').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.getByTestId('design-tab').getAttribute('aria-selected'), 'true');
    assert.deepEqual(await page.evaluate(() => window.__slideDesigns.deck()), beforeTabSwitch);
    assert.equal(await page.getByTestId('text-content').inputValue(), 'A more thoughtful presentation');
    assert.equal(await page.locator('.selection').count(), 1);
    await page.screenshot({ path: dir + '/text-inspector.png' });
    await page.getByTestId('tool-select').click();
    assert.equal(await page.locator('.selection').count(), 0);
    await page.getByRole('group', { name: 'Background colours from the theme' }).waitFor();
    await page.getByLabel('File menu', { exact: true }).click();
    assert(await page.getByTestId('open-json').isVisible());
    await page.keyboard.press('Escape');
    assert(!(await page.getByTestId('open-json').isVisible()));
  });

  test('visual layout picker adds the chosen slide and fit respects short windows', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    await startDemoDeck(page);
    await page.getByTestId('add-slide').click();
    assert.equal(await page.locator('.layout-option__preview .slide-canvas').count(), 9);
    await page.screenshot({ path: dir + '/layout-picker.png' });
    await page.getByTestId('add-layout-metrics').click();
    assert.equal(await page.getByTestId('layout-picker').count(), 0);
    assert.equal(await page.locator('.thumb.is-current .thumb__name').textContent(), 'Metrics');
    assert.equal(await page.evaluate(() => window.__slideDesigns.deck().slides.length), 10);
    await page.setViewportSize({ width: 1440, height: 660 });
    await page.getByTestId('zoom-fit').click();
    const bounds = await page.evaluate(() => {
      const workspace = document.querySelector('.canvas-workspace').getBoundingClientRect();
      const canvas = document.querySelector('.canvas-scroll').getBoundingClientRect();
      return { top: canvas.top >= workspace.top, bottom: canvas.bottom <= workspace.bottom + 1, left: canvas.left >= workspace.left, right: canvas.right <= workspace.right + 1 };
    });
    assert.deepEqual(bounds, { top: true, bottom: true, left: true, right: true });
    await page.screenshot({ path: dir + '/short-window.png' });
  });
}
