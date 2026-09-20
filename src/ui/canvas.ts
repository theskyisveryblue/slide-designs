import { getTheme, themeForSlide } from '../model/theme';
import { createImage } from '../model/deck';
import { newId } from '../model/id';
import type { SlideElement, TextElement } from '../model/types';
import { refreshOverflow, renderSlide, type OverflowReport } from '../render/render';
import type { Store } from '../app/store';
import { el } from './dom';
import { showToast } from './toast';

export interface CanvasHandle {
  element: HTMLElement;
  render(): void;
  updateOverlay(): void;
  flush(): void;
  editSelectedText(): void;
  zoomTo(zoom: number): void;
}

type DragMode = 'move' | 'resize' | 'none';

interface DragState {
  mode: DragMode;
  handle: string;
  startX: number;
  startY: number;
  origin: Map<string, { x: number; y: number; w: number; h: number }>;
  batchOpen: boolean;
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

export function createCanvas(store: Store, onOverflow: (report: OverflowReport) => void): CanvasHandle {
  const host = el('div', { className: 'canvas-host' });
  const overlay = el('div', { className: 'canvas-overlay', 'aria-hidden': 'true' });
  const frame = el('div', { className: 'canvas-frame' }, [host, overlay]);
  const scroll = el('div', { className: 'canvas-scroll' }, [frame]);
  const element = el('div', {
    className: 'canvas-stage',
    dataset: { testid: 'editor-stage' },
    tabindex: '0',
    'aria-label': 'Slide canvas. Use Tab to reach the inspector, arrow keys to nudge the selection.',
  }, [scroll]);

  let drag: DragState | null = null;
  let pendingMove: { pointerId: number; startX: number; startY: number; origin: Map<string, { x: number; y: number; w: number; h: number }> } | null = null;
  let editing: { id: string; node: HTMLElement } | null = null;

  function currentElements(): SlideElement[] {
    return store.slide?.elements ?? [];
  }

  function render(): void {
    const slide = store.slide;
    if (!slide) return;
    const theme = themeForSlide(slide, store.state.deck.family);
    const canvas = renderSlide(slide, theme, { mode: 'editor' });
    canvas.dataset.testid = 'slide-canvas';
    refreshOverflow(canvas);
    host.replaceChildren(canvas);
    onOverflow(refreshOverflow(canvas));
    drawOverlay();
    frame.style.width = `${store.state.deck.width}px`;
    frame.style.height = `${store.state.deck.height}px`;
    applyZoom();
  }

  function applyZoom(): void {
    const zoom = store.state.zoom;
    frame.style.transform = `scale(${zoom})`;
    scroll.style.width = `${store.state.deck.width * zoom}px`;
    scroll.style.height = `${store.state.deck.height * zoom}px`;
  }

  function drawOverlay(): void {
    overlay.replaceChildren();
    const selection = store.state.selection;
    if (!selection.length || editing) return;
    const targets = currentElements().filter((entry) => selection.includes(entry.id));
    if (!targets.length) return;
    const bounds = targets.reduce(
      (acc, item) => ({
        left: Math.min(acc.left, item.x),
        top: Math.min(acc.top, item.y),
        right: Math.max(acc.right, item.x + item.w),
        bottom: Math.max(acc.bottom, item.y + item.h),
      }),
      { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
    const box = el('div', {
      className: 'selection',
      dataset: { testid: 'selection-box' },
      style: {
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${bounds.right - bounds.left}px`,
        height: `${bounds.bottom - bounds.top}px`,
      },
    });
    if (targets.length === 1 && !targets[0].locked) {
      for (const handle of HANDLES) {
        box.append(
          el('span', {
            className: `handle handle--${handle}`,
            dataset: { handle, testid: `handle-${handle}` },
            'aria-hidden': 'true',
          }),
        );
      }
    }
    overlay.append(box);
  }

  function slidePoint(event: Pick<MouseEvent, 'clientX' | 'clientY'>): { x: number; y: number } {
    const rect = frame.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / store.state.zoom,
      y: (event.clientY - rect.top) / store.state.zoom,
    };
  }

  function findElementNode(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    return target.closest<HTMLElement>('[data-el-id]');
  }

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // Let the browser position the caret and select words inside an active edit.
    if (editing && event.target instanceof Node && editing.node.contains(event.target)) return;
    const node = findElementNode(event.target);
    const item = node ? store.elementById(node.dataset.elId ?? '') : undefined;

    // preventDefault() on pointerdown suppresses the compatibility dblclick
    // event, so double-click detection happens here via event.detail.
    if (event.detail >= 2 && node && item?.type === 'text' && !item.locked) {
      event.preventDefault();
      if (!store.state.selection.includes(item.id)) store.select([item.id]);
      startInlineEdit(node);
      return;
    }

    const handleNode = (event.target as HTMLElement).closest<HTMLElement>('[data-handle]');
    const point = slidePoint(event);
    if (handleNode && store.state.selection.length === 1) {
      const id = store.state.selection[0];
      const target = store.elementById(id);
      if (!target || target.locked) return;
      drag = {
        mode: 'resize',
        handle: handleNode.dataset.handle ?? 'se',
        startX: point.x,
        startY: point.y,
        origin: new Map([[id, { x: target.x, y: target.y, w: target.w, h: target.h }]]),
        batchOpen: false,
      };
      element.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    if (!node) {
      if (editing) commitEditing();
      store.select([]);
      return;
    }
    if (!item) return;
    if (event.shiftKey) store.toggleSelect(item.id);
    else if (!store.state.selection.includes(item.id)) store.select([item.id]);
    if (item.locked || (event.shiftKey && !store.state.selection.includes(item.id))) return;

    const selection = store.state.selection.includes(item.id) ? store.state.selection : [item.id];
    const origin = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const selectedId of selection) {
      const target = store.elementById(selectedId);
      if (target && !target.locked) origin.set(selectedId, { x: target.x, y: target.y, w: target.w, h: target.h });
    }
    // Pointer capture is deferred until the pointer actually moves: capturing here
    // would retarget the following dblclick to the stage and break inline editing.
    pendingMove = { pointerId: event.pointerId, startX: point.x, startY: point.y, origin };
    drag = null;
  });

  element.addEventListener('pointermove', (event) => {
    if (pendingMove && !drag) {
      const point = slidePoint(event);
      const dx = point.x - pendingMove.startX;
      const dy = point.y - pendingMove.startY;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        drag = {
          mode: 'move',
          handle: '',
          startX: pendingMove.startX,
          startY: pendingMove.startY,
          origin: pendingMove.origin,
          batchOpen: false,
        };
        element.setPointerCapture(pendingMove.pointerId);
        pendingMove = null;
      } else {
        return;
      }
    }
    if (!drag) return;
    const point = slidePoint(event);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (!drag.batchOpen && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
      drag.batchOpen = true;
      store.beginBatch(drag.mode === 'move' ? 'Move element' : 'Resize element');
    }
    if (!drag.batchOpen) return;

    if (drag.mode === 'move') {
      const step = event.shiftKey ? 10 : 1;
      store.updateBatch((deck) => {
        const slide = deck.slides.find((entry) => entry.id === store.slide.id);
        if (!slide) return;
        for (const item of slide.elements) {
          const origin = drag?.origin.get(item.id);
          if (!origin) continue;
          item.x = Math.round((origin.x + dx) / step) * step;
          item.y = Math.round((origin.y + dy) / step) * step;
        }
      });
    } else {
      const id = store.state.selection[0];
      const origin = drag.origin.get(id);
      if (!origin) return;
      const handle = drag.handle;
      let { x, y, w, h } = origin;
      if (handle.includes('e')) w = origin.w + dx;
      if (handle.includes('s')) h = origin.h + dy;
      if (handle.includes('w')) {
        w = origin.w - dx;
        x = origin.x + dx;
      }
      if (handle.includes('n')) {
        h = origin.h - dy;
        y = origin.y + dy;
      }
      const min = 16;
      if (w < min) {
        w = min;
        if (handle.includes('w')) x = origin.x + origin.w - min;
      }
      if (h < min) {
        h = min;
        if (handle.includes('n')) y = origin.y + origin.h - min;
      }
      store.updateBatch((deck) => {
        const slide = deck.slides.find((entry) => entry.id === store.slide.id);
        const item = slide?.elements.find((entry) => entry.id === id);
        if (!item) return;
        item.x = Math.round(x);
        item.y = Math.round(y);
        item.w = Math.round(w);
        item.h = Math.round(h);
      });
    }
    for (const item of currentElements()) {
      if (!drag.origin.has(item.id)) continue;
      const node = Array.from(host.querySelectorAll<HTMLElement>('[data-el-id]')).find(node => node.dataset.elId === item.id);
      if (node) Object.assign(node.style, { left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px` });
    }
    drawOverlay();
    const canvas = host.querySelector<HTMLElement>('.slide-canvas');
    if (canvas) {
      onOverflow(refreshOverflow(canvas));
      positionEditingNode();
    }
  });

  const endDrag = (event: PointerEvent) => {
    pendingMove = null;
    if (!drag) return;
    const wasOpen = drag.batchOpen;
    const mode = drag.mode;
    drag = null;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    if (wasOpen) {
      store.endBatch(mode === 'move' ? 'Move element' : 'Resize element');
    }
  };
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);

  element.addEventListener('dblclick', (event) => {
    const node = findElementNode(event.target);
    if (!node) return;
    const id = node.dataset.elId ?? '';
    const item = store.elementById(id);
    if (!item || item.type !== 'text' || item.locked) return;
    startInlineEdit(node);
  });

  function startInlineEdit(node: HTMLElement): void {
    if (editing?.node === node) return;
    pendingMove = null;
    editing = { id: node.dataset.elId ?? '', node };
    const inner = node.querySelector<HTMLElement>('.slide-text-inner') ?? node;
    inner.setAttribute('contenteditable', 'plaintext-only');
    inner.setAttribute('role', 'textbox');
    inner.setAttribute('aria-label', 'Edit slide text');
    inner.dataset.testid = 'inline-editor';
    inner.style.outline = '2px solid var(--accent)';
    inner.textContent = store.textPreview(editing.id);
    inner.focus();
    const range = document.createRange();
    range.selectNodeContents(inner);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    inner.addEventListener('keydown', (editKey));
    inner.addEventListener('blur', () => commitEditing());
    overlay.replaceChildren();
  }

  function positionEditingNode(): void {
    /* inline editor lives inside the rendered element; no repositioning needed */
  }

  function editKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      commitEditing();
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commitEditing();
    }
    event.stopPropagation();
  }

  function commitEditing(): void {
    if (!editing) return;
    const { id, node } = editing;
    const inner = node.querySelector<HTMLElement>('.slide-text-inner') ?? node;
    const text = inner.textContent ?? '';
    inner.removeAttribute('contenteditable');
    inner.removeEventListener('keydown', editKey);
    delete inner.dataset.testid;
    inner.style.outline = '';
    editing = null;
    if (text !== store.textPreview(id)) store.setElementText(id, text);
    else render();
  }

  // Drag and drop images straight onto the canvas.
  element.addEventListener('dragover', (event) => {
    event.preventDefault();
    element.classList.add('is-drop-target');
  });
  element.addEventListener('dragleave', () => element.classList.remove('is-drop-target'));
  element.addEventListener('drop', (event) => {
    element.classList.remove('is-drop-target');
    const file = Array.from(event.dataTransfer?.files ?? []).find((entry) => entry.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    const point = slidePoint(event);
    void addImageFromFile(file, point.x, point.y);
  });

  async function addImageFromFile(file: File, x: number, y: number): Promise<void> {
    const slideId = store.slide.id;
    const selected = store.state.selection
        .map((id) => store.elementById(id))
        .find((entry): entry is SlideElement & { type: 'image' } => entry?.type === 'image');
    try {
      const dataUrl = await readAsDataUrl(file);
      if (selected) {
        store.patchElements([selected.id], { src: dataUrl, name: file.name, crop: undefined, missing: false } as Partial<SlideElement>, 'Replace image', slideId);
        render();
        return;
      }
      const image = createImage({
        id: newId('image'),
        src: dataUrl,
        name: file.name,
        alt: file.name.replace(/\.[a-z0-9]+$/i, ''),
        x: Math.max(0, Math.min(1280 - 420, x - 210)),
        y: Math.max(0, Math.min(720 - 280, y - 140)),
        w: 420,
        h: 280,
        missing: false,
      });
      store.addElement(image, 'Insert image', slideId);
      render();
      showToast(`Added ${file.name}`, 'success');
    } catch (error) {
      showToast(`Could not read that image: ${(error as Error).message}`, 'error');
    }
  }

  return {
    element,
    render,
    updateOverlay: drawOverlay,
    flush: commitEditing,
    editSelectedText: () => {
      const id = store.state.selection[0];
      const node = Array.from(host.querySelectorAll<HTMLElement>('[data-el-id]')).find(node => node.dataset.elId === id);
      if (node && store.elementById(id)?.type === 'text') startInlineEdit(node);
    },
    zoomTo: (zoom: number) => {
      store.setState({ zoom }, 'zoom');
      applyZoom();
    },
  };
}

export async function readAsDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) throw new Error('Choose a PNG, JPEG, WebP, GIF or AVIF image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const image = new Image(); image.src = src;
  try { await image.decode(); } catch { throw new Error('This image could not be decoded.'); }
  if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('Choose an image under 40 megapixels.');
  if (file.type === 'image/png' || file.type === 'image/jpeg') return src;
  // Freeze animated/modern image formats into a portable picture for all exports.
  const canvas = document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const context=canvas.getContext('2d');if (!context) throw new Error('Image conversion is unavailable.');
  context.drawImage(image,0,0);return canvas.toDataURL('image/png');
}

export function textValue(element: TextElement): string {
  return element.runs.map((run) => run.text).join('');
}
