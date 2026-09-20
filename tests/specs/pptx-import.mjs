import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { gotoGallery, saveDownload, writeImageFixture, attachDiagnostics } from '../helpers.mjs';
import { inspectPptx } from '../inspectPptx.mjs';

async function fixture(patch) {
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.title = 'External product review';
  const cover = pptx.addSlide(); cover.background = { color: 'F4F1EA' };
  cover.addText('A plan worth sharing', { x: 1, y: 1, w: 8, h: 1.5, fontSize: 42, fontFace: 'Georgia', color: '25352A', margin: 0 });
  cover.addText('Café & 東京\nNext steps', { x: 1, y: 3, w: 6, h: 1.5, fontSize: 24, fontFace: 'Arial', margin: 0 });
  cover.addShape(pptx.ShapeType.ellipse, { x: 10, y: 1, w: 1.5, h: 1.5, fill: { color: '2B5CE6', transparency: 25 }, line: { transparency: 100 } });
  cover.addNotes('Present the plan, then invite questions.');
  const second = pptx.addSlide(); second.addText('The second slide', { x: 1, y: 1, w: 7, h: 1, fontSize: 36, margin: 0 }); second.addNotes('Second slide notes.');
  if (patch) await patch(pptx, cover, second);
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }));
}

async function openPptx(page, buffer, name = 'review.pptx', workspace = true) {
  await page.getByTestId(workspace ? 'gallery-open-input' : 'open-json-input').setInputFiles({ name, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer });
  await page.getByTestId('import-details').waitFor({ timeout: 30000 });
  await page.getByTestId('import-continue').click();
}

export default function register(test) {
  test('opens an external PPTX, edits native text, saves JSON and exports editable PPTX again', async ({ page, baseUrl, dir }) => {
    const errors = attachDiagnostics(page);
    await gotoGallery(page, baseUrl);
    const input = await fixture(); await writeFile(dir + '/external.pptx', input);
    await openPptx(page, input);
    const deck = await page.evaluate(() => window.__slideDesigns.deck());
    assert.equal(deck.title, 'External product review'); assert.equal(deck.slides.length, 2);
    const title = deck.slides[0].elements.find(el => el.type === 'text' && el.runs[0].text === 'A plan worth sharing');
    assert(title); assert.equal(title.fontFace, 'Georgia');
    assert(Math.abs(title.x - 96) < .1); assert(Math.abs(title.y - 96) < .1); assert(Math.abs(title.size - 56) < .1);
    assert.equal(deck.slides[0].notes, 'Present the plan, then invite questions.');
    const importedTitle = page.locator('.canvas-host [data-kind=text]').first();
    await importedTitle.click();
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    await page.getByRole('button', { name: 'Italic', exact: true }).click();
    const formatting = await importedTitle.locator('span').first().evaluate(node => ({ weight: getComputedStyle(node).fontWeight, style: getComputedStyle(node).fontStyle }));
    assert.deepEqual(formatting, { weight: '700', style: 'italic' }, 'formatting controls override imported run styles');
    await importedTitle.dblclick();
    await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.insertText('Edited from PowerPoint'); await page.keyboard.press('Escape');
    await page.getByTestId('open-export').click();
    await saveDownload(page, () => page.getByTestId('export-pptx').click(), dir + '/edited.pptx');
    const exported = await inspectPptx(dir + '/edited.pptx');
    assert(exported.slides[0].texts.includes('Edited from PowerPoint')); assert.equal(exported.slideCount, 2);
    assert.equal(exported.notes[0], deck.slides[0].notes);
    assert.match(exported.slides[0].xml, /typeface="Georgia"/);
    await saveDownload(page, () => page.keyboard.press('ControlOrMeta+s'), dir + '/edited.json');
    await page.getByTestId('back-to-templates').click();
    await page.getByTestId('gallery-open-input').setInputFiles(dir + '/edited.json');
    await page.getByTestId('editor-stage').waitFor();
    assert.equal((await page.evaluate(() => window.__slideDesigns.deck())).slides[0].elements.find(el => el.type === 'text').fontFace, 'Georgia');
    await page.getByLabel('File menu', { exact: true }).click(); await page.getByTestId('import-details-open').click();
    assert(await page.getByTestId('import-details').isVisible());
    assert.deepEqual(errors, []);
  });

  test('imports pictures with crop and tables as editable objects', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    const picture = await writeImageFixture(page, dir + '/portrait.png', { width: 300, height: 900, label: 'Portrait', colors: ['#234577', '#CDE8FF'] });
    const input = await fixture((pptx, cover, second) => {
      second.addImage({ path: picture, x: 1, y: 2, w: 4, h: 12, sizing: { type: 'cover', w: 4, h: 3 } });
      const third = pptx.addSlide();
      third.addTable([['Stage', 'Owner'], ['Plan', 'Team A'], ['Ship', 'Team B']], { x: 1, y: 1, w: 8, h: 3, fontSize: 20 });
    });
    await openPptx(page, input);
    const deck = await page.evaluate(() => window.__slideDesigns.deck());
    assert.equal(deck.slides.length, 3);
    const image = deck.slides[1].elements.find(el => el.type === 'image'); assert(image?.src?.startsWith('data:image/png;base64,')); assert.equal(image.fit, 'fill');
    for (const word of ['Stage', 'Owner', 'Plan', 'Team A', 'Ship', 'Team B']) assert(deck.slides[2].elements.some(el => el.type === 'text' && el.runs.some(run => run.text === word)), word);
    assert(deck.meta.importWarnings.some(message => message.includes('table')));
    await page.getByTestId('thumb-2').click(); await page.screenshot({ path: dir + '/imported-table.png' });
    await page.getByTestId('open-export').click(); await saveDownload(page, () => page.getByTestId('export-pptx').click(), dir + '/pictures-and-table.pptx');
    const report = await inspectPptx(dir + '/pictures-and-table.pptx'); assert.equal(report.slides[1].pictureCount, 1); assert(report.slides[2].texts.includes('Team B'));
  });

  test('honors relationship slide order and placeholder geometry from the layout', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl);
    const zip = await JSZip.loadAsync(await fixture());
    let presentation = await zip.file('ppt/presentation.xml').async('string');
    const ids = presentation.match(/<p:sldId\s[^>]*\/>/g); assert.equal(ids.length, 2);
    presentation = presentation.replace(ids.join(''), ids.slice().reverse().join('')); zip.file('ppt/presentation.xml', presentation);
    let slide = await zip.file('ppt/slides/slide1.xml').async('string');
    const shapes = slide.match(/<p:sp>[\s\S]*?<\/p:sp>/g), original = shapes[0];
    const inherited = original.replace('<p:nvPr>', '<p:nvPr><p:ph type="title" idx="7"/>');
    slide = slide.replace(original, inherited.replace(/<a:xfrm>[\s\S]*?<\/a:xfrm>/, '').replace(/<a:srgbClr val="25352A"\/>/, '<a:schemeClr val="accent1"/>'));
    zip.file('ppt/slides/slide1.xml', slide);
    const theme = await zip.file('ppt/theme/theme1.xml').async('string');
    zip.file('ppt/theme/theme1.xml', theme.replace(/<a:accent1>[\s\S]*?<\/a:accent1>/, '<a:accent1><a:srgbClr val="008899"/></a:accent1>'));
    const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
    const target = rels.match(/Type="[^"]*\/slideLayout" Target="([^"]+)"/)[1].replace('../', 'ppt/');
    const layout = await zip.file(target).async('string'); zip.file(target, layout.replace('</p:spTree>', inherited + '</p:spTree>'));
    await openPptx(page, await zip.generateAsync({ type: 'nodebuffer' }));
    const deck = await page.evaluate(() => window.__slideDesigns.deck());
    assert.equal(deck.slides[0].notes, 'Second slide notes.');
    const title = deck.slides[1].elements.find(el => el.type === 'text' && el.runs[0].text === 'A plan worth sharing');
    assert(title); assert(Math.abs(title.x - 96) < .1); assert(Math.abs(title.y - 96) < .1);
    assert.equal(title.color, '008899', 'theme colors resolve to explicit editable colors');
  });

  test('imports exported template decks without dropping slide text or notes', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    for (const family of ['Editorial', 'Bold Studio', 'Clean Product']) {
      await page.getByRole('button', { name: `Create presentation from ${family}`, exact: true }).click();
      const original = await page.evaluate(() => window.__slideDesigns.deck());
      const filename = dir + '/' + original.family + '.pptx';
      await page.getByTestId('open-export').click(); await saveDownload(page, () => page.getByTestId('export-pptx').click(), filename);
      await openPptx(page, await readFile(filename), 'template.pptx', false);
      const imported = await page.evaluate(() => window.__slideDesigns.deck()); assert.equal(imported.slides.length, 9);
      for (let i = 0; i < 9; i++) {
        const importedText = imported.slides[i].elements.filter(el => el.type === 'text').flatMap(el => el.runs.map(run => run.text)).join('').replace(/\s/g, '');
        for (const element of original.slides[i].elements.filter(el => el.type === 'text')) for (const run of element.runs) assert(importedText.includes((element.caps ? run.text.toUpperCase() : run.text).replace(/\s/g, '')), `${family} slide ${i + 1}: ${run.text}`);
        assert.equal(imported.slides[i].notes.replace(/\s/g, ''), original.slides[i].notes.replace(/\s/g, ''));
      }
      await page.getByTestId('back-to-templates').click();
    }
  });

  test('malformed and oversized archives leave the current deck intact', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl); await page.getByTestId('new-blank').click();
    const id = await page.evaluate(() => window.__slideDesigns.deck().id);
    const cases = [Buffer.from('not a powerpoint file')];
    const invalid = await JSZip.loadAsync(await fixture()); invalid.file('ppt/presentation.xml', '<not-xml>'); cases.push(await invalid.generateAsync({ type: 'nodebuffer' }));
    const oversized = Buffer.from(await fixture()); const central = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); oversized.writeUInt32LE(200 * 1024 * 1024, central + 24); cases.push(oversized);
    for (const buffer of cases) {
      await page.getByTestId('open-json-input').setInputFiles({ name: 'bad.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer });
      await page.locator('.toast--error').last().waitFor();
      assert.equal(await page.evaluate(() => window.__slideDesigns.deck().id), id);
      await page.locator('.toast--error .toast__close').last().click();
    }
  });

  test('group transforms scale text and objects while non-widescreen slides keep their proportions', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl);
    const zip = await JSZip.loadAsync(await fixture());
    const source = await zip.file('ppt/slides/slide1.xml').async('string');
    const shape = source.match(/<p:sp>[\s\S]*?<\/p:sp>/)[0];
    const group = '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="900" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="1828800" y="914400"/><a:ext cx="4572000" cy="4572000"/><a:chOff x="0" y="0"/><a:chExt cx="9144000" cy="9144000"/></a:xfrm></p:grpSpPr>' + shape + '</p:grpSp>';
    zip.file('ppt/slides/slide1.xml', source.replace(shape, group));
    await openPptx(page, await zip.generateAsync({ type: 'nodebuffer' }));
    let deck = await page.evaluate(() => window.__slideDesigns.deck());
    const title = deck.slides[0].elements.find(el => el.type === 'text');
    assert(Math.abs(title.x - 240) < .1); assert(Math.abs(title.y - 144) < .1); assert(Math.abs(title.size - 28) < .1);
    const presentation = await zip.file('ppt/presentation.xml').async('string');
    zip.file('ppt/presentation.xml', presentation.replace(/<p:sldSz[^>]*\/>/, '<p:sldSz cx="9144000" cy="6858000"/>'));
    await openPptx(page, await zip.generateAsync({ type: 'nodebuffer' }), 'four-three.pptx', false);
    deck = await page.evaluate(() => window.__slideDesigns.deck());
    assert(deck.meta.importWarnings.some(message => message.includes('original aspect ratio')));
    assert(Math.abs(deck.slides[0].elements.find(el => el.type === 'text').x - 400) < .1);
  });

  test('charts and linked pictures produce persistent import notices without fetching external content', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    const picture = await writeImageFixture(page, dir + '/linked.png', { width: 100, height: 100, label: 'Local', colors: ['#112233', '#AABBCC'] });
    const zip = await JSZip.loadAsync(await fixture((pptx, cover, second) => {
      second.addImage({ path: picture, x: 1, y: 1, w: 2, h: 2 });
      second.addChart(pptx.ChartType.bar, [{ name: 'Revenue', labels: ['Q1', 'Q2'], values: [2, 4] }], { x: 4, y: 1, w: 6, h: 4 });
    }));
    const relPath = 'ppt/slides/_rels/slide2.xml.rels';
    const rels = await zip.file(relPath).async('string');
    zip.file(relPath, rels.replace(/(<Relationship[^>]*Type="[^"]*\/image"[^>]*Target=")[^"]+("[^>]*\/?>)/, '$1https://example.invalid/private-image.png$2').replace(/(<Relationship[^>]*Target="https:[^"]+")/, '$1 TargetMode="External"'));
    const requests = []; page.on('request', request => { if (request.url().includes('example.invalid')) requests.push(request.url()); });
    await openPptx(page, await zip.generateAsync({ type: 'nodebuffer' }));
    const deck = await page.evaluate(() => window.__slideDesigns.deck());
    assert(deck.meta.importWarnings.some(message => message.includes('Chart')));
    assert(deck.meta.importWarnings.some(message => message.includes('external or missing picture')));
    assert.equal(deck.slides[1].elements.filter(el => el.type === 'image' && el.missing).length, 2);
    assert.deepEqual(requests, []);
    await page.getByTestId('back-to-templates').click(); await page.reload();
    await page.getByRole('button', { name: 'Open External product review', exact: true }).click();
    await page.getByLabel('File menu', { exact: true }).click(); await page.getByTestId('import-details-open').click();
    assert(await page.getByTestId('import-details').getByText(/Chart was replaced/).isVisible());
  });

  test('cancelling a slow PowerPoint import leaves the current presentation untouched', async ({ page, baseUrl }) => {
    await page.addInitScript(() => {
      const original = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = async function () { await new Promise(resolve => setTimeout(resolve, 300)); const data = await original.call(this); window.importReadFinished = true; return data; };
    });
    await gotoGallery(page, baseUrl); await page.getByTestId('new-blank').click();
    const id = await page.evaluate(() => window.__slideDesigns.deck().id);
    await page.getByTestId('open-json-input').setInputFiles({ name: 'slow.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: await fixture() });
    await page.getByTestId('import-progress').getByRole('button', { name: 'Close dialog' }).click();
    await page.waitForFunction(() => window.importReadFinished === true);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__slideDesigns.deck().id), id);
    assert.equal(await page.getByTestId('import-details').count(), 0);
  });
}
