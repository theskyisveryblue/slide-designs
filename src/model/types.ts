export type Align = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';
export type FontToken = 'heading' | 'body' | 'mono';
export type ShapeKind = 'rect' | 'ellipse' | 'line';
export type ImageFit = 'cover' | 'contain' | 'fill';

export type LayoutId =
  | 'cover'
  | 'section'
  | 'text'
  | 'image'
  | 'comparison'
  | 'metrics'
  | 'quote'
  | 'timeline'
  | 'closing';

export type FamilyId = 'editorial' | 'bold' | 'product';

export type ElementRole =
  | 'kicker'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'caption'
  | 'quote'
  | 'metric'
  | 'label'
  | 'note';

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  accent?: boolean;
}

export interface BaseElement {
  id: string;
  type: 'text' | 'shape' | 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  flipH?: boolean;
  flipV?: boolean;
}

export interface TextElement extends BaseElement {
  type: 'text';
  runs: TextRun[];
  size: number;
  color: string;
  font: FontToken;
  fontFace?: string;
  weight: number;
  italic?: boolean;
  align: Align;
  valign: VAlign;
  lineHeight: number;
  letterSpacing?: number;
  caps?: boolean;
  role?: ElementRole;
  list?: 'none' | 'bullet' | 'number';
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  fill?: string;
  line?: string;
  lineWidth?: number;
  radius?: number;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src?: string;
  name?: string;
  fit: ImageFit;
  alt: string;
  crop?: { top: number; right: number; bottom: number; left: number };
  missing?: boolean;
}

export type SlideElement = TextElement | ShapeElement | ImageElement;

export interface Slide {
  id: string;
  layout: LayoutId;
  family: FamilyId;
  name: string;
  background: string;
  notes: string;
  elements: SlideElement[];
}

export interface DeckMeta {
  references?: string[];
  exportedWith?: string;
  importWarnings?: string[];
}

export interface Deck {
  version: 1;
  id: string;
  title: string;
  family: FamilyId;
  width: number;
  height: number;
  slides: Slide[];
  meta?: DeckMeta;
  updatedAt?: string;
}

export interface Theme {
  id: FamilyId;
  name: string;
  bg: string;
  ink: string;
  muted: string;
  surface: string;
  accent: string;
  accentInk: string;
  line: string;
  fonts: Record<FontToken, string>;
  radius: number;
  headingTracking: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DECK_WIDTH = 1280;
export const DECK_HEIGHT = 720;
export const DECK_MARGIN = 72;
export const DECK_VERSION = 1 as const;
