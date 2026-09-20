import { inspectPptx } from '../inspectPptx.mjs';
import {
  attachDiagnostics,
  artifactPath,
  ensureDir,
  expect,
  gotoGallery,
  saveDownload,
  startDemoDeck,
  uploadFile,
  waitForEditorSync,
  writeImageFixture,
} from '../helpers.mjs';

export default function register(test) {
  test('PPTX export contains native editable objects, notes, images and slide order', async ({ page, baseUrl, dir }) => {
    const errors = attachDiagnostics(page);
    await ensureDir(dir);
    await gotoGallery(page, baseUrl);
    await startDemoDeck(page);

    const portrait = await writeImageFixture(page, artifactPath(dir, 'portrait.png'), {
      width: 300,
      height: 900,
      label: 'PORTRAIT',
      colors: ['#2F6B52', '#D8FF3E'],
    });

    const stageImages = page.locator('[data-testid="editor-stage"] .slide-canvas [data-kind="image"]');
    // Insert an image through the inspector, then export through the toolbar.
    await page.locator('[data-testid="thumb-3"]').click();
    const before = await stageImages.count();
    await page.getByTestId('toolbar-image-upload').setInputFiles(portrait);
    await waitForEditorSync(page);
    expect.equal(await stageImages.count(), before + 1, 'the inserted image is on the canvas');

    const pptxPath = artifactPath(dir, 'deck.pptx');
    await page.locator('[data-testid="open-export"]').click();
    await saveDownload(page, () => page.locator('[data-testid="export-pptx"]').click(), pptxPath);
    await page.locator('.toast--success').first().waitFor({ state: 'visible', timeout: 180000 });
    await page.screenshot({ path: artifactPath(dir, 'pptx-toast.png') });

    const report = await inspectPptx(pptxPath);
    expect.equal(report.slideCount, 9, 'nine slides in the package');
    expect.equal(report.notesCount, 9, 'a notes slide per slide');
    expect.equal(report.pageWidthEmu, 12192000, '13.333in page width in EMU');
    expect.equal(report.pageHeightEmu, 6858000, '7.5in page height in EMU');
    expect.ok(report.mediaCount >= 1, 'at least one embedded image');

    const cover = report.slides[0];
    expect.ok(cover.texts.join(' ').includes('Good ideas deserve'), 'cover headline is native text');
    expect.ok(cover.texts.join(' ').includes('FIELDNOTES'), 'cover kicker is native text');
    expect.ok(cover.presets.length > 0, 'cover uses native autoshapes');

    const imageSlide = report.slides[3];
    expect.ok(imageSlide.pictureCount >= 1, 'image layout has a native picture');
    expect.ok(imageSlide.texts.length > 0, 'image slide keeps native text');

    for (const slide of report.slides) {
      expect.ok(slide.texts.length > 0, `${slide.name} has editable text, not a flattened bitmap`);
      expect.equal(slide.hasFullBleedPicture, false, `${slide.name} is not a full-bleed rasterised picture`);
    }

    expect.ok(report.notes[0].includes('Open with the promise'), 'cover speaker notes are exported');
    expect.ok(report.notes[8].length > 0, 'closing speaker notes are exported');
    expect.equal(report.hasContentTypesOverride, true, 'package declares slide content types');
    expect.deepEqual(errors, []);
  });
}
