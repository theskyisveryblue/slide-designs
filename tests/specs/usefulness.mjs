import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gotoGallery, startDemoDeck, saveDownload } from '../helpers.mjs';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
async function fixture(page, baseUrl, locked = false) {
  await gotoGallery(page, baseUrl);
  const deck = await page.evaluate(async locked => {
    const { createDeck, createSlide, createText } = await import('/src/model/deck.ts');
    return createDeck('Arrange objects', 'editorial', [createSlide({ elements: [
      createText({ id: 'a', text: 'First', x: 100, y: 120, w: 100, h: 40, size: 24, locked }),
      createText({ id: 'c', text: 'Third', x: 800, y: 80, w: 140, h: 40, size: 24 }),
      createText({ id: 'b', text: 'Second', x: 400, y: 250, w: 200, h: 80, size: 24 }),
      createText({ id: 'd', text: 'Fourth', x: 800, y: 500, w: 140, h: 40, size: 24 }),
    ] })]);
  }, locked);
  await page.getByTestId('gallery-open-input').setInputFiles({ name: 'arrange.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(deck)) });
  await page.getByTestId('editor-stage').waitFor();
}
const elements = page => page.evaluate(() => window.__slideDesigns.deck().slides[0].elements);
async function choose(page, names) {
  await page.getByTestId('layers-tab').click();
  for (let i = 0; i < names.length; i++) await page.locator('.layer-row').filter({ hasText: names[i] }).click({ modifiers: i ? ['Shift'] : [] });
  await page.getByTestId('edit-selection').click();
  const arrange = page.locator('.inspector-disclosure').filter({ has: page.locator('summary', { hasText: /^Arrange$/ }) });
  if (!(await arrange.getAttribute('open') !== null)) await arrange.locator('summary').first().click();
}

export default function register(test) {
  test('keyboard save includes inline text, notes and title without requiring a blur first', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl); await startDemoDeck(page);
    await page.locator('[data-testid=editor-stage] [data-role=title]').first().dblclick();
    await page.getByTestId('inline-editor').fill('Save the words I just typed');
    await saveDownload(page, () => page.keyboard.press(`${mod}+s`), dir + '/inline.json');
    assert((await readFile(dir + '/inline.json', 'utf8')).includes('Save the words I just typed'));
    await page.getByTestId('notes-input').fill('Notes still have focus');
    await saveDownload(page, () => page.keyboard.press(`${mod}+s`), dir + '/notes.json');
    assert.equal(JSON.parse(await readFile(dir + '/notes.json', 'utf8')).slides[0].notes, 'Notes still have focus');
    await page.getByTestId('deck-title').fill('New title still has focus');
    await saveDownload(page, () => page.keyboard.press(`${mod}+s`), dir + '/title.json');
    assert.equal(JSON.parse(await readFile(dir + '/title.json', 'utf8')).title, 'New title still has focus');
  });

  test('alignment uses slide bounds for one object and preserves group spacing when centering', async ({ page, baseUrl }) => {
    await fixture(page, baseUrl);
    await choose(page, ['First']);
    await page.getByTestId('align-right').click();
    assert.equal((await elements(page)).find(x => x.id === 'a').x, 1180);
    await page.getByTestId('undo').click();
    await choose(page, ['First', 'Second']);
    await page.getByTestId('align-center').click();
    const items = await elements(page), a = items.find(x => x.id === 'a'), b = items.find(x => x.id === 'b');
    assert.equal(a.x, 390); assert.equal(b.x, 690);
    assert.equal(a.y, 255); assert.equal(b.y, 385);
    await page.getByTestId('align-left').click();
    const aligned = await elements(page);
    assert.equal(aligned.find(x => x.id === 'a').x, aligned.find(x => x.id === 'b').x);
    await page.getByTestId('layer-front').click();
    assert.deepEqual((await elements(page)).map(x => x.id), ['c', 'd', 'a', 'b']);
    await page.getByTestId('layer-back').click();
    assert.deepEqual((await elements(page)).map(x => x.id), ['a', 'b', 'c', 'd']);
  });

  test('locked objects stay fixed during group drag and alignment', async ({ page, baseUrl }) => {
    await fixture(page, baseUrl, true);
    await choose(page, ['First', 'Second']);
    const node = page.locator('[data-testid=editor-stage] [data-el-id=b]');
    const box = await node.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
    await page.mouse.move(box.x + 70, box.y + 60, { steps: 5 }); await page.mouse.up();
    let items = await elements(page);
    assert.equal(items.find(x => x.id === 'a').x, 100);
    assert.equal(items.find(x => x.id === 'a').y, 120);
    assert(items.find(x => x.id === 'b').x > 400);
    await page.getByTestId('align-center').click();
    items = await elements(page);
    assert.equal(items.find(x => x.id === 'a').x, 100);
    await choose(page, ['First']);
    assert.equal(await page.locator('.handle').count(), 0);
    await page.getByText('Position & size', { exact: true }).click();
    assert(await page.getByLabel('X', { exact: true }).isDisabled());
  });

  test('autosave failures stay visible and cannot discard work on return to workspace', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl); await startDemoDeck(page);
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
    await page.getByTestId('deck-title').fill('Keep this unsaved work'); await page.getByTestId('deck-title').press('Tab');
    await page.waitForFunction(() => document.querySelector('[data-testid=save-status]')?.textContent.includes('Not saved'));
    await page.getByTestId('back-to-templates').click();
    assert(await page.getByTestId('editor-stage').isVisible());
    assert.equal(await page.getByTestId('deck-title').inputValue(), 'Keep this unsaved work');
    await saveDownload(page, async () => { await page.getByLabel('File menu', { exact: true }).click(); await page.getByTestId('save-json').click(); }, dir + '/recovery.json');
    assert.equal(JSON.parse(await readFile(dir + '/recovery.json', 'utf8')).title, 'Keep this unsaved work');
    assert.match(await page.getByTestId('save-status').textContent(), /Not saved/);
    await page.getByTestId('back-to-templates').click();
    assert(await page.getByTestId('workspace-dashboard').isVisible());
  });

  test('layout issues select the affected object and image controls have useful states', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl); await startDemoDeck(page);
    await page.getByTestId('thumb-3').click();
    await page.getByTestId('overflow-status').click();
    await page.getByTestId('layout-issues').getByRole('button', { name: /Missing image:/ }).click();
    assert(await page.getByRole('button', { name: 'Upload image', exact: true }).isVisible());
    assert(await page.getByRole('button', { name: 'Reset crop', exact: true }).isDisabled());
    assert(await page.getByRole('button', { name: 'Remove image', exact: true }).isDisabled());
    assert.equal((await page.evaluate(() => window.__slideDesigns.selection())).length, 1);
  });

  test('image replacement stays attached to its original slide during a slow upload', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl); await startDemoDeck(page);
    await page.getByTestId('thumb-3').click();
    await page.getByTestId('overflow-status').click();
    await page.getByTestId('layout-issues').getByRole('button', { name: /Missing image:/ }).click();
    const imageId = (await page.evaluate(() => window.__slideDesigns.selection()))[0];
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 80;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#4488cc'; ctx.fillRect(0, 0, 40, 80);
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = async function () {
        await decode.call(this);
        await new Promise(resolve => window.releaseImageRead = resolve);
        HTMLImageElement.prototype.decode = decode;
      };
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#inspector-replace-image').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => typeof window.releaseImageRead === 'function');
    await page.getByTestId('thumb-0').click();
    await page.getByTestId('tool-text').click();
    await page.evaluate(() => window.releaseImageRead());
    await page.waitForFunction(id => Boolean(window.__slideDesigns.deck().slides[3].elements.find(item => item.id === id)?.src), imageId);
    const deck = await page.evaluate(() => window.__slideDesigns.deck());
    assert(deck.slides[3].elements.find(item => item.id === imageId).src.startsWith('data:image/png'));
    assert(deck.slides[0].elements.every(item => item.src === undefined));
    assert.equal(await page.evaluate(() => window.__slideDesigns.slideIndex()), 0);
  });

  test('slide ordering has explicit controls and presentation notes start hidden', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl); await startDemoDeck(page);
    assert(await page.getByTestId('move-slide-up').isDisabled());
    const first = await page.evaluate(() => window.__slideDesigns.deck().slides[0].id);
    await page.getByTestId('move-slide-down').click();
    assert.equal(await page.evaluate(() => window.__slideDesigns.deck().slides[1].id), first);
    await page.getByTestId('move-slide-up').click();
    assert.equal(await page.evaluate(() => window.__slideDesigns.deck().slides[0].id), first);
    await page.getByTestId('present').click();
    await page.locator('section.present .slide-canvas').waitFor();
    assert(!(await page.getByTestId('present-notes').isVisible()));
    await page.getByTestId('present-notes-toggle').click();
    assert(await page.getByTestId('present-notes').isVisible());
    await page.keyboard.press('Escape');
    assert(!(await page.title()).includes('presenting'));
    await page.getByLabel('File menu', { exact: true }).click();
    await page.getByTestId('google-slides').click();
    assert(await page.getByTestId('google-download-pptx').isVisible());
    await saveDownload(page, () => page.getByTestId('google-download-pptx').click(), dir + '/google-import.pptx');
    const { default: JSZip } = await import('jszip');
    const pptx = await JSZip.loadAsync(await readFile(dir + '/google-import.pptx'));
    assert(pptx.file('ppt/presentation.xml'));
  });
}
