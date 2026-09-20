import { newId } from './id';
import { getTheme, remapColor } from './theme';
import {
  DECK_HEIGHT,
  DECK_VERSION,
  DECK_WIDTH,
  type Deck,
  type FamilyId,
  type ImageElement,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type TextElement,
  type TextRun,
} from './types';

export function plainText(el: TextElement): string {
  return el.runs.map((run) => run.text).join('');
}

export function runsFromText(text: string): TextRun[] {
  return [{ text }];
}

export function normalizeRuns(runs: TextRun[]): TextRun[] {
  if (!runs.length) return [{ text: '' }];
  return runs.map((run) => ({ ...run, text: run.text }));
}

export function cloneSlide(slide: Slide, keepId = false): Slide {
  return {
    ...slide,
    id: keepId ? slide.id : newId('slide'),
    background: slide.background,
    elements: slide.elements.map((element) => ({ ...element, id: newId(element.type) })),
  };
}

export function duplicateSlide(slide: Slide): Slide {
  const copy = cloneSlide(slide);
  copy.name = `${slide.name} copy`;
  copy.notes = slide.notes;
  return copy;
}

export function createText(partial: Partial<TextElement> & { text?: string }): TextElement {
  const { text, runs, ...rest } = partial;
  return {
    id: rest.id ?? newId('text'),
    type: 'text',
    x: 120,
    y: 120,
    w: 480,
    h: 80,
    runs: normalizeRuns(runs ?? runsFromText(text ?? 'New text')),
    size: 28,
    color: '1E2C26',
    font: 'body',
    weight: 400,
    align: 'left',
    valign: 'top',
    lineHeight: 1.25,
    role: 'body',
    ...rest,
  };
}

export function createShape(partial: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: partial.id ?? newId('shape'),
    type: 'shape',
    shape: 'rect',
    x: 120,
    y: 120,
    w: 320,
    h: 200,
    fill: '2F6B52',
    radius: 2,
    ...partial,
  };
}

export function createImage(partial: Partial<ImageElement> = {}): ImageElement {
  return {
    id: partial.id ?? newId('image'),
    type: 'image',
    x: 120,
    y: 120,
    w: 480,
    h: 320,
    fit: 'cover',
    alt: partial.alt ?? 'Placeholder image',
    ...partial,
  };
}

export function createSlide(partial: Partial<Slide> & { family?: FamilyId } = {}): Slide {
  const family = partial.family ?? 'editorial';
  const theme = getTheme(family);
  return {
    id: partial.id ?? newId('slide'),
    layout: partial.layout ?? 'text',
    family,
    name: partial.name ?? 'Slide',
    background: partial.background ?? theme.bg,
    notes: partial.notes ?? '',
    elements: partial.elements ?? [],
  };
}

export function createDeck(title: string, family: FamilyId, slides: Slide[]): Deck {
  return {
    version: DECK_VERSION,
    id: newId('deck'),
    title,
    family,
    width: DECK_WIDTH,
    height: DECK_HEIGHT,
    slides,
    meta: {
      references: [
        'https://deck.gallery/linear-pitch-deck/',
        'https://deck.gallery/space10-exhibition-catalogue/',
        'https://deck.gallery/dept-impact-report-2023/',
      ],
      exportedWith: 'Slide Designs',
    },
    updatedAt: new Date().toISOString(),
  };
}

export function findElement(slide: Slide, elementId: string): SlideElement | undefined {
  return slide.elements.find((element) => element.id === elementId);
}

export function applyTheme(deck: Deck, family: FamilyId): Deck {
  const from = getTheme(deck.family);
  const to = getTheme(family);
  const slides = deck.slides.map((slide) => ({
    ...slide,
    family,
    background: remapColor(slide.background, from, to) ?? slide.background,
    elements: slide.elements.map((element) => {
      if (element.type === 'text') {
        return {
          ...element,
          color: remapColor(element.color, from, to) ?? element.color,
          runs: element.runs.map((run) => ({
            ...run,
            color: remapColor(run.color, from, to),
          })),
        };
      }
      if (element.type === 'shape') {
        return {
          ...element,
          fill: remapColor(element.fill, from, to),
          line: remapColor(element.line, from, to),
        };
      }
      return { ...element };
    }),
  }));
  return { ...deck, family, slides };
}

export function deckTextLength(deck: Deck): number {
  let total = 0;
  for (const slide of deck.slides) {
    for (const element of slide.elements) {
      if (element.type === 'text') total += plainText(element).length;
    }
  }
  return total;
}

export function moveSlide(deck: Deck, from: number, to: number): Deck {
  if (from === to || from < 0 || to < 0 || from >= deck.slides.length || to >= deck.slides.length) {
    return deck;
  }
  const slides = deck.slides.slice();
  const [moved] = slides.splice(from, 1);
  slides.splice(to, 0, moved);
  return { ...deck, slides };
}
