import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { attachDiagnostics, gotoGallery, saveDownload, pixelDifference } from '../helpers.mjs';

async function theme(page, value) {
  await page.waitForFunction(expected => document.documentElement.dataset.appearance === expected, value);
}

async function contrast(page, selector) {
  const ratios = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
    const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luma = color => rgb(color).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    const style = getComputedStyle(node);
    let background = style.backgroundColor;
    for (let parent = node.parentElement; background === 'rgba(0, 0, 0, 0)' && parent; parent = parent.parentElement) background = getComputedStyle(parent).backgroundColor;
    const a = luma(style.color), b = luma(background);
    return { text: node.textContent, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
  }));
  assert(ratios.length > 0);
  for (const entry of ratios) assert(entry.ratio >= 4.5, `${entry.text}: contrast ${entry.ratio}`);
}

export default function register(test) {
  test('appearance follows the system, remembers explicit choices and stays usable on small screens', async ({ page, baseUrl, dir }) => {
    const errors = attachDiagnostics(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await gotoGallery(page, baseUrl);
    await theme(page, 'dark');
    assert.equal(await page.getByLabel('Appearance', { exact: true }).inputValue(), 'system');
    await contrast(page, '.workspace-actions .btn, .workspace-nav, .appearance-select');
    await page.screenshot({ path: dir + '/workspace-dark.png' });
    await page.emulateMedia({ colorScheme: 'light' });
    await theme(page, 'light');
    await contrast(page, '.workspace-actions .btn, .workspace-nav, .appearance-select');
    await page.getByLabel('Appearance', { exact: true }).selectOption('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await theme(page, 'light');
    assert.equal(await page.getByLabel('Appearance', { exact: true }).inputValue(), 'light');
    await page.getByTestId('new-blank').click();
    await page.getByTestId('deck-title').fill('Quarterly product review');
    await page.getByTestId('deck-title').press('Tab');
    await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
    await contrast(page, '.editor__bar-actions .btn, .appearance-select');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: dir + '/editor-mobile-dark.png' });
    assert(await page.getByTestId('deck-title').evaluate(node => node.getBoundingClientRect().width >= 150));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const controls = await page.locator('.editor__bar .appearance-control, .editor__bar-actions').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
    assert(controls[0].right <= controls[1].left);
    await page.getByTestId('back-to-templates').click();
    await page.reload();
    await theme(page, 'dark');
    assert.equal(await page.getByLabel('Appearance', { exact: true }).inputValue(), 'dark');
    await page.getByLabel('Appearance', { exact: true }).selectOption('system');
    await page.emulateMedia({ colorScheme: 'light' });
    await theme(page, 'light');
    assert.deepEqual(errors, []);
  });

  test('new text accepts typing immediately and the first formatting click commits sidebar edits', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl);
    await page.getByTestId('new-blank').click();
    await page.getByTestId('tool-text').click();
    assert(await page.getByTestId('inline-editor').evaluate(node => node === document.activeElement));
    await page.keyboard.insertText('Start typing right away');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByTestId('text-content').inputValue(), 'Start typing right away');
    await page.getByTestId('text-content').fill('One click is enough');
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Bold', exact: true }).getAttribute('aria-pressed'), 'true');
    const text = await page.evaluate(() => window.__slideDesigns.deck().slides[0].elements[0]);
    assert.equal(text.runs.map(run => run.text).join(''), 'One click is enough');
    assert.equal(text.weight, 700);
    await page.getByTestId('text-content').fill('Keep this edit when changing fonts');
    await page.getByLabel('Font', { exact: true }).click();
    assert(await page.getByLabel('Font', { exact: true }).evaluate(node => node === document.activeElement));
    await page.keyboard.press('Escape');
    await page.getByLabel('Font', { exact: true }).selectOption('mono');
    await page.getByLabel('Font', { exact: true }).press('Tab');
    const updated = await page.evaluate(() => window.__slideDesigns.deck().slides[0].elements[0]);
    assert.equal(updated.font, 'mono');
    assert.equal(updated.runs.map(run => run.text).join(''), 'Keep this edit when changing fonts');
  });

  test('light and dark chrome produce identical slide pixels and leave deck data unchanged', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    await page.getByTestId('new-blank').click();
    await page.getByTestId('tool-text').click();
    await page.keyboard.insertText('The same slide in every appearance');
    await page.keyboard.press('Escape');
    const original = await page.evaluate(() => window.__slideDesigns.deck());
    const images = [];
    for (const appearance of ['light', 'dark']) {
      await page.getByLabel('Appearance', { exact: true }).selectOption(appearance);
      await page.getByTestId('open-export').click();
      await page.getByTestId('export-images-options').click();
      const target = dir + '/' + appearance + '.zip';
      await saveDownload(page, () => page.getByTestId('export-png-1x').click(), target);
      const zip = await JSZip.loadAsync(await readFile(target));
      images.push(await zip.file(Object.keys(zip.files).find(name => name.endsWith('.png'))).async('nodebuffer'));
    }
    assert.deepEqual(await page.evaluate(() => window.__slideDesigns.deck()), original);
    assert.equal((await pixelDifference(page, ...images)).mean, 0);
  });
}
