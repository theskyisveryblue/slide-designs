import { createImage, createShape, createText } from '../model/deck';
import type {
  Align,
  ElementRole,
  FamilyId,
  FontToken,
  ImageElement,
  LayoutId,
  ShapeKind,
  ShapeElement,
  Slide,
  SlideElement,
  TextElement,
  TextRun,
  Theme,
  VAlign,
} from '../model/types';
import { getTheme } from '../model/theme';

export interface TextOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  color: string;
  font?: FontToken;
  weight?: number;
  align?: Align;
  valign?: VAlign;
  lineHeight?: number;
  caps?: boolean;
  letterSpacing?: number;
  role?: ElementRole;
  italic?: boolean;
  list?: 'none' | 'bullet' | 'number';
  lock?: boolean;
}

export function T(content: string | TextRun[], o: TextOpts): TextElement {
  const base: TextElement = createText({
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    size: o.size,
    color: o.color,
    font: o.font ?? 'body',
    weight: o.weight ?? 400,
    align: o.align ?? 'left',
    valign: o.valign ?? 'top',
    lineHeight: o.lineHeight ?? 1.25,
    role: o.role,
    italic: o.italic,
    letterSpacing: o.letterSpacing,
    caps: o.caps,
    list: o.list ?? 'none',
    runs: typeof content === 'string' ? [{ text: content }] : content,
  });
  if (o.size >= 44) base.h = o.h;
  if (o.lock) base.locked = true;
  return base;
}

export function S(
  shape: ShapeKind,
  o: {
    x: number;
    y: number;
    w: number;
    h: number;
    fill?: string;
    line?: string;
    lineWidth?: number;
    radius?: number;
    opacity?: number;
    locked?: boolean;
  },
): ShapeElement {
  return createShape({
    shape,
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    fill: o.fill === 'none' ? undefined : o.fill,
    line: o.line,
    lineWidth: o.lineWidth,
    radius: o.radius,
    opacity: o.opacity,
    locked: o.locked,
  });
}

export function IMG(o: {
  x: number;
  y: number;
  w: number;
  h: number;
  fit?: 'cover' | 'contain';
  alt?: string;
  src?: string;
  name?: string;
}): ImageElement {
  return createImage({
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    fit: o.fit ?? 'cover',
    alt: o.alt ?? 'Image placeholder',
    src: o.src,
    name: o.name,
    missing: !o.src,
  });
}

export interface FamilyTokens {
  id: FamilyId;
  label: string;
  theme: Theme;
  /** Structural personality switches used by the shared layout builders. */
  rule: boolean;
  ruleWeight: number;
  cardSurface: boolean;
  bigBlocks: boolean;
  uppercaseHeadings: boolean;
  /** Layout copy and notes for the demo deck. */
  content: FamilyContent;
}

export interface FamilyContent {
  deckTitle: string;
  cover: { kicker: string; title: string; subtitle: string; footer: string };
  section: { index: string; title: string; blurb: string };
  text: { kicker: string; title: string; body: string; side: string; bullets: string[] };
  image: { kicker: string; title: string; caption: string; alt: string };
  comparison: { kicker: string; title: string; leftTitle: string; leftBody: string; rightTitle: string; rightBody: string };
  metrics: { kicker: string; title: string; values: { value: string; label: string; detail: string }[] };
  quote: { quote: string; attribution: string; role: string };
  timeline: { kicker: string; title: string; steps: { label: string; title: string; body: string }[] };
  closing: { kicker: string; title: string; body: string; cta: string };
}

const M = 72;
const W = 1280;
const H = 720;
const CW = W - M * 2;

export function buildSlide(tokens: FamilyTokens, layout: LayoutId, index: number, total: number): Slide {
  const theme = tokens.theme;
  const c = tokens.content;
  const elements: SlideElement[] = [];
  const heading: FontToken = 'heading';
  const bodyFont: FontToken = 'body';
  const kicker = (text: string, y = 64) =>
    elements.push(
      T(text, {
        x: M,
        y,
        w: CW,
        h: 26,
        size: 15,
        color: theme.muted,
        font: 'body',
        weight: tokens.uppercaseHeadings ? 700 : 600,
        caps: true,
        letterSpacing: 2.2,
        role: 'kicker',
      }),
    );
  const title = (text: string, o: Partial<TextOpts> = {}) =>
    elements.push(
      T(text, {
        x: M,
        y: 132,
        w: CW,
        h: 160,
        size: tokens.uppercaseHeadings ? 74 : 62,
        color: theme.ink,
        font: 'heading',
        weight: tokens.uppercaseHeadings ? 700 : 400,
        lineHeight: 1.06,
        caps: tokens.uppercaseHeadings,
        letterSpacing: theme.headingTracking * 100,
        role: 'title',
        ...o,
      }),
    );
  const footer = (label: string) =>
    elements.push(
      T(label, {
        x: M,
        y: H - 58,
        w: CW * 0.6,
        h: 22,
        size: 13,
        color: theme.muted,
        font: 'body',
        caps: true,
        letterSpacing: 1.6,
        role: 'caption',
      }),
    );
  const pageNumber = () =>
    elements.push(
      T(String(index + 1).padStart(2, '0'), {
        x: W - M - 90,
        y: H - 58,
        w: 90,
        h: 22,
        size: 13,
        color: theme.muted,
        font: tokens.rule ? 'mono' : 'body',
        align: 'right',
        role: 'caption',
      }),
    );

  switch (layout) {
    case 'cover': {
      elements.push(S('rect', { x: 0, y: 0, w: W, h: H, fill: theme.bg, locked: true }));
      if (tokens.bigBlocks) {
        elements.push(S('rect', { x: W - 420, y: 0, w: 420, h: H, fill: theme.surface, locked: true }));
        elements.push(S('rect', { x: W - 420, y: 0, w: 10, h: H, fill: theme.accent, locked: true }));
      }
      kicker(c.cover.kicker, 76);
      title(c.cover.title, { y: 168, w: tokens.bigBlocks ? CW - 380 : CW * 0.86, h: 300, size: tokens.uppercaseHeadings ? 96 : 78 });
      if (tokens.rule) elements.push(S('rect', { x: M, y: 512, w: 120, h: tokens.ruleWeight, fill: theme.accent }));
      elements.push(
        T(c.cover.subtitle, {
          x: M,
          y: tokens.rule ? 548 : 544,
          w: tokens.bigBlocks ? CW - 400 : CW * 0.62,
          h: 96,
          size: 22,
          color: theme.muted,
          font: bodyFont,
          lineHeight: 1.4,
          role: 'subtitle',
        }),
      );
      footer(c.cover.footer);
      break;
    }
    case 'section': {
      elements.push(S('rect', { x: 0, y: 0, w: W, h: H, fill: theme.bg, locked: true }));
      if (tokens.bigBlocks) elements.push(S('rect', { x: 0, y: 0, w: W, h: 8, fill: theme.accent, locked: true }));
      elements.push(
        T(c.section.index, {
          x: M,
          y: 180,
          w: 260,
          h: 190,
          size: tokens.rule ? 170 : 150,
          color: theme.line,
          font: 'heading',
          weight: tokens.uppercaseHeadings ? 700 : 400,
          lineHeight: 1,
          role: 'metric',
        }),
      );
      elements.push(
        T(c.section.title, {
          x: M + 280,
          y: 236,
          w: CW - 280,
          h: 160,
          size: tokens.uppercaseHeadings ? 64 : 54,
          color: theme.ink,
          font: 'heading',
          weight: tokens.uppercaseHeadings ? 700 : 400,
          caps: tokens.uppercaseHeadings,
          lineHeight: 1.08,
          role: 'title',
        }),
      );
      elements.push(
        T(c.section.blurb, {
          x: M + 280,
          y: 412,
          w: CW - 420,
          h: 90,
          size: 20,
          color: theme.muted,
          font: bodyFont,
          lineHeight: 1.45,
          role: 'body',
        }),
      );
      footer(`${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`);
      break;
    }
    case 'text': {
      elements.push(S('rect', { x: 0, y: 0, w: W, h: H, fill: theme.bg, locked: true }));
      kicker(c.text.kicker);
      title(c.text.title, { w: CW * 0.72, h: 150, size: tokens.uppercaseHeadings ? 56 : 48 });
      if (tokens.rule) elements.push(S('rect', { x: M, y: 322, w: CW, h: 1, fill: theme.line }));
      const bodyX = M;
      const sideX = M + CW * 0.52;
      elements.push(
        T(c.text.body, {
          x: bodyX,
          y: tokens.rule ? 356 : 348,
          w: CW * 0.44,
          h: 220,
          size: 19,
          color: theme.ink,
          font: bodyFont,
          lineHeight: 1.55,
          role: 'body',
        }),
      );
      elements.push(
        S('rect', { x: sideX - 28, y: tokens.rule ? 356 : 348, w: tokens.cardSurface ? 1 : 4, h: 210, fill: theme.accent }),
      );
      elements.push(
        T(c.text.side, {
          x: sideX,
          y: tokens.rule ? 356 : 348,
          w: CW * 0.44,
          h: 90,
          size: 17,
          color: theme.muted,
          font: bodyFont,
          lineHeight: 1.5,
          role: 'caption',
        }),
      );
      elements.push(
        T(
          c.text.bullets.map((bullet) => ({ text: bullet })),
          {
            x: sideX,
            y: tokens.rule ? 450 : 444,
            w: CW * 0.44,
            h: 130,
            size: 17,
            color: theme.ink,
            font: bodyFont,
            lineHeight: 1.5,
            list: 'bullet',
            role: 'body',
          },
        ),
      );
      pageNumber();
      break;
    }
    case 'image': {
      elements.push(S('rect', { x: 0, y: 0, w: W, h: H, fill: theme.bg, locked: true }));
      const imgX = tokens.bigBlocks ? M + CW * 0.42 : M + CW * 0.46;
      const imgW = W - imgX - M;
      elements.push(IMG({ x: imgX, y: 96, w: imgW, h: 420, alt: c.image.alt, name: 'replace-me' }));
      if (tokens.bigBlocks) elements.push(S('rect', { x: imgX - 14, y: 82, w: imgW + 28, h: 448, fill: 'none' }));
      kicker(c.image.kicker);
      elements.push(
        T(c.image.title, {
          x: M,
          y: 170,
          w: CW * 0.4,
          h: 220,
          size: tokens.uppercaseHeadings ? 52 : 44,
          color: theme.ink,
          font: 'heading',
          weight: tokens.uppercaseHeadings ? 700 : 400,
          caps: tokens.uppercaseHeadings,
          lineHeight: 1.1,
          role: 'title',
        }),
      );
      elements.push(
        T(c.image.caption, {
          x: M,
          y: 552,
          w: CW * 0.46,
          h: 80,
          size: 16,
          color: theme.muted,
          font: bodyFont,
          lineHeight: 1.45,
          role: 'caption',
        }),
      );
      pageNumber();
      break;
    }
    case 'comparison': {
      elements.push(S('rect', { x: 0, y: 0, w: W, h: H, fill: theme.bg, locked: true }));
      kicker(c.comparison.kicker);
      title(c.comparison.title, { w: CW * 0.7, h: 110, size: tokens.uppercaseHeadings ? 46 : 40 });
      const gap = 32;
      const colW = (CW - gap) / 2;
      const colY = 296;
      const colH = 300;
      const cols = [
        { title: c.comparison.leftTitle, body: c.comparison.leftBody, x: M, accent: false },
        { title: c.comparison.rightTitle, body: c.comparison.rightBody, x: M + colW + gap, accent: true },
      ];
      for (const col of cols) {
        elements.push(
          S('rect', {
            x: col.x,
            y: colY,
            w: colW,
            h: colH,
            fill: col.accent ? theme.accent : theme.surface,
            radius: theme.radius,
          }),
        );
        elements.push(
          T(col.title, {
            x: col.x + 32,
            y: colY + 30,
            w: colW - 64,
            h: 40,
            size: 20,
            color: col.accent ? theme.accentInk : theme.ink,
            font: 'heading',
            weight: 600,
            role: 'subtitle',
          }),
        );
        elements.push(
          T(col.body, {
            x: col.x + 32,
            y: colY + 88,
            w: colW - 64,
            h: colH - 120,
            size: 17,
            color: col.accent ? theme.accentInk : theme.muted,
            font: bodyFont,
            lineHeight: 1.5,
            role: 'body',
          }),
        );
      }
      pageNumber();
      break;
    }
    case 'metrics': {
      elements.push(S('rect', { x: 0, y: 0, w: W, h: H, fill: tokens.bigBlocks ? theme.surface : theme.bg, locked: true }));
      kicker(c.metrics.kicker, tokens.bigBlocks ? 120 : 64);
      elements.push(
        T(c.metrics.title, {
          x: M,
          y: tokens.bigBlocks ? 150 : 132,
          w: CW * 0.8,
          h: 120,
          size: tokens.uppercaseHeadings ? 56 : 48,
          color: theme.ink,
          font: 'heading',
          weight: tokens.uppercaseHeadings ? 700 : 400,
          caps: tokens.uppercaseHeadings,
          lineHeight: 1.08,
          role: 'title',
        }),
      );
      const values = c.metrics.values.slice(0, 3);
      const gap = 28;
      const cellW = (CW - gap * (values.length - 1)) / values.length;
      values.forEach((item, i) => {
        const x = M + i * (cellW + gap);
        const y = 330;
        if (tokens.cardSurface) {
          elements.push(S('rect', { x, y, w: cellW, h: 250, fill: theme.surface, radius: theme.radius }));
          if (!tokens.bigBlocks) elements.push(S('rect', { x, y, w: cellW, h: 4, fill: theme.accent }));
        } else {
          elements.push(S('rect', { x, y, w: cellW, h: 4, fill: theme.accent }));
        }
        elements.push(
          T(item.value, {
            x: x + 28,
            y: y + 36,
            w: cellW - 56,
            h: 90,
            size: 62,
            color: tokens.cardSurface ? theme.ink : theme.accent,
            font: 'heading',
            weight: tokens.uppercaseHeadings ? 700 : 500,
            lineHeight: 1,
            role: 'metric',
          }),
        );
        elements.push(
          T(item.label, {
            x: x + 28,
            y: y + 132,
            w: cellW - 56,
            h: 34,
            size: 18,
            color: theme.ink,
            font: bodyFont,
            weight: 600,
            role: 'subtitle',
          }),
        );
        elements.push(
          T(item.detail, {
            x: x + 28,
            y: y + 172,
            w: cellW - 56,
            h: 60,
            size: 14,
            color: theme.muted,
            font: bodyFont,
            lineHeight: 1.4,
            role: 'caption',
          }),
        );
      });
      pageNumber();
      break;
    }
    case 'quote': {
      elements.push(S('rect', { x: 0, y: 0, w: W, h: H, fill: tokens.bigBlocks ? theme.accent : theme.bg, locked: true }));
      const quoteInk = tokens.bigBlocks ? theme.accentInk : theme.ink;
      elements.push(
        T('\u201C', {
          x: M,
          y: tokens.bigBlocks ? 96 : 110,
          w: 160,
          h: 180,
          size: 150,
          color: tokens.bigBlocks ? theme.accentInk : theme.accent,
          font: 'heading',
          lineHeight: 1,
          role: 'metric',
        }),
      );
      elements.push(
        T(c.quote.quote, {
          x: M,
          y: tokens.bigBlocks ? 214 : 226,
          w: CW * 0.86,
          h: 250,
          size: tokens.uppercaseHeadings ? 46 : 40,
          color: quoteInk,
          font: 'heading',
          weight: tokens.uppercaseHeadings ? 700 : 400,
          italic: !tokens.uppercaseHeadings,
          lineHeight: 1.22,
          role: 'quote',
        }),
      );
      elements.push(
        T(c.quote.attribution, {
          x: M,
          y: 552,
          w: CW * 0.5,
          h: 30,
          size: 18,
          color: quoteInk,
          font: bodyFont,
          weight: 600,
          role: 'subtitle',
        }),
      );
      elements.push(
        T(c.quote.role, {
          x: M,
          y: 584,
          w: CW * 0.5,
          h: 26,
          size: 15,
          color: tokens.bigBlocks ? theme.accentInk : theme.muted,
          font: bodyFont,
          role: 'caption',
        }),
      );
      break;
    }
    case 'timeline': {
      elements.push(S('rect', { x: 0, y: 0, w: W, h: H, fill: theme.bg, locked: true }));
      kicker(c.timeline.kicker);
      title(c.timeline.title, { w: CW * 0.7, h: 100, size: tokens.uppercaseHeadings ? 48 : 42 });
      const steps = c.timeline.steps.slice(0, 4);
      const gap = 24;
      const cellW = (CW - gap * (steps.length - 1)) / steps.length;
      const lineY = 322;
      elements.push(S('rect', { x: M, y: lineY, w: CW, h: 2, fill: theme.line }));
      steps.forEach((step, i) => {
        const x = M + i * (cellW + gap);
        elements.push(S('rect', { x, y: lineY - 6, w: 26, h: 26, fill: theme.accent, radius: 13 }));
        elements.push(
          T(step.label, {
            x: x + 36,
            y: lineY - 6,
            w: cellW - 36,
            h: 26,
            size: 14,
            color: theme.muted,
            font: 'mono',
            caps: true,
            letterSpacing: 1.4,
            role: 'kicker',
          }),
        );
        elements.push(
          T(step.title, {
            x,
            y: lineY + 46,
            w: cellW,
            h: 60,
            size: 21,
            color: theme.ink,
            font: 'heading',
            weight: 600,
            lineHeight: 1.2,
            role: 'subtitle',
          }),
        );
        elements.push(
          T(step.body, {
            x,
            y: lineY + 112,
            w: cellW,
            h: 120,
            size: 15,
            color: theme.muted,
            font: bodyFont,
            lineHeight: 1.45,
            role: 'body',
          }),
        );
      });
      pageNumber();
      break;
    }
    case 'closing': {
      elements.push(S('rect', { x: 0, y: 0, w: W, h: H, fill: tokens.bigBlocks ? theme.accent : theme.bg, locked: true }));
      const ink = tokens.bigBlocks ? theme.accentInk : theme.ink;
      kicker(c.closing.kicker, 76);
      elements.push(
        T(c.closing.title, {
          x: M,
          y: 156,
          w: CW * 0.82,
          h: 220,
          size: tokens.uppercaseHeadings ? 84 : 68,
          color: ink,
          font: 'heading',
          weight: tokens.uppercaseHeadings ? 700 : 400,
          caps: tokens.uppercaseHeadings,
          lineHeight: 1.05,
          role: 'title',
        }),
      );
      elements.push(
        T(c.closing.body, {
          x: M,
          y: 404,
          w: CW * 0.6,
          h: 90,
          size: 20,
          color: tokens.bigBlocks ? theme.accentInk : theme.muted,
          font: bodyFont,
          lineHeight: 1.45,
          role: 'body',
        }),
      );
      elements.push(
        S('rect', {
          x: M,
          y: 520,
          w: 300,
          h: 64,
          fill: tokens.bigBlocks ? theme.accentInk : theme.accent,
          radius: theme.radius,
        }),
      );
      elements.push(
        T(c.closing.cta, {
          x: M + 28,
          y: 538,
          w: 260,
          h: 30,
          size: 17,
          color: tokens.bigBlocks ? theme.accent : theme.accentInk,
          font: bodyFont,
          weight: 600,
          role: 'label',
        }),
      );
      footer(c.cover.footer);
      break;
    }
  }

  return {
    id: `tpl_${tokens.id}_${layout}`,
    layout,
    family: tokens.id,
    name: layoutLabel(layout),
    background: theme.bg,
    notes: notesFor(tokens, layout),
    elements,
  };
}

export function layoutLabel(layout: LayoutId): string {
  const labels: Record<LayoutId, string> = {
    cover: 'Cover',
    section: 'Section',
    text: 'Text',
    image: 'Text + image',
    comparison: 'Comparison',
    metrics: 'Metrics',
    quote: 'Quote',
    timeline: 'Timeline',
    closing: 'Closing',
  };
  return labels[layout];
}

function notesFor(tokens: FamilyTokens, layout: LayoutId): string {
  const c = tokens.content;
  switch (layout) {
    case 'cover':
      return `Open with the promise: ${c.cover.title}. Keep this on screen for ten seconds.`;
    case 'section':
      return `Transition. Signpost ${c.section.title} before the detail.`;
    case 'text':
      return 'Read the claim, then let the right column carry the evidence.';
    case 'image':
      return 'Replace the placeholder with a portrait or product shot; keep the caption short.';
    case 'comparison':
      return 'Contrast matters more than symmetry: name both options plainly.';
    case 'metrics':
      return 'Say the number, then the unit, then why it matters.';
    case 'quote':
      return 'Pause after the quote. Attribution stays on screen.';
    case 'timeline':
      return 'Walk the four steps left to right; do not read every word.';
    case 'closing':
      return 'End with one action and a way to reach you.';
    default:
      return '';
  }
}

export function themeFor(family: FamilyId): Theme {
  return getTheme(family);
}
