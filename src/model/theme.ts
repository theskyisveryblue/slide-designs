import type { Theme, FamilyId } from './types';

export const themes: Record<FamilyId, Theme> = {
  editorial: {
    id: 'editorial',
    name: 'Editorial',
    bg: 'F4F1EA',
    ink: '1E2C26',
    muted: '5F6C64',
    surface: 'FFFFFF',
    accent: '2F6B52',
    accentInk: 'F4F1EA',
    line: 'D9D2C3',
    fonts: {
      heading: "Georgia, 'Times New Roman', 'Songti SC', serif",
      body: "Arial, Helvetica, sans-serif",
      mono: "'Courier New', monospace",
    },
    radius: 2,
    headingTracking: -0.01,
  },
  bold: {
    id: 'bold',
    name: 'Bold Studio',
    bg: '121212',
    ink: 'F5F4EE',
    muted: '9C9C93',
    surface: '1D1D1B',
    accent: 'D8FF3E',
    accentInk: '121212',
    line: '34342F',
    fonts: {
      heading: "Arial, Helvetica, sans-serif",
      body: "Arial, Helvetica, sans-serif",
      mono: "'Courier New', monospace",
    },
    radius: 0,
    headingTracking: -0.03,
  },
  product: {
    id: 'product',
    name: 'Clean Product',
    bg: 'F7F9FB',
    ink: '101A28',
    muted: '5A6B7B',
    surface: 'FFFFFF',
    accent: '2B5CE6',
    accentInk: 'FFFFFF',
    line: 'DCE4EC',
    fonts: {
      heading: "Arial, Helvetica, sans-serif",
      body: "Arial, Helvetica, sans-serif",
      mono: "'Courier New', monospace",
    },
    radius: 8,
    headingTracking: -0.02,
  },
};

export const themeList: Theme[] = [themes.editorial, themes.bold, themes.product];

export function getTheme(id: FamilyId): Theme {
  return themes[id] ?? themes.editorial;
}

/** Slides never carry their own theme; the deck family is authoritative. */
export function themeForSlide(slide: { family?: FamilyId }, deckFamily: FamilyId): Theme {
  return getTheme(slide.family ?? deckFamily);
}

export function themeColorTokens(theme: Theme): string[] {
  return [theme.bg, theme.ink, theme.muted, theme.surface, theme.accent, theme.accentInk, theme.line];
}

export function remapColor(color: string | undefined, from: Theme, to: Theme): string | undefined {
  if (!color) return color;
  const key = color.toUpperCase();
  const fromTokens = themeColorTokens(from);
  const toTokens = themeColorTokens(to);
  const index = fromTokens.indexOf(key);
  if (index === -1) return color;
  return toTokens[index];
}
