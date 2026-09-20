import { getTheme } from './theme';
import { DECK_HEIGHT, DECK_VERSION, DECK_WIDTH, type Deck, type FamilyId, type LayoutId, type SlideElement } from './types';

export interface ValidationResult {
  deck: Deck | null;
  errors: string[];
  warnings: string[];
}

const HEX = /^[0-9a-fA-F]{6}$/;
const SAFE_IMAGE = /^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/;
const MAX_SLIDES = 200;
const MAX_ELEMENTS = 200;
const FAMILIES: FamilyId[] = ['editorial', 'bold', 'product'];
const LAYOUTS: LayoutId[] = ['cover', 'section', 'text', 'image', 'comparison', 'metrics', 'quote', 'timeline', 'closing'];

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed * 1000) / 1000));
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.replace(/\u0000/g, '') : fallback;
}

function color(value: unknown, fallback: string): string {
  if (typeof value === 'string' && HEX.test(value)) return value.toUpperCase();
  return fallback;
}

/** Ensure an id is unique inside a set, appending a numeric suffix when needed. */
function uniqueId(candidate: string, seen: Set<string>): string {
  let id = candidate || 'id';
  let suffix = 2;
  while (seen.has(id)) {
    id = `${candidate}_${suffix}`;
    suffix += 1;
  }
  seen.add(id);
  return id;
}

function dedupeElementIds(elements: SlideElement[], warnings: string[]): void {
  const seen = new Set<string>();
  for (const element of elements) {
    const deduped = uniqueId(element.id, seen);
    if (deduped !== element.id) {
      warnings.push(`Duplicate element id "${element.id}" was renamed to "${deduped}".`);
    }
    element.id = deduped;
  }
}

function align(value: unknown, fallback: 'left' | 'center' | 'right') {
  return value === 'left' || value === 'center' || value === 'right' ? value : fallback;
}

function valign(value: unknown, fallback: 'top' | 'middle' | 'bottom') {
  return value === 'top' || value === 'middle' || value === 'bottom' ? value : fallback;
}

function sanitizeRuns(raw: unknown, warnings: string[]): { text: string; bold?: boolean; italic?: boolean; color?: string; accent?: boolean }[] {
  if (!Array.isArray(raw)) return [{ text: str(raw) }];
  const runs = raw
    .filter((run) => run && typeof run === 'object')
    .slice(0, 200)
    .map((run) => {
      const record = run as Record<string, unknown>;
      const text = str(record.text);
      if (/<\s*(script|iframe|object|embed)/i.test(text)) {
        warnings.push('Stripped markup-like text in a text run.');
      }
      const out: { text: string; bold?: boolean; italic?: boolean; color?: string; accent?: boolean } = { text };
      if (typeof record.bold === 'boolean') out.bold = record.bold;
      if (typeof record.italic === 'boolean') out.italic = record.italic;
      if (typeof record.color === 'string' && HEX.test(record.color)) out.color = record.color.toUpperCase();
      if (record.accent === true) out.accent = true;
      return out;
    });
  return runs.length ? runs : [{ text: '' }];
}

function sanitizeElement(raw: unknown, warnings: string[], index: number): SlideElement | null {
  if (!raw || typeof raw !== 'object') {
    warnings.push(`Dropped element ${index}: not an object.`);
    return null;
  }
  const record = raw as Record<string, unknown>;
  const type = record.type;
  const id = str(record.id) || `el_import_${index}`;
  const base = {
    id,
    x: num(record.x, 0, -4000, 4000),
    y: num(record.y, 0, -4000, 4000),
    w: num(record.w, 10, 1, 6000),
    h: num(record.h, 10, 1, 6000),
    rotation: record.rotation === undefined ? undefined : num(record.rotation, 0, -360, 360),
    opacity: record.opacity === undefined ? undefined : num(record.opacity, 1, 0, 1),
    locked: record.locked === true,
    flipH: record.flipH === true,
    flipV: record.flipV === true,
  };
  if (type === 'text') {
    const font = record.font === 'heading' || record.font === 'mono' ? record.font : 'body';
    const list = record.list === 'bullet' || record.list === 'number' ? record.list : 'none';
    return {
      ...base,
      type: 'text',
      runs: sanitizeRuns(record.runs ?? (record.text !== undefined ? [{ text: str(record.text) }] : []), warnings),
      size: num(record.size, 24, 6, 400),
      color: color(record.color, '101010'),
      font,
      fontFace: typeof record.fontFace === 'string' && /^[\p{L}\p{N} ._()\-]{1,100}$/u.test(record.fontFace) ? record.fontFace : undefined,
      weight: num(record.weight, 400, 100, 900),
      italic: record.italic === true,
      align: align(record.align, 'left'),
      valign: valign(record.valign, 'top'),
      lineHeight: num(record.lineHeight, 1.25, 0.7, 4),
      letterSpacing: record.letterSpacing === undefined ? undefined : num(record.letterSpacing, 0, -20, 40),
      caps: record.caps === true,
      role: typeof record.role === 'string' ? (record.role as SlideElement extends { role?: infer R } ? R : never) : undefined,
      list,
    } as SlideElement;
  }
  if (type === 'shape') {
    const shape = record.shape === 'ellipse' || record.shape === 'line' ? record.shape : 'rect';
    return {
      ...base,
      type: 'shape',
      shape,
      fill: typeof record.fill === 'string' && HEX.test(record.fill) ? record.fill.toUpperCase() : undefined,
      line: typeof record.line === 'string' && HEX.test(record.line) ? record.line.toUpperCase() : undefined,
      lineWidth: record.lineWidth === undefined ? undefined : num(record.lineWidth, 1, 0, 80),
      radius: record.radius === undefined ? undefined : num(record.radius, 0, 0, 400),
    };
  }
  if (type === 'image') {
    const src = typeof record.src === 'string' ? record.src : '';
    let safeSrc: string | undefined;
    if (src) {
      if (SAFE_IMAGE.test(src)) safeSrc = src;
      else {
        warnings.push('Removed an image with a non-data URL. Only embedded data images are accepted.');
      }
    }
    return {
      ...base,
      type: 'image',
      src: safeSrc,
      name: str(record.name) || undefined,
      fit: record.fit === 'contain' || record.fit === 'fill' ? record.fit : 'cover',
      alt: str(record.alt) || 'Image',
      crop:
        record.crop && typeof record.crop === 'object'
          ? {
              top: num((record.crop as Record<string, unknown>).top, 0, 0, 0.9),
              right: num((record.crop as Record<string, unknown>).right, 0, 0, 0.9),
              bottom: num((record.crop as Record<string, unknown>).bottom, 0, 0, 0.9),
              left: num((record.crop as Record<string, unknown>).left, 0, 0, 0.9),
            }
          : undefined,
      missing: !safeSrc,
    };
  }
  warnings.push(`Dropped element ${index}: unknown type "${String(type)}".`);
  return null;
}

export function validateDeck(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: Record<string, unknown>;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input) as Record<string, unknown>;
    } catch (error) {
      return { deck: null, errors: [`File is not valid JSON: ${(error as Error).message}`], warnings };
    }
  } else {
    raw = input as Record<string, unknown>;
  }

  if (typeof input === 'string') {
    // JSON.parse succeeds for literals like `null`; validate the parsed root.
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      return { deck: null, errors: [`File is not valid JSON: ${(error as Error).message}`], warnings };
    }
    raw = parsed as Record<string, unknown>;
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { deck: null, errors: ['File does not contain a deck object.'], warnings };
  }

  if (raw.version !== undefined && raw.version !== DECK_VERSION) {
    return { deck: null, errors: ['Unsupported deck schema version. This build opens version 1.'], warnings };
  }
  if (!Array.isArray(raw.slides)) {
    return { deck: null, errors: ['Deck is missing a slides array.'], warnings };
  }
  if (raw.slides.length === 0) {
    return { deck: null, errors: ['Deck contains no slides.'], warnings };
  }
  if (raw.slides.length > MAX_SLIDES) {
    warnings.push(`Deck had ${raw.slides.length} slides; only the first ${MAX_SLIDES} were loaded.`);
  }

  const family: FamilyId = FAMILIES.includes(raw.family as FamilyId) ? (raw.family as FamilyId) : 'editorial';
  const theme = getTheme(family);

  const slides = raw.slides.slice(0, MAX_SLIDES).map((entry, slideIndex) => {
    const slide = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const rawElements = Array.isArray(slide.elements) ? slide.elements.slice(0, MAX_ELEMENTS) : [];
    if (Array.isArray(slide.elements) && slide.elements.length > MAX_ELEMENTS) {
      warnings.push(`Slide ${slideIndex + 1} had ${slide.elements.length} elements; extra elements were dropped.`);
    }
    const elements = rawElements
      .map((element, index) => sanitizeElement(element, warnings, index))
      .filter((element): element is SlideElement => element !== null);
    dedupeElementIds(elements, warnings);
    return {
      id: str(slide.id) || `slide_import_${slideIndex}`,
      layout: LAYOUTS.includes(slide.layout as LayoutId) ? (slide.layout as LayoutId) : 'text',
      family,
      name: str(slide.name) || `Slide ${slideIndex + 1}`,
      background: color(slide.background, theme.bg),
      notes: str(slide.notes).slice(0, 8000),
      elements,
    };
  });

  const slideIds = new Set<string>();
  for (const slide of slides) {
    const deduped = uniqueId(slide.id, slideIds);
    if (deduped !== slide.id) {
      warnings.push(`Duplicate slide id "${slide.id}" was renamed to "${deduped}".`);
    }
    slide.id = deduped;
  }

  const deck: Deck = {
    version: DECK_VERSION,
    id: str(raw.id) || 'deck_imported',
    title: str(raw.title) || 'Imported deck',
    family,
    width: DECK_WIDTH,
    height: DECK_HEIGHT,
    slides,
    meta: {
      references: Array.isArray(raw.meta && (raw.meta as Record<string, unknown>).references)
        ? ((raw.meta as Record<string, unknown>).references as unknown[]).map((value) => str(value)).slice(0, 20)
        : undefined,
      exportedWith: 'Slide Designs',
      importWarnings: Array.isArray((raw.meta as Record<string, unknown> | undefined)?.importWarnings)
        ? ((raw.meta as Record<string, unknown>).importWarnings as unknown[]).map(value => str(value).slice(0, 500)).slice(0, 500) : undefined,
    },
    updatedAt: new Date().toISOString(),
  };

  if (raw.width !== undefined && num(raw.width, DECK_WIDTH, 1, 10000) !== DECK_WIDTH) {
    warnings.push('Imported page size was normalised to 1280×720.');
  }
  return { deck, errors, warnings };
}
