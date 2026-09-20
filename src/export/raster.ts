/** Rasterisation that reuses the shared DOM renderer instead of a second layout engine. */

export async function waitForAssets(root: HTMLElement): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
  }
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async (img) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        img.decode(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Image loading timed out. Replace the image and retry.')), 8000); }),
      ]);
      if (!img.naturalWidth) throw new Error('Image has no decoded pixels.');
    } catch {
      throw new Error('An image could not be decoded. Replace it before exporting.');
    } finally { clearTimeout(timer); }
  }));
}

export interface RasterOptions {
  width: number;
  height: number;
  scale: number;
}

export async function rasterize(node: HTMLElement, { width, height, scale }: RasterOptions): Promise<Blob> {
  await waitForAssets(node);
  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  clone.style.margin = '0';
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const markup = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject></svg>`;

  // Inline the SVG to avoid Chrome's tainted-canvas behavior for blob-backed
  // foreignObject images. All embedded image assets have been decoded above.
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable in this browser.');
  context.imageSmoothingQuality = 'high';
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser could not encode a PNG for this slide.'));
    }, 'image/png');
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'sync';
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          'The browser refused to rasterise this slide. This usually means an image could not be decoded.',
        ),
      );
    image.src = src;
  });
}
