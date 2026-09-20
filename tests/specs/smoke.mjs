import { attachDiagnostics, expect, startDemoDeck, gotoGallery, waitForEditorSync, artifactPath, ensureDir, saveDownload, readJson } from '../helpers.mjs';

export default function register(test) {
  test('app boots from the gallery without runtime errors', async ({ page, baseUrl, dir }) => {
    const errors = attachDiagnostics(page);
    await gotoGallery(page, baseUrl);
    expect.equal(await page.evaluate(() => window.__slideDesigns.view()), 'gallery');
    expect.equal(await page.locator('[data-testid^="family-"]').count(), 3);
    expect.equal(await page.locator('.tile').count(), 27);
    await page.screenshot({ path: artifactPath(dir, 'gallery.png'), fullPage: true });
    expect.deepEqual(errors, []);
  });

  test('editor opens the demo deck and reports a clean layout', async ({ page, baseUrl, dir }) => {
    const errors = attachDiagnostics(page);
    await gotoGallery(page, baseUrl);
    await startDemoDeck(page);
    expect.equal(await page.evaluate(() => window.__slideDesigns.deck().slides.length), 9);
    expect.equal((await page.locator('[data-testid="overflow-status"]').textContent())?.trim(), 'Layout clean');
    await page.screenshot({ path: artifactPath(dir, 'editor.png'), fullPage: true });
    expect.deepEqual(errors, []);
  });

  test('all three template families open from the gallery', async ({ page, baseUrl, dir }) => {
    await ensureDir(dir);
    for (const family of ['editorial', 'bold', 'product']) {
      await gotoGallery(page, baseUrl);
      await page.locator(`[data-testid="start-${family}"]`).click();
      await page.locator('[data-testid="editor-stage"]').waitFor({ state: 'visible' });
      await waitForEditorSync(page);
      expect.equal(await page.evaluate(() => window.__slideDesigns.deck().family), family);
      await page.screenshot({ path: artifactPath(dir, `family-${family}.png`) });
    }
  });

  test('saving and reloading JSON through the toolbar works', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    await startDemoDeck(page);
    const jsonPath = artifactPath(dir, 'smoke-deck.json');
    await saveDownload(page, async () => { await page.getByLabel('File menu', { exact: true }).click(); await page.getByTestId('save-json').click(); }, jsonPath);
    const saved = await readJson(jsonPath);
    expect.equal(saved.version, 1);
    expect.equal(saved.width, 1280);
    expect.equal(saved.height, 720);
    expect.equal(saved.slides.length, 9);
    const live = await page.evaluate(() => window.__slideDesigns.deck());
    expect.deepEqual(saved.slides.map((slide) => slide.id), live.slides.map((slide) => slide.id));
  });
}
