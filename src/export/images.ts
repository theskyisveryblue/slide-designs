import JSZip from 'jszip';
import { renderSlide, refreshOverflow } from '../render/render';
import { themeForSlide } from '../model/theme';
import type { Deck } from '../model/types';
import { rasterize } from './raster';
import { safeFilename } from './download';

export type ExportScale = 1 | 2;

export interface ImageExportOptions {
  deck: Deck;
  scale: ExportScale;
  onProgress?: (message: string) => void;
}

export interface ImageExportResult {
  files: { name: string; blob: Blob }[];
  zip: Blob;
  zipName: string;
  width: number;
  height: number;
}

/** Off-screen stage so exports never depend on editor zoom or scroll position. */
function createStage(width: number, height: number): HTMLElement {
  const stage = document.createElement('div');
  stage.className = 'export-stage';
  stage.dataset.testid = 'export-stage';
  Object.assign(stage.style, {
    position: 'fixed',
    top: '0',
    left: '-20000px',
    width: `${width}px`,
    height: `${height}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
    background: '#ffffff',
  });
  document.body.append(stage);
  return stage;
}

export async function exportImages({ deck, scale, onProgress }: ImageExportOptions): Promise<ImageExportResult> {
  const stage = createStage(deck.width, deck.height);
  const files: { name: string; blob: Blob }[] = [];
  try {
    for (const [index, slide] of deck.slides.entries()) {
      onProgress?.(`Rendering slide ${index + 1} of ${deck.slides.length}`);
      const canvas = renderSlide(slide, themeForSlide(slide, deck.family), { mode: 'export' });
      stage.replaceChildren(canvas);
      refreshOverflow(canvas);
      const blob = await rasterize(canvas, { width: deck.width, height: deck.height, scale });
      files.push({ name: `slide-${String(index + 1).padStart(2, '0')}.png`, blob });
    }
  } finally {
    stage.remove();
  }

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.blob);
  }
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        title: deck.title,
        family: deck.family,
        slides: files.length,
        width: deck.width,
        height: deck.height,
        scale,
        pixelWidth: deck.width * scale,
        pixelHeight: deck.height * scale,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    files,
    zip: zipBlob,
    zipName: safeFilename(deck.title, `${scale}x.zip`),
    width: deck.width * scale,
    height: deck.height * scale,
  };
}
