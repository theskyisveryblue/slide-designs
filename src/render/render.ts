import type { Slide, SlideElement, TextElement, ImageElement, Theme } from '../model/types';

export type RenderMode = 'editor' | 'present' | 'export';

export interface RenderOptions {
  mode?: RenderMode;
  /** Resolve a possibly-stale image src to something displayable. */
  resolveSrc?: (element: ImageElement) => string | undefined;
  /** Extra class applied to the canvas root. */
  className?: string;
}

export interface OverflowReport {
  texts: string[];
  images: string[];
  any: boolean;
}

const IMAGE_FALLBACKS = new Map<string, string>();

export function renderSlide(slide: Slide, theme: Theme, options: RenderOptions = {}): HTMLDivElement {
  const mode = options.mode ?? 'editor';
  const root = document.createElement('div');
  root.className = `slide-canvas slide-canvas--${mode}${options.className ? ` ${options.className}` : ''}`;
  root.dataset.slideId = slide.id;
  root.dataset.layout = slide.layout;
  root.dataset.family = slide.family;
  Object.assign(root.style, {
    position: 'relative',
    width: '1280px',
    height: '720px',
    background: `#${slide.background}`,
    overflow: 'hidden',
    boxSizing: 'border-box',
    fontFamily: theme.fonts.body,
    color: `#${theme.ink}`,
    isolation: 'isolate',
  });

  const elements = orderElements(slide.elements);
  for (const element of elements) {
    root.append(renderElement(element, theme, mode, options));
  }
  return root;
}

/** Layer order is array order: elements are painted back to front. */
export function orderElements(elements: SlideElement[]): SlideElement[] {
  return elements.slice();
}

function renderElement(
  element: SlideElement,
  theme: Theme,
  mode: RenderMode,
  options: RenderOptions,
): HTMLElement {
  if (element.type === 'text') return renderText(element, theme, mode);
  if (element.type === 'shape') return renderShape(element, theme, mode);
  return renderImage(element, theme, mode, options);
}

function positionStyle(element: SlideElement, mode: RenderMode): Record<string, string> {
  const style: Record<string, string> = {
    position: 'absolute',
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.w}px`,
    height: `${element.h}px`,
    boxSizing: 'border-box',
  };
  if (element.rotation || element.flipH || element.flipV) style.transform = `rotate(${element.rotation ?? 0}deg) scale(${element.flipH ? -1 : 1}, ${element.flipV ? -1 : 1})`;
  if (typeof element.opacity === 'number' && element.opacity < 1) style.opacity = String(element.opacity);
  if (mode === 'editor' && element.locked) style.pointerEvents = 'none';
  return style;
}

function renderText(element: TextElement, theme: Theme, mode: RenderMode): HTMLElement {
  const outer = document.createElement('div');
  outer.className = `slide-el slide-el--text${element.locked ? ' is-locked' : ''}`;
  outer.dataset.elId = element.id;
  outer.dataset.kind = 'text';
  outer.dataset.role = element.role ?? 'body';
  Object.assign(outer.style, positionStyle(element, mode), {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: element.valign === 'middle' ? 'center' : element.valign === 'bottom' ? 'flex-end' : 'flex-start',
    overflow: 'hidden',
    fontFamily: element.fontFace ? `"${element.fontFace}", ${theme.fonts[element.font]}` : theme.fonts[element.font],
    fontSize: `${element.size}px`,
    lineHeight: String(element.lineHeight),
    letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : 'normal',
    fontWeight: String(element.weight),
    fontStyle: element.italic ? 'italic' : 'normal',
    textAlign: element.align,
    color: `#${element.color}`,
    textTransform: element.caps ? 'uppercase' : 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  });

  const inner = document.createElement('div');
  inner.className = 'slide-text-inner';
  inner.style.width = '100%';

  if (element.list && element.list !== 'none') {
    inner.append(buildList(element, theme));
  } else {
    for (const run of element.runs) {
      if (!run.text) continue;
      inner.append(runSpan(run, theme));
    }
  }
  outer.append(inner);
  return outer;
}

function runSpan(run: { text: string; bold?: boolean; italic?: boolean; color?: string; accent?: boolean }, theme: Theme): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = run.text;
  if (run.bold !== undefined) span.style.fontWeight = run.bold ? '700' : '400';
  if (run.italic !== undefined) span.style.fontStyle = run.italic ? 'italic' : 'normal';
  if (run.color) span.style.color = `#${run.color}`;
  else if (run.accent) span.style.color = `#${theme.accent}`;
  return span;
}

function buildList(element: TextElement, theme: Theme): HTMLElement {
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = `${Math.round(element.size * 0.42)}px`;
  const text = element.runs.map((run) => run.text).join('\n');
  const lines = text.split('\n').filter((line) => line.trim().length);
  lines.forEach((line, index) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = `${Math.round(element.size * 0.6)}px`;
    const marker = document.createElement('span');
    marker.textContent = element.list === 'number' ? `${index + 1}.` : '\u2022';
    marker.style.color = `#${theme.accent}`;
    marker.style.flex = '0 0 auto';
    marker.style.minWidth = element.list === 'number' ? '1.6em' : '0.7em';
    const body = document.createElement('span');
    body.textContent = line;
    body.style.flex = '1 1 auto';
    row.append(marker, body);
    list.append(row);
  });
  return list;
}

function renderShape(element: SlideElement & { type: 'shape' }, theme: Theme, mode: RenderMode): HTMLElement {
  const shape = document.createElement('div');
  shape.className = 'slide-el slide-el--shape';
  shape.dataset.elId = element.id;
  shape.dataset.kind = 'shape';
  const style = positionStyle(element, mode);
  if (element.shape === 'ellipse') {
    style.borderRadius = '50%';
    if (element.fill) style.background = `#${element.fill}`;
    if (element.line && (element.lineWidth ?? 0) > 0) {
      style.border = `${element.lineWidth}px solid #${element.line}`;
    }
  } else if (element.shape === 'line') {
    style.height = `${element.lineWidth ?? 2}px`;
    style.background = element.line ? `#${element.line}` : `#${theme.ink}`;
  } else {
    style.borderRadius = `${element.radius ?? theme.radius}px`;
    if (element.fill) style.background = `#${element.fill}`;
    if (element.line && (element.lineWidth ?? 0) > 0) {
      style.border = `${element.lineWidth}px solid #${element.line}`;
    }
  }
  Object.assign(shape.style, style);
  return shape;
}

function renderImage(element: ImageElement, theme: Theme, mode: RenderMode, options: RenderOptions): HTMLElement {
  const box = document.createElement('div');
  box.className = 'slide-el slide-el--image';
  box.dataset.elId = element.id;
  box.dataset.kind = 'image';
  Object.assign(box.style, positionStyle(element, mode), { overflow: 'hidden' });

  const resolved = options.resolveSrc?.(element) ?? element.src;
  if (resolved) {
    const img = document.createElement('img');
    img.src = resolved;
    img.alt = element.alt;
    img.draggable = false;
    Object.assign(img.style, {
      width: '100%',
      height: '100%',
      objectFit: element.fit,
      objectPosition: 'center',
      display: 'block',
    });
    if (element.crop) {
      Object.assign(img.style, cropToTransform(element));
    }
    if (mode === 'editor') img.style.pointerEvents = 'none';
    box.append(img);
    box.dataset.missing = 'false';
  } else {
    box.dataset.missing = 'true';
    box.classList.add('is-missing');
    Object.assign(box.style, {
      background: `repeating-linear-gradient(135deg, #${theme.line} 0 10px, #${theme.surface} 10px 20px)`,
      border: `1px dashed #${theme.muted}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
    });
    const label = document.createElement('div');
    label.className = 'slide-image-placeholder';
    Object.assign(label.style, {
      fontFamily: theme.fonts.body,
      fontSize: '15px',
      color: `#${theme.muted}`,
      background: `#${theme.surface}`,
      padding: '8px 12px',
      borderRadius: '4px',
      maxWidth: '80%',
    });
    label.textContent = element.alt ? `Image: ${element.alt}` : 'Image placeholder';
    box.append(label);
  }
  return box;
}

function cropToTransform(element: ImageElement): Record<string, string> {
  const crop = element.crop!;
  const scaleX = 1 / Math.max(0.01, 1 - crop.left - crop.right);
  const scaleY = 1 / Math.max(0.01, 1 - crop.top - crop.bottom);
  const translateX = ((crop.left - crop.right) / 2) * 100;
  const translateY = ((crop.top - crop.bottom) / 2) * 100;
  return {
    transform: `translate(${translateX}%, ${translateY}%) scale(${scaleX}, ${scaleY})`,
    objectFit: element.fit,
  };
}

export function refreshOverflow(root: HTMLElement): OverflowReport {
  const report: OverflowReport = { texts: [], images: [], any: false };
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-kind="text"]'))) {
    const inner = node.querySelector<HTMLElement>('.slide-text-inner');
    if (!inner) continue;
    const overflow = inner.scrollHeight > node.clientHeight + 1 || inner.scrollWidth > node.clientWidth + 1;
    node.classList.toggle('is-overflow', overflow);
    node.dataset.overflow = String(overflow);
    if (overflow) report.texts.push(node.dataset.elId ?? '');
  }
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-kind="image"]'))) {
    if (node.dataset.missing === 'true') {
      report.images.push(node.dataset.elId ?? '');
    }
  }
  report.any = report.texts.length > 0 || report.images.length > 0;
  return report;
}

export function canvasHtml(slide: Slide, theme: Theme, options: RenderOptions = {}): string {
  const root = renderSlide(slide, theme, options);
  refreshOverflow(root);
  return root.outerHTML;
}

/** Serialize the canvas without editor-only state for stored/exported markup. */
export function cleanCanvasHtml(slide: Slide, theme: Theme): string {
  const root = renderSlide(slide, theme, { mode: 'export' });
  refreshOverflow(root);
  return root.outerHTML;
}

export const imageFallbacks = IMAGE_FALLBACKS;
