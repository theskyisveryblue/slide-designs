import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const appUrl = (baseUrl, route = '/') => new URL(route, baseUrl).href;

export function attachDiagnostics(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

export async function gotoGallery(page, baseUrl, { clearStorage = true } = {}) {
  await page.goto(appUrl(baseUrl));
  if (clearStorage) {
    await page.evaluate(() => {
      try {
        window.localStorage.clear();
      } catch {
        /* ignore */
      }
    });
  }
  await page.locator('[data-testid="start-demo"]').waitFor({ state: 'visible' });
}

export async function startDemoDeck(page) {
  await page.locator('[data-testid="start-demo"]').click();
  await page.locator('[data-testid="editor-stage"]').waitFor({ state: 'visible' });
  await waitForEditorSync(page);
}

export async function waitForEditorSync(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

export async function slideCount(page) {
  return page.evaluate(() => window.__slideDesigns.deck().slides.length);
}

export async function goToSlide(page, index) {
  await page.locator(`[data-testid="thumb-${index}"]`).click();
  await waitForEditorSync(page);
}

export async function selectElement(page, index = 0) {
  await page.locator('.slide-canvas [data-kind]').nth(index).click();
  await waitForEditorSync(page);
}

export async function saveDownload(page, trigger, targetPath, timeout = 120000) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout }), trigger()]);
  await download.saveAs(targetPath);
  return targetPath;
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
  return dir;
}

export function pngDimensions(buffer) {
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, 'PNG signature');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Mean absolute RGB difference (0-255) between two PNG buffers, computed in the browser. */
export async function pixelDifference(page, bufferA, bufferB) {
  return page.evaluate(
    async ([a, b]) => {
      function decode(base64) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('decode failed'));
          image.src = 'data:image/png;base64,' + base64;
        });
      }
      const [imageA, imageB] = await Promise.all([decode(a), decode(b)]);
      if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
        return { mean: 255, widthA: imageA.width, heightA: imageA.height, widthB: imageB.width, heightB: imageB.height };
      }
      const canvas = document.createElement('canvas');
      canvas.width = imageA.width;
      canvas.height = imageA.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(imageA, 0, 0);
      const dataA = context.getImageData(0, 0, canvas.width, canvas.height).data;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(imageB, 0, 0);
      const dataB = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0;
      let count = 0;
      for (let i = 0; i < dataA.length; i += 4) {
        total += Math.abs(dataA[i] - dataB[i]);
        total += Math.abs(dataA[i + 1] - dataB[i + 1]);
        total += Math.abs(dataA[i + 2] - dataB[i + 2]);
        count += 3;
      }
      return { mean: total / count, widthA: imageA.width, heightA: imageA.height };
    },
    [bufferA.toString('base64'), bufferB.toString('base64')],
  );
}

/** Decode a PNG in the browser and summarise its content. */
export async function pngStats(page, buffer) {
  return page.evaluate(async (base64) => {
    const image = await new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error('decode failed'));
      node.src = 'data:image/png;base64,' + base64;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const seen = new Set();
    let luma = 0;
    let sample = 0;
    for (let i = 0; i < data.length; i += 4) {
      seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      if (data[i + 3] > 0) {
        luma += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        sample += 1;
      }
    }
    return { width: image.width, height: image.height, uniqueColors: seen.size, meanLuma: luma / Math.max(1, sample) };
  }, buffer.toString('base64'));
}

/** Generate synthetic local fixtures (portrait + landscape + wide) with the browser. */
export async function writeImageFixture(page, targetPath, { width, height, label, colors }) {
  const dataUrl = await page.evaluate(
    ([w, h, text, palette]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d');
      const gradient = context.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, palette[0]);
      gradient.addColorStop(1, palette[1]);
      context.fillStyle = gradient;
      context.fillRect(0, 0, w, h);
      context.fillStyle = 'rgba(255,255,255,0.86)';
      context.font = `${Math.round(Math.min(w, h) / 8)}px Helvetica, Arial, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, w / 2, h / 2);
      return canvas.toDataURL('image/png');
    },
    [width, height, label, colors],
  );
  await writeFile(targetPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return targetPath;
}

export async function uploadFile(page, selector, filePath) {
  await page.locator(selector).setInputFiles(filePath);
  await waitForEditorSync(page);
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export function artifactPath(dir, ...parts) {
  return path.join(dir, ...parts);
}

export const expect = assert;
