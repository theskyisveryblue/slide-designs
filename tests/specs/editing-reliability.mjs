import assert from 'node:assert/strict';
import PptxGenJS from 'pptxgenjs';
import { readFile } from 'node:fs/promises';
import { gotoGallery, saveDownload, attachDiagnostics } from '../helpers.mjs';
import { inspectPptx } from '../inspectPptx.mjs';

export default function register(test) {
  test('typed paragraph breaks survive saving, reopening and PowerPoint export', async ({ page, baseUrl, dir }) => {
    const errors = attachDiagnostics(page);
    await gotoGallery(page, baseUrl); await page.getByTestId('new-blank').click();
    await page.getByTestId('tool-text').click();
    await page.keyboard.insertText('First paragraph'); await page.keyboard.press('Enter');
    await page.keyboard.insertText('Second paragraph'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await page.keyboard.insertText('After an empty line');
    await saveDownload(page, () => page.keyboard.press('ControlOrMeta+s'), dir + '/paragraphs.json');
    const saved = JSON.parse(await readFile(dir + '/paragraphs.json', 'utf8'));
    const expected = 'First paragraph\nSecond paragraph\n\nAfter an empty line';
    assert.equal(saved.slides[0].elements[0].runs.map(run => run.text).join(''), expected);
    await page.getByTestId('open-json-input').setInputFiles(dir + '/paragraphs.json');
    await page.getByTestId('open-export').click();
    await saveDownload(page, () => page.getByTestId('export-pptx').click(), dir + '/paragraphs.pptx');
    const exported = await inspectPptx(dir + '/paragraphs.pptx');
    assert(exported.slides[0].texts.includes('Second paragraph'));
    assert(exported.slides[0].texts.includes('After an empty line'));
    assert.deepEqual(errors, []);
  });

  test('opening another deck starts a separate undo history and updates the browser title', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl); await page.getByTestId('new-blank').click();
    await page.getByTestId('tool-text').click(); await page.keyboard.insertText('Keep in the first deck'); await page.keyboard.press('Escape');
    const first = await page.evaluate(() => window.__slideDesigns.deck());
    const second = structuredClone(first); second.id = 'separate-deck'; second.title = 'Second presentation'; second.slides[0].elements = [];
    await page.getByTestId('open-json-input').setInputFiles({ name: 'second.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(second)) });
    await page.waitForFunction(() => window.__slideDesigns.deck().id === 'separate-deck');
    assert.equal(await page.title(), 'Second presentation — Slide Designs');
    await page.getByTestId('editor-stage').focus(); await page.keyboard.press('ControlOrMeta+z');
    assert.equal(await page.evaluate(() => window.__slideDesigns.deck().id), second.id, 'Undo must not switch to another presentation');
    await page.getByTestId('back-to-templates').click();
    await page.getByRole('button', { name: `Open ${first.title}`, exact: true }).click();
    assert.equal(await page.evaluate(() => window.__slideDesigns.deck().slides[0].elements[0].runs[0].text), 'Keep in the first deck');
  });

  test('clicking within inline text positions the caret without restarting or dragging the object', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl); await page.getByTestId('new-blank').click();
    await page.getByTestId('tool-text').click(); await page.keyboard.insertText('Keep these words');
    const before = await page.evaluate(() => window.__slideDesigns.deck().slides[0].elements[0]);
    await page.getByTestId('inline-editor').dblclick();
    assert.equal(await page.getByTestId('inline-editor').textContent(), 'Keep these words', 'selecting a word must not restore stale text');
    await page.keyboard.press('ControlOrMeta+ArrowRight'); await page.keyboard.insertText(' and more'); await page.keyboard.press('Escape');
    const after = await page.evaluate(() => window.__slideDesigns.deck().slides[0].elements[0]);
    assert.equal(after.runs.map(run => run.text).join(''), 'Keep these words and more');
    assert.equal(after.x, before.x); assert.equal(after.y, before.y);
  });
  test('a slow file open cannot replace a newer workspace action', async ({ page, baseUrl }) => {
    await page.addInitScript(() => {
      const read = FileReader.prototype.readAsText;
      FileReader.prototype.readAsText = function (...args) {
        setTimeout(() => { read.apply(this, args); window.delayedReadStarted = true; }, 500);
      };
    });
    await gotoGallery(page, baseUrl); await page.getByTestId('new-blank').click();
    const incoming = await page.evaluate(() => window.__slideDesigns.deck());
    incoming.id = 'delayed-deck'; incoming.title = 'Delayed file';
    await page.getByTestId('back-to-templates').click();
    await page.getByTestId('gallery-open-input').setInputFiles({ name: 'delayed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
    await page.getByTestId('new-blank').click();
    const current = await page.evaluate(() => window.__slideDesigns.deck().id);
    await page.waitForFunction(() => window.delayedReadStarted);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__slideDesigns.deck().id), current);
  });

  test('imported mixed formatting supports color changes, undo/redo and export after reload', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.title = 'Formatting survives';
    const slide = pptx.addSlide();
    slide.addText([{ text: 'Regular ', options: { bold: false, color: '224466' } }, { text: 'emphasis', options: { bold: true, italic: true, color: '883322' } }], { x: 1, y: 1, w: 9, h: 1, fontSize: 32, fontFace: 'Georgia', margin: 0 });
    slide.addNotes('Keep these notes with the formatted slide.');
    await page.getByTestId('gallery-open-input').setInputFiles({ name: 'formatting.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from(await pptx.write({ outputType: 'nodebuffer' })) });
    await page.getByTestId('import-continue').click();
    const original = await page.evaluate(() => window.__slideDesigns.deck().slides[0].elements[0]);
    await page.locator('.canvas-host [data-kind=text]').click();
    await page.getByLabel('Text colour', { exact: true }).fill('#336699');
    await page.getByTestId('undo').click();
    assert.deepEqual(await page.evaluate(() => window.__slideDesigns.deck().slides[0].elements[0].runs), original.runs);
    await page.getByTestId('redo').click();
    await page.getByTestId('back-to-templates').click(); await page.reload();
    await page.getByRole('button', { name: 'Open Formatting survives', exact: true }).click();
    const current = await page.evaluate(() => window.__slideDesigns.deck());
    assert.equal(current.slides[0].elements[0].color, '336699');
    assert.equal(current.slides[0].elements[0].fontFace, 'Georgia');
    assert.equal(current.slides[0].elements[0].runs[1].bold, true);
    const colors = await page.locator('.canvas-host [data-kind=text] span').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
    assert(colors.length >= 2);
    assert(colors.every(color => color === 'rgb(51, 102, 153)'));
    await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
    await page.screenshot({ path: dir + '/imported-formatting-dark.png' });
    await page.getByLabel('Appearance', { exact: true }).selectOption('light');
    await page.screenshot({ path: dir + '/imported-formatting-light.png' });
    await page.getByTestId('open-export').click();
    await saveDownload(page, () => page.getByTestId('export-pptx').click(), dir + '/formatted-again.pptx');
    const exported = await inspectPptx(dir + '/formatted-again.pptx');
    assert.match(exported.slides[0].xml, /typeface="Georgia"/);
    assert.match(exported.slides[0].xml, /val="336699"/);
    assert.equal(exported.notes[0], current.slides[0].notes);
  });

  test('dropping a replacement picture resets the previous crop and can be undone', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl);
    const fixture = await page.evaluate(async () => {
      const { createDeck, createSlide, createImage } = await import('/src/model/deck.ts');
      const image = document.createElement('canvas'); image.width = 100; image.height = 100;
      const ctx = image.getContext('2d'); ctx.fillStyle = '#ff4422'; ctx.fillRect(0, 0, 100, 100);
      const old = image.toDataURL('image/png'); ctx.fillStyle = '#2244ff'; ctx.fillRect(0, 0, 100, 100);
      return { deck: createDeck('Replace a cropped picture', 'editorial', [createSlide({ elements: [createImage({ id: 'picture', src: old, crop: { left: .3, top: .1, right: 0, bottom: 0 } })] })]), next: image.toDataURL('image/png') };
    });
    await page.getByTestId('gallery-open-input').setInputFiles({ name: 'cropped.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture.deck)) });
    await page.locator('.canvas-host [data-kind=image]').click();
    await page.getByTestId('editor-stage').evaluate((node, source) => {
      const bytes = Uint8Array.from(atob(source.split(',')[1]), c => c.charCodeAt(0));
      const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File([bytes], 'replacement.png', { type: 'image/png' }));
      node.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    }, fixture.next);
    await page.waitForFunction(source => window.__slideDesigns.deck().slides[0].elements[0].src === source, fixture.next);
    const replaced = await page.evaluate(() => window.__slideDesigns.deck().slides[0].elements[0]);
    assert.equal(replaced.crop, undefined, 'new picture must not inherit a crop intended for another photo');
    assert.equal(replaced.w, fixture.deck.slides[0].elements[0].w); assert.equal(replaced.h, fixture.deck.slides[0].elements[0].h);
    await page.getByTestId('undo').click();
    const restored = await page.evaluate(() => window.__slideDesigns.deck().slides[0].elements[0]);
    assert.equal(restored.src, fixture.deck.slides[0].elements[0].src);
    assert.deepEqual(restored.crop, fixture.deck.slides[0].elements[0].crop);
  });

}
