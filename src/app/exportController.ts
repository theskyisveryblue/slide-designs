import { exportHtml } from '../export/htmlExport';
import { exportImages, type ExportScale } from '../export/images';
import { exportPptx } from '../export/pptx';
import { formatBytes, safeFilename, saveBlob, saveText } from '../export/download';
import type { Store } from './store';
import { el } from '../ui/dom';
import { openModal } from '../ui/dialogs';
import { showToast } from '../ui/toast';

export type ExportKind = 'pptx' | 'html' | 'png1x' | 'png2x' | 'json';

export interface ExportOutcome {
  kind: ExportKind;
  filename: string;
  size: number;
  fallbacks: string[];
  detail: string;
}

const forcedFailures = new Set<ExportKind>();

/** Test-only hook so the error path is exercised through the real UI. */
export function forceExportError(kind: ExportKind | null): void {
  forcedFailures.clear();
  if (kind) forcedFailures.add(kind);
}

function assertNotForced(kind: ExportKind): void {
  if (forcedFailures.has(kind)) {
    forcedFailures.delete(kind);
    throw new Error(
      'Injected export failure: the renderer reported an unrecoverable element. Fix the slide and try again.',
    );
  }
}

export interface RunExportHooks {
  onProgress?: (message: string) => void;
}

export async function runExport(kind: ExportKind, store: Store, hooks: RunExportHooks = {}): Promise<ExportOutcome> {
  const deck = store.state.deck;
  assertNotForced(kind);
  if (!deck.slides.length) throw new Error('This deck has no slides to export.');

  if (kind === 'json') {
    const text = JSON.stringify(deck, null, 2);
    const filename = safeFilename(deck.title, 'json');
    saveText(text, filename);
    store.markDownloaded(deck);
    return { kind, filename, size: new Blob([text]).size, fallbacks: [], detail: 'Editable deck file downloaded. Open it from the workspace to continue editing.' };
  }

  if (kind === 'pptx') {
    hooks.onProgress?.('Writing native PowerPoint objects…');
    const result = await exportPptx({ deck, onProgress: hooks.onProgress });
    assertNotForced(kind);
    const filename = safeFilename(deck.title, 'pptx');
    saveBlob(result.blob, filename);
    return {
      kind,
      filename,
      size: result.blob.size,
      fallbacks: result.fallbacks,
      detail: `${result.slideCount} slides with native text, shapes, images and notes.`,
    };
  }

  if (kind === 'html') {
    hooks.onProgress?.('Bundling slides and navigation…');
    const blob = exportHtml({ deck });
    assertNotForced(kind);
    const filename = safeFilename(deck.title, 'html');
    saveBlob(blob, filename);
    return {
      kind,
      filename,
      size: blob.size,
      fallbacks: [],
      detail: 'Self-contained offline deck; no CDN or external asset references.',
    };
  }

  const scale: ExportScale = kind === 'png2x' ? 2 : 1;
  hooks.onProgress?.(`Rasterising ${deck.slides.length} slides at ${scale}×…`);
  const result = await exportImages({ deck, scale, onProgress: hooks.onProgress });
  assertNotForced(kind);
  saveBlob(result.zip, result.zipName);
  return {
    kind,
    filename: result.zipName,
    size: result.zip.size,
    fallbacks: [],
    detail: `${result.files.length} PNGs at ${result.width}×${result.height}, plus manifest.json.`,
  };
}

export function runExportWithFeedback(kind: ExportKind, store: Store): void {
  const status = el('p', { className: 'export-status', dataset: { testid: 'export-status' }, text: 'Preparing export…' });
  const progress = el('div', { className: 'progress' }, [el('div', { className: 'progress__bar' })]);
  const bar = progress.firstElementChild as HTMLElement;
  let step = 0;
  const body = el('div', {}, [status, progress]);
  const modal = openModal({
    title: 'Exporting deck',
    description: 'Every export runs locally in this browser tab.',
    body,
    testid: 'export-progress',
    width: 520,
  });

  void runExport(kind, store, {
    onProgress: (message) => {
      status.textContent = message;
      step += 1;
      bar.style.width = `${Math.min(95, step * 18)}%`;
    },
  })
    .then((outcome) => {
      bar.style.width = '100%';
      modal.close();
      const detail = [`${outcome.filename} · ${formatBytes(outcome.size)}`, outcome.detail];
      if (outcome.fallbacks.length) {
        detail.push(`${outcome.fallbacks.length} disclosed fallback(s).`);
        for (const fallback of outcome.fallbacks) detail.push(`• ${fallback}`);
      }
      showToast(detail.join(' '), 'success', 9000);
    })
    .catch((error: unknown) => {
      modal.close();
      showToast(actionableMessage(kind, error), 'error', 14000);
    });
}

export function actionableMessage(kind: ExportKind, error: unknown): string {
  const base = error instanceof Error ? error.message : String(error);
  const advice: Record<ExportKind, string> = {
    pptx: 'PowerPoint export could not finish. Check that every image is loaded, then retry.',
    html: 'HTML export could not finish. Retry, or save the deck as JSON and export from a fresh tab.',
    png1x: 'PNG export could not finish. Retry, or use the 2× option if only one resolution is affected.',
    png2x: 'The 2× PNG export uses more memory. Close other tabs or retry at 1×.',
    json: 'Saving JSON failed. Check that your browser allows downloads from this page.',
  };
  return `${advice[kind]} Details: ${base}`;
}
