import assert from 'node:assert/strict';
import { gotoGallery } from '../helpers.mjs';

async function nameDeck(page, title) {
  await page.getByTestId('deck-title').fill(title);
  await page.getByTestId('deck-title').press('Tab');
}

export default function register(test) {
  test('multiple presentations survive new-deck creation, reopening and removal', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    await page.getByTestId('new-blank').click();
    await nameDeck(page, 'Project Alpha');
    const alpha = await page.evaluate(() => window.__slideDesigns.deck().id);
    await page.getByTestId('back-to-templates').click();
    await page.getByTestId('new-blank').click();
    await nameDeck(page, 'Project Beta');
    await page.getByTestId('back-to-templates').click();
    await page.reload();
    assert.equal(await page.locator('.saved-deck').count(), 2);
    await page.screenshot({ path: dir + '/presentations.png' });
    await page.getByRole('button', { name: 'Open Project Alpha', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__slideDesigns.deck().id), alpha);
    await page.getByTestId('back-to-templates').click();
    await page.getByLabel('Options for Project Beta', { exact: true }).click();
    await page.getByRole('button', { name: 'Remove from device', exact: true }).click();
    await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Remove presentation', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.saved-deck').length === 1);
    await page.reload();
    assert.equal(await page.locator('.saved-deck').count(), 1);
    assert(await page.getByRole('button', { name: 'Open Project Alpha', exact: true }).isVisible());
  });

  test('previous drafts migrate and failed saves preserve every existing presentation', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl);
    const oldId = await page.evaluate(async () => {
      const { createDeckFromTemplate } = await import('/src/templates/index.ts');
      const deck = createDeckFromTemplate('bold'); deck.title = 'Previous draft';
      localStorage.setItem('slide-designs:autosave:v1', JSON.stringify({ deck, savedAt: new Date().toISOString() }));
      return deck.id;
    });
    await page.reload();
    assert(await page.getByRole('button', { name: 'Open Previous draft', exact: true }).isVisible());
    await page.getByTestId('new-blank').click();
    await page.getByTestId('back-to-templates').click();
    const stored = await page.evaluate(() => localStorage.getItem('slide-designs:library:v1'));
    assert.equal(JSON.parse(stored).decks.length, 2);
    assert(JSON.parse(stored).decks.some(entry => entry.deck.id === oldId));
    assert.equal(await page.evaluate(() => localStorage.getItem('slide-designs:autosave:v1')), null);
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
    await page.getByTestId('new-blank').click();
    assert.match(await page.getByTestId('save-status').textContent(), /Not saved/);
    assert.equal(await page.evaluate(() => localStorage.getItem('slide-designs:library:v1')), stored);
  });

  test('text essentials stay visible, detailed controls remember expansion, exports offer three formats', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    await page.getByTestId('new-blank').click();
    await page.getByTestId('tool-text').click();
    await page.getByTestId('text-content').fill('Make ideas easy to share.');
    await page.getByTestId('text-content').press('Tab');
    assert(await page.getByLabel('Font', { exact: true }).isVisible());
    assert(await page.getByLabel('Size', { exact: true }).isVisible());
    assert(!(await page.getByLabel('Letter spacing', { exact: true }).isVisible()));
    assert(!(await page.getByLabel('X', { exact: true }).isVisible()));
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Bold', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Italic', exact: true }).click();
    const text = await page.evaluate(() => window.__slideDesigns.deck().slides[0].elements[0]);
    assert.equal(text.weight, 700); assert.equal(text.italic, true);
    await page.screenshot({ path: dir + '/simple-inspector.png' });
    await page.getByText('More text options', { exact: true }).click();
    await page.getByLabel('Letter spacing', { exact: true }).fill('1.5');
    await page.getByLabel('Letter spacing', { exact: true }).press('Tab');
    assert(await page.getByLabel('Letter spacing', { exact: true }).isVisible());
    assert.equal(await page.getByLabel('Letter spacing', { exact: true }).inputValue(), '1.5');
    await page.getByTestId('open-export').click();
    const dialog = page.getByTestId('export-dialog');
    assert.equal(await dialog.locator('.export-list > .export-option').count(), 2);
    assert(await page.getByTestId('export-images-options').isVisible());
    assert(!(await page.getByTestId('export-png-1x').isVisible()));
    await page.screenshot({ path: dir + '/simple-export.png' });
    await page.getByTestId('export-images-options').click();
    assert(await page.getByTestId('export-png-1x').isVisible());
    assert(await page.getByTestId('export-png-2x').isVisible());
  });
}
