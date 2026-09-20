// Exercise the actual compiled assets, including the lazy PowerPoint importer.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { attachDiagnostics, saveDownload, pngStats } from './helpers.mjs';
import { inspectPptx } from './inspectPptx.mjs';

const dir = path.resolve('artifacts/production'); await mkdir(dir, { recursive: true });
const server = await preview({ preview: { host: '127.0.0.1', port: 4182, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage(); const errors = attachDiagnostics(page);
  await page.goto('http://127.0.0.1:4182/');
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.title = 'Production check';
  const slide = pptx.addSlide(); slide.addText('Open in the built app', { x: 1, y: 1, w: 10, h: 2, fontSize: 40 }); slide.addNotes('Notes survive the production build.');
  await page.getByTestId('gallery-open-input').setInputFiles({ name: 'production.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from(await pptx.write({ outputType: 'nodebuffer' })) });
  await page.getByTestId('import-continue').click();
  await page.locator('.canvas-host [data-kind=text]').dblclick();
  await page.keyboard.insertText('Edited in the production build'); await page.keyboard.press('Escape');
  await page.getByTestId('present').click();
  await page.locator('section.present .slide-canvas').waitFor();
  assert.match(await page.locator('section.present .slide-canvas').textContent(), /Edited in the production build/);
  await page.getByTestId('present-exit').click();
  for (const kind of ['pptx', 'html', 'png']) {
    await page.getByTestId('open-export').click();
    if (kind === 'png') await page.getByTestId('export-images-options').click();
    await saveDownload(page, () => page.getByTestId(kind === 'png' ? 'export-png-1x' : `export-${kind}`).click(), path.join(dir, `deck.${kind === 'png' ? 'zip' : kind}`));
  }
  const exported = await inspectPptx(path.join(dir, 'deck.pptx'));
  assert(exported.slides[0].texts.includes('Edited in the production build'));
  assert.equal(exported.notes[0], 'Notes survive the production build.');
  const zip = await JSZip.loadAsync(await readFile(path.join(dir, 'deck.zip')));
  const pictures = Object.keys(zip.files).filter(name => name.endsWith('.png')); assert.equal(pictures.length, 1);
  const stats = await pngStats(page, await zip.file(pictures[0]).async('nodebuffer'));
  assert.equal(stats.width, 1280); assert.equal(stats.height, 720); assert(stats.uniqueColors > 10);
  await context.setOffline(true);
  const offline = await context.newPage(); const offlineErrors = attachDiagnostics(offline);
  await offline.goto(pathToFileURL(path.join(dir, 'deck.html')).href);
  assert.match(await offline.locator('.slide-canvas').textContent(), /Edited in the production build/);
  assert.deepEqual(errors, []); assert.deepEqual(offlineErrors, []);
  console.log('Production assets passed PPTX import, editing, SlideJS presentation, PPTX/PNG exports and offline HTML.');
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
