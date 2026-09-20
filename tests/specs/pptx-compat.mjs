import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { gotoGallery, saveDownload } from '../helpers.mjs';

async function download(page, target) {
  await page.getByTestId('open-export').click();
  await saveDownload(page, () => page.getByTestId('export-pptx').click(), target);
  return JSZip.loadAsync(await readFile(target));
}

async function xmlParts(page, zip) {
  const parts = {};
  for (const [name, file] of Object.entries(zip.files)) if (/\.(xml|rels)$/.test(name)) parts[name] = await file.async('string');
  const errors = await page.evaluate(parts => Object.entries(parts).flatMap(([name, xml]) => {
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    if (parsed.querySelector('parsererror')) return [name];
    return Array.from(parsed.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'p')).flatMap(paragraph => {
      const properties = Array.from(paragraph.children).filter(node => node.localName === 'pPr');
      return properties.length > 1 || (properties.length && paragraph.firstElementChild !== properties[0]) ? [name + ': invalid paragraph properties'] : [];
    });
  }), parts);
  assert.deepEqual(errors, [], 'all OOXML parts must parse');
  for (const [name, xml] of Object.entries(parts)) {
    if (!name.endsWith('.rels')) continue;
    const relationships = await page.evaluate(xml => Array.from(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Relationship')).map(node => ({ target: node.getAttribute('Target'), mode: node.getAttribute('TargetMode') })), xml);
    const parent = name === '_rels/.rels' ? '' : path.posix.dirname(path.posix.dirname(name));
    for (const rel of relationships) {
      if (rel.mode === 'External') continue;
      const target = rel.target.startsWith('/') ? rel.target.slice(1) : path.posix.normalize(path.posix.join(parent, rel.target));
      assert(zip.file(target), `${name} references missing part ${target}`);
    }
  }
  return parts;
}

export default function register(test) {
  test('WebP pictures become native PNG pictures supported by office readers', async ({ page, baseUrl }) => {
    await page.goto(baseUrl);
    const bytes = await page.evaluate(async () => {
      const { exportPptx } = await import('/src/export/pptx.ts');
      const { createDeck, createSlide, createImage } = await import('/src/model/deck.ts');
      const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#3080C0'; ctx.fillRect(0, 0, 200, 100);
      const result = await exportPptx({ deck: createDeck('WebP', 'editorial', [createSlide({ elements: [createImage({ src: canvas.toDataURL('image/webp'), alt: 'Blue rectangle' })] })]) });
      return { bytes: Array.from(new Uint8Array(await result.blob.arrayBuffer())), fallbacks: result.fallbacks };
    });
    assert(bytes.fallbacks.some(message => message.includes('converted to PNG')));
    const zip = await JSZip.loadAsync(Uint8Array.from(bytes.bytes));
    const media = Object.values(zip.files).filter(file => file.name.startsWith('ppt/media/') && !file.dir);
    assert.equal(media.length, 1);
    assert.equal((await media[0].async('nodebuffer')).readUInt32BE(0), 0x89504e47);
    assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /<p:pic>/);
  });
  test('all 27 layouts export well-formed, fully linked PowerPoint packages', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    for (const [family, label] of [['editorial', 'Editorial'], ['bold', 'Bold Studio'], ['product', 'Clean Product']]) {
      await page.getByRole('button', { name: `Create presentation from ${label}`, exact: true }).click();
      const slides = await page.evaluate(() => window.__slideDesigns.deck().slides);
      const zip = await download(page, `${dir}/${family}.pptx`);
      const parts = await xmlParts(page, zip);
      assert.equal(Object.keys(parts).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length, 9);
      for (let i = 1; i <= 9; i++) {
        const xml = parts[`ppt/slides/slide${i}.xml`];
        assert.match(xml, /<a:t>[^<]+<\/a:t>/);
        const items = slides[i - 1].elements.filter(el => el.type === 'text' && el.list === 'bullet').reduce((total, el) => total + el.runs.map(run => run.text).join('\n').split('\n').filter(line => line.trim()).length, 0);
        assert.equal((xml.match(/<a:buChar/g) || []).length, items, `${family} slide ${i}: every list item keeps its own bullet`);
      }
      await page.getByTestId('back-to-templates').click();
    }
  });

  test('PowerPoint preserves multiline Unicode, uppercase lists, rotated lines and transparency', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    await page.getByTestId('new-blank').click();
    const deck = await page.evaluate(async () => {
      const { createDeck, createSlide, createText, createShape } = await import('/src/model/deck.ts');
      return createDeck('Compatibility — Café & 東京', 'editorial', [createSlide({
        name: 'Formatting', notes: 'Notes: <safe> & résumé — 東京', background: 'FFFFFF',
        elements: [
          createText({ x: 60, y: 40, w: 1000, h: 130, size: 40, runs: [{ text: 'Café & <ideas>\n' }, { text: '東京 — deuxième ligne', bold: true, color: '3050A0' }] }),
          createText({ x: 80, y: 220, w: 520, h: 260, size: 30, list: 'number', caps: true, text: 'first action\nsecond action\nthird action' }),
          createShape({ shape: 'line', x: 740, y: 350, w: 250, h: 2, line: 'FF0000', lineWidth: 8, rotation: 30, opacity: .4 }),
          createShape({ shape: 'ellipse', x: 800, y: 500, w: 120, h: 90, fill: '0000FF', opacity: .5 }),
        ],
      })]);
    });
    await page.getByTestId('open-json-input').setInputFiles({ name: 'formatting.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(deck)) });
    await page.waitForFunction(() => window.__slideDesigns.deck().title.startsWith('Compatibility'));
    const zip = await download(page, dir + '/formatting.pptx');
    const parts = await xmlParts(page, zip);
    const xml = parts['ppt/slides/slide1.xml'];
    assert.match(xml, /Café &amp; &lt;ideas&gt;/);
    assert.match(xml, /東京 — deuxième ligne/);
    assert.match(xml, /<a:br[\s/>]/, 'hard newline becomes a line break');
    assert.match(xml, /FIRST ACTION/);
    assert.match(xml, /SECOND ACTION/);
    assert.match(xml, /THIRD ACTION/);
    assert.equal((xml.match(/<a:buAutoNum/g) || []).length, 3);
    const line = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g).find(shape => shape.includes('prst="line"'));
    assert.match(line, /rot="1800000"/, 'line keeps its 30 degree rotation');
    assert.match(line, /<a:alpha val="40000"/, 'line keeps its opacity');
    assert.match(xml, /<a:alpha val="50000"/, 'ellipse keeps its opacity');
    assert.match(parts['ppt/notesSlides/notesSlide1.xml'], /&lt;safe&gt; &amp; résumé — 東京/);
  });

  test('PowerPoint export recovers after a corrupt image without losing the current deck', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    await page.getByTestId('new-blank').click();
    const id = await page.evaluate(() => window.__slideDesigns.deck().id);
    const deck = await page.evaluate(async () => {
      const { createImage } = await import('/src/model/deck.ts');
      const deck = window.__slideDesigns.deck();
      deck.slides[0].elements.push(createImage({ src: 'data:image/png;base64,bm90IGFuIGltYWdl', alt: 'Broken image' }));
      return deck;
    });
    await page.getByTestId('open-json-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(deck)) });
    await page.locator('.canvas-host [data-kind=image]').waitFor();
    await page.getByTestId('open-export').click();
    await page.getByTestId('export-pptx').click();
    await page.getByText(/could not finish/i).waitFor();
    assert.equal(await page.evaluate(() => window.__slideDesigns.deck().id), id);
    await page.locator('.canvas-host [data-kind=image]').click();
    await page.getByTestId('delete-element').click();
    await page.getByTestId('tool-text').click();
    await page.keyboard.insertText('Recovered export');
    await page.keyboard.press('Escape');
    const zip = await download(page, dir + '/recovered.pptx');
    assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /Recovered export/);
  });
}
