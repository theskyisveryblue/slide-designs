import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import {
  artifactPath,
  attachDiagnostics,
  ensureDir,
  expect,
  gotoGallery,
  pngDimensions,
  pngStats,
  saveDownload,
  startDemoDeck,
  waitForEditorSync,
} from '../helpers.mjs';

async function exportZip(page, testid, target) {
  await page.locator('[data-testid="open-export"]').click();
  await page.getByTestId('export-images-options').click();
  await saveDownload(page, () => page.locator(`[data-testid="${testid}"]`).click(), target, 240000);
  await page.locator('.toast--success').first().waitFor({ state: 'visible', timeout: 240000 });
  await page.locator('.toast__close').first().click().catch(() => {});
}

export default function register(test) {
  test('PNG export writes one decoded image per slide at both resolutions', async ({ page, baseUrl, dir }) => {
    const errors = attachDiagnostics(page);
    await ensureDir(dir);
    await gotoGallery(page, baseUrl);
    await startDemoDeck(page);

    // Zoom must not affect exported pixels.
    await page.locator('[data-testid="zoom-out"]').click();
    await page.locator('[data-testid="zoom-out"]').click();
    await waitForEditorSync(page);
    expect.ok((await page.locator('[data-testid="zoom-label"]').textContent()) !== '100%');

    const zip1x = artifactPath(dir, 'deck-1x.zip');
    await exportZip(page, 'export-png-1x', zip1x);
    const zip2x = artifactPath(dir, 'deck-2x.zip');
    await exportZip(page, 'export-png-2x', zip2x);

    const one = await JSZip.loadAsync(await readFile(zip1x));
    const two = await JSZip.loadAsync(await readFile(zip2x));
    const namesOne = Object.keys(one.files).filter((name) => name.endsWith('.png')).sort();
    const namesTwo = Object.keys(two.files).filter((name) => name.endsWith('.png')).sort();
    expect.equal(namesOne.length, 9, 'one PNG per slide at 1x');
    expect.equal(namesTwo.length, 9, 'one PNG per slide at 2x');

    const manifest = JSON.parse(await one.file('manifest.json').async('string'));
    expect.equal(manifest.scale, 1);
    expect.equal(manifest.pixelWidth, 1280);
    const manifest2 = JSON.parse(await two.file('manifest.json').async('string'));
    expect.equal(manifest2.scale, 2);
    expect.equal(manifest2.pixelWidth, 2560);
    expect.equal(manifest2.pixelHeight, 1440);

    const seen = new Set();
    for (const [index, name] of namesOne.entries()) {
      const buffer = await one.file(name).async('nodebuffer');
      const { width, height } = pngDimensions(buffer);
      expect.equal(width, 1280, `${name} width`);
      expect.equal(height, 720, `${name} height`);
      expect.ok(buffer.length > 8000, `${name} has real content`);
      const stats = await pngStats(page, buffer);
      expect.equal(stats.width, 1280);
      expect.equal(stats.height, 720);
      expect.ok(stats.uniqueColors > 40, `${name} is not a blank field (${stats.uniqueColors} colours)`);
      seen.add(`${stats.uniqueColors}:${Math.round(stats.meanLuma)}`);
      {
        const cover = await two.file(name).async('nodebuffer');
        const big = pngDimensions(cover);
        expect.equal(big.width, 2560);
        expect.equal(big.height, 1440);
      }
    }
    expect.ok(seen.size >= 5, 'slides are visually distinct, not one repeated frame');
    expect.deepEqual(errors, []);
  });
}
