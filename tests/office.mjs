// Optional independent office-engine check. Run the browser suite first.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectPptx } from './inspectPptx.mjs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { saveDownload } from './helpers.mjs';

const executable = process.env.SOFFICE || 'soffice';
const root = path.resolve('artifacts/office-check');
const roundtrip = path.join(root, 'roundtrip');
await mkdir(roundtrip, { recursive: true });
const args = ['-env:UserInstallation=' + pathToFileURL(path.join(root, 'profile')).href, '--headless'];
const version = execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 30000 }).trim();
const normalized = text => text.replace(/\s+/g, '').normalize('NFC');
const results = [];
for (const family of ['editorial', 'bold', 'product', 'formatting', 'recovered', 'deck', 'edited', 'pictures-and-table']) {
  const input = path.resolve(family === 'deck' ? 'artifacts/tests/exports-pptx/deck.pptx' : `artifacts/tests/${['edited', 'pictures-and-table'].includes(family) ? 'pptx-import' : 'pptx-compat'}/${family}.pptx`);
  const before = await inspectPptx(input);
  const pdfLog = execFileSync(executable, [...args, '--convert-to', 'pdf', '--outdir', root, input], { encoding: 'utf8', timeout: 120000 });
  const saveLog = execFileSync(executable, [...args, '--convert-to', 'pptx:Impress MS PowerPoint 2007 XML', '--outdir', roundtrip, input], { encoding: 'utf8', timeout: 120000 });
  const pdf = await readFile(path.join(root, family + '.pdf'));
  assert(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')), `${family}: rendered PDF`);
  const after = await inspectPptx(path.join(roundtrip, family + '.pptx'));
  assert.equal(after.slideCount, before.slideCount, `${family}: slide count after office save`);
  for (let i = 0; i < before.slideCount; i++) {
    const text = normalized(after.slides[i].texts.join(''));
    for (const run of before.slides[i].texts) assert(text.includes(normalized(run)), `${family}, slide ${i + 1}: missing text ${run}`);
    assert(after.slides[i].shapeCount > 0, `${family}: editable objects remain after office save`);
    assert.equal(after.slides[i].pictureCount, before.slides[i].pictureCount, `${family}: embedded pictures survive office save`);
    if (before.notes[i]?.trim()) assert(normalized(after.notes[i] || '').includes(normalized(before.notes[i])), `${family}: notes survive office save`);
  }
  results.push({ family, slides: after.slideCount, pdfBytes: pdf.length, pdfLog: pdfLog.trim(), saveLog: saveLog.trim() });
  console.log(`ok ${family}: opened, rendered and saved back to PPTX; ${after.slideCount} slides, native text and notes preserved`);
}
const imported = [];
const server = await createServer({ server: { host: '127.0.0.1', port: 4179, strictPort: true }, logLevel: 'warn' });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  for (const family of ['editorial', 'formatting', 'deck']) {
    const context = await browser.newContext({ acceptDownloads: true });
    try {
      const page = await context.newPage(); await page.goto('http://127.0.0.1:4179/');
      const source = path.join(roundtrip, family + '.pptx'), expected = await inspectPptx(source);
      await page.getByTestId('gallery-open-input').setInputFiles(source);
      await page.getByTestId('import-continue').click({ timeout: 30000 });
      const deck = await page.evaluate(() => window.__slideDesigns.deck());
      assert.equal(deck.slides.length, expected.slideCount);
      for (let i = 0; i < expected.slideCount; i++) {
        const actual = normalized(deck.slides[i].elements.filter(el => el.type === 'text').flatMap(el => el.runs.map(run => run.text)).join(''));
        for (const run of expected.slides[i].texts) assert(actual.includes(normalized(run)), `${family}: office-authored text imports (${run})`);
        assert(normalized(deck.slides[i].notes).includes(normalized(expected.notes[i] || '')), `${family}: office-authored notes import`);
        assert.equal(deck.slides[i].elements.filter(el => el.type === 'image' && el.src).length, expected.slides[i].pictureCount);
      }
      await page.getByTestId('tool-text').click(); await page.keyboard.insertText('Round-trip edited in Slide Designs'); await page.keyboard.press('Escape');
      await page.getByTestId('open-export').click();
      const output = path.join(root, 'from-office-' + family + '.pptx');
      await saveDownload(page, () => page.getByTestId('export-pptx').click(), output);
      assert((await inspectPptx(output)).slides[0].texts.includes('Round-trip edited in Slide Designs'));
      execFileSync(executable, [...args, '--convert-to', 'pdf', '--outdir', root, output], { encoding: 'utf8', timeout: 120000 });
      assert((await readFile(output.replace(/\.pptx$/, '.pdf'))).subarray(0, 5).equals(Buffer.from('%PDF-')));
      imported.push({ family, slides: deck.slides.length, warnings: deck.meta?.importWarnings });
      console.log(`ok ${family}: office-saved PPTX imported into the editor, edited, exported and rendered again`);
    } finally { await context.close(); }
  }
} finally { await browser?.close(); await server.close(); }
await writeFile(path.join(root, 'report.json'), JSON.stringify({ version, results, imported }, null, 2) + '\n');
console.log(`Verified with ${version}. This does not substitute for a Microsoft PowerPoint or Google Slides check.`);
