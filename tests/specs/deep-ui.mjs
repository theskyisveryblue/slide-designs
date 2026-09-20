import assert from 'node:assert/strict';
import { attachDiagnostics, gotoGallery, saveDownload } from '../helpers.mjs';

export default function register(test) {
  test('appearance synchronizes across tabs without modifying their decks', async ({ page, context, baseUrl }) => {
    await gotoGallery(page, baseUrl);
    await page.getByTestId('new-blank').click();
    const deck = await page.evaluate(() => window.__slideDesigns.deck());
    const second = await context.newPage();
    await second.emulateMedia({ colorScheme: 'dark' });
    await second.goto(baseUrl);
    await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
    await second.waitForFunction(() => document.documentElement.dataset.appearance === 'dark');
    assert.equal(await second.getByLabel('Appearance', { exact: true }).inputValue(), 'dark');
    await second.getByLabel('Appearance', { exact: true }).selectOption('light');
    await page.waitForFunction(() => document.documentElement.dataset.appearance === 'light');
    await page.getByLabel('Appearance', { exact: true }).selectOption('system');
    await second.waitForFunction(() => document.documentElement.dataset.appearance === 'dark');
    assert.equal(await second.getByLabel('Appearance', { exact: true }).inputValue(), 'system');
    assert.deepEqual(await page.evaluate(() => window.__slideDesigns.deck()), deck);
  });

  test('blocked storage keeps appearance usable and offers recovery of unsaved work', async ({ page, baseUrl, dir }) => {
    const errors = attachDiagnostics(page);
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(baseUrl);
    await page.getByLabel('Appearance', { exact: true }).selectOption('light');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.appearance), 'light');
    await page.getByText(/Appearance changed for this session/).waitFor();
    await page.getByTestId('new-blank').click();
    await page.getByTestId('tool-text').click();
    await page.keyboard.insertText('Keep this work');
    await page.keyboard.press('Escape');
    await page.getByTestId('back-to-templates').click();
    assert(await page.getByTestId('editor-stage').isVisible());
    await saveDownload(page, () => page.keyboard.press('ControlOrMeta+s'), dir + '/recovered.json');
    await page.getByTestId('back-to-templates').click();
    assert(await page.getByTestId('new-blank').isVisible());
    assert.deepEqual(errors, []);
  });

  test('export dialog traps keyboard focus around visible controls and returns it to Export', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl);
    await page.getByTestId('new-blank').click();
    await page.getByTestId('open-export').click();
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press('Tab');
      assert(await page.getByTestId('export-dialog').evaluate(node => node.contains(document.activeElement)), 'Tab must stay inside the dialog');
    }
    await page.getByTestId('export-images-options').focus();
    await page.keyboard.press('Enter');
    assert(await page.getByTestId('export-png-1x').isVisible());
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press('Shift+Tab');
      assert(await page.getByTestId('export-dialog').evaluate(node => node.contains(document.activeElement)), 'Shift+Tab must stay inside the dialog');
    }
    await page.keyboard.press('Escape');
    assert(await page.getByTestId('open-export').evaluate(node => node === document.activeElement));
    const decision = page.evaluate(async () => {
      const { confirmDialog } = await import('/src/ui/dialogs.ts');
      return confirmDialog('Keep this presentation?', 'Remove');
    });
    await page.getByTestId('confirm-dialog').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await decision, false, 'dismissing a confirmation must settle as cancellation');
  });

  test('keyboard-only formatting keeps focus and applies each command once', async ({ page, baseUrl }) => {
    await gotoGallery(page, baseUrl);
    await page.getByTestId('new-blank').click();
    await page.getByTestId('tool-text').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('Keyboard editing');
    await page.keyboard.press('Escape');
    await page.getByTestId('text-content').focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('Edited without the mouse');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Bold');
    await page.keyboard.press('Space');
    assert.equal(await page.getByRole('button', { name: 'Bold', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Italic');
    await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('button', { name: 'Italic', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByTestId('text-content').inputValue(), 'Edited without the mouse');
  });

  test('editor and dialogs fit 320px, tablet and short desktop viewports in both appearances', async ({ page, baseUrl, dir }) => {
    await gotoGallery(page, baseUrl);
    await page.getByTestId('new-blank').click();
    for (const appearance of ['light', 'dark']) {
      await page.getByLabel('Appearance', { exact: true }).selectOption(appearance);
      for (const [width, height] of [[320, 640], [768, 1024], [1024, 600]]) {
        await page.setViewportSize({ width, height });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${appearance} ${width}: page overflow`);
        await page.getByTestId('open-export').click();
        const box = await page.getByTestId('export-dialog').boundingBox();
        assert(box.x >= 0 && box.x + box.width <= width, `${width}: dialog horizontal bounds`);
        await page.screenshot({ path: `${dir}/${appearance}-${width}.png` });
        await page.keyboard.press('Escape');
      }
    }
  });
}
