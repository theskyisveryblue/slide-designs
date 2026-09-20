import { createDeck, createSlide } from '../model/deck';
import type { Deck, FamilyId, LayoutId, Slide } from '../model/types';
import { editorial } from './editorial';
import { bold } from './bold';
import { product } from './product';
import { buildSlide, type FamilyTokens } from './helpers';

export const families: Record<FamilyId, FamilyTokens> = { editorial, bold, product };

export const familyOrder: FamilyId[] = ['editorial', 'bold', 'product'];

export const layoutOrder: LayoutId[] = [
  'cover',
  'section',
  'text',
  'image',
  'comparison',
  'metrics',
  'quote',
  'timeline',
  'closing',
];

export const DEMO_LAYOUTS: LayoutId[] = layoutOrder;

export function familyTokens(family: FamilyId): FamilyTokens {
  return families[family] ?? families.editorial;
}

export function createSlideFromLayout(family: FamilyId, layout: LayoutId, index: number, total: number): Slide {
  return buildSlide(familyTokens(family), layout, index, total);
}

export function createDeckFromTemplate(family: FamilyId, layouts: LayoutId[] = DEMO_LAYOUTS): Deck {
  const tokens = familyTokens(family);
  const slides = layouts.map((layout, index) => createSlideFromLayout(family, layout, index, layouts.length));
  return createDeck(tokens.content.deckTitle, family, slides);
}

export function blankSlide(family: FamilyId, index: number, total: number): Slide {
  const slide = createSlide({ family, layout: 'text', name: 'Blank' });
  slide.elements = [];
  slide.notes = '';
  return slide;
}

export interface TemplatePreview {
  family: FamilyId;
  layout: LayoutId;
  label: string;
  title: string;
}

export function templateGallery(): Record<FamilyId, TemplatePreview[]> {
  const out = {} as Record<FamilyId, TemplatePreview[]>;
  for (const family of familyOrder) {
    const tokens = familyTokens(family);
    out[family] = layoutOrder.map((layout) => ({
      family,
      layout,
      label: layout,
      title: tokens.content.deckTitle,
    }));
  }
  return out;
}

export { buildSlide };
export type { FamilyTokens };
