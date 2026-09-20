import assert from 'node:assert/strict';
import { gotoGallery, saveDownload } from '../helpers.mjs';

export default function register(test) {
  test('workspace creates a blank deck, previews the saved draft and opens deck files', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    assert(await page.getByTestId('workspace-dashboard').isVisible());
    assert(!(await page.getByTestId('template-library').isVisible()));
    await page.getByTestId('new-blank').click();
    const blank = await page.evaluate(() => window.__slideDesigns.deck());
    assert.equal(blank.title, 'Untitled presentation');
    assert.equal(blank.slides.length, 1);
    assert.equal(blank.slides[0].elements.length, 0);
    await page.getByTestId('deck-title').fill('Quarterly review');
    await page.getByTestId('deck-title').press('Tab');
    await page.getByTestId('tool-text').click();
    await page.getByTestId('text-content').fill('A saved draft to resume');
    await page.getByTestId('text-content').press('Tab');
    const filename = dir + '/workspace-deck.json';
    await saveDownload(page, async () => { await page.getByLabel('File menu', { exact: true }).click(); await page.getByTestId('save-json').click(); }, filename);
    await page.getByTestId('back-to-templates').click();
    assert.match(await page.getByTestId('restore-autosave').textContent(), /Quarterly review/);
    assert.match(await page.getByTestId('restore-autosave').textContent(), /A saved draft to resume/);
    await page.screenshot({ path: dir + '/saved-draft.png' });
    await page.reload();
    await page.getByTestId('restore-autosave').click();
    assert.equal((await page.evaluate(() => window.__slideDesigns.deck())).id, blank.id);
    await page.getByTestId('back-to-templates').click();
    await page.getByTestId('gallery-open-input').setInputFiles(filename);
    await page.getByTestId('editor-stage').waitFor();
    assert.equal(await page.getByTestId('deck-title').inputValue(), 'Quarterly review');
  });

  test('template library search, family filters and narrow-screen navigation work', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    await page.getByTestId('browse-templates').click();
    assert(await page.getByTestId('template-library').isVisible());
    assert.equal(await page.locator('.tile:visible').count(), 27);
    await page.getByTestId('filter-product').click();
    assert.equal(await page.locator('.tile:visible').count(), 9);
    await page.getByTestId('template-search').fill('metrics');
    assert.equal(await page.locator('.tile:visible').count(), 1);
    assert(await page.getByTestId('tile-product-metrics').isVisible());
    await page.getByTestId('template-search').fill('no-match');
    assert.equal(await page.locator('.tile:visible').count(), 0);
    assert(await page.getByText('No layouts match your search.', { exact: false }).isVisible());
    await page.getByTestId('template-search').fill('');
    await page.getByTestId('filter-all').click();
    await page.screenshot({ path: dir + '/template-library.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('nav-workspace').click();
    assert(await page.getByTestId('new-blank').isVisible());
    await page.screenshot({ path: dir + '/mobile-workspace.png', fullPage: true });
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    assert(await fits());
    await page.getByTestId('nav-templates').click();
    assert(await fits());
    await page.getByTestId('filter-bold').click();
    await page.getByTestId('tile-bold-quote').click();
    const deck = await page.evaluate(() => window.__slideDesigns.deck());
    assert.equal(deck.family, 'bold');
    assert.equal(deck.slides[0].layout, 'quote');
    assert.equal(deck.slides.length, 1);
  });
}
