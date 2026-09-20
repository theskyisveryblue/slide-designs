import { themes } from '../model/theme';
import type { FamilyTokens } from './helpers';

export const bold: FamilyTokens = {
  id: 'bold',
  label: 'Bold Studio',
  theme: themes.bold,
  rule: false,
  ruleWeight: 6,
  cardSurface: false,
  bigBlocks: true,
  uppercaseHeadings: true,
  content: {
    deckTitle: 'Make It Loud — Studio Manifesto',
    cover: {
      kicker: 'Bold Studio — 2026',
      title: 'Make\nit loud.',
      subtitle: 'A studio manifesto in nine pages. High contrast, hard edges, no filler.',
      footer: 'Bold Studio — internal deck',
    },
    section: {
      index: '01',
      title: 'Why we\nshout',
      blurb: 'Quiet work gets ignored. If the idea is strong, the page should say so.',
    },
    text: {
      kicker: 'Manifesto 01',
      title: 'Contrast is a promise about confidence',
      body:
        'When everything is the same weight, nothing is important. We build pages around one enormous statement and let the supporting copy step back until it is almost silent.',
      side: 'Rule of thumb: if two elements are equally loud, one of them is wrong.',
      bullets: [
        'One statement per page, set large',
        'Hard edges over soft shadows',
        'Type as texture, not decoration',
        'Accent used like punctuation',
      ],
    },
    image: {
      kicker: 'Work',
      title: 'Show\nthe work',
      caption: 'Full-bleed imagery, cropped hard, with the caption set small and out of the way.',
      alt: 'Bold studio work placeholder awaiting an image',
    },
    comparison: {
      kicker: 'Before / after',
      title: 'Safe or sharp?',
      leftTitle: 'Safe',
      leftBody: 'Balanced, polite and forgettable. It offends nobody and moves nobody. Everyone has already seen this page this week.',
      rightTitle: 'Sharp',
      rightBody: 'Committed. It takes a position, states it once, and trusts the audience to keep up. That is the page people photograph.',
    },
    metrics: {
      kicker: 'Numbers',
      title: 'Scale, stated plainly',
      values: [
        { value: '9', label: 'Slides', detail: 'A manifesto that fits in one sitting.' },
        { value: '2', label: 'Typefaces', detail: 'One grotesque, one monospace for labels.' },
        { value: '1', label: 'Accent', detail: 'Acid green. Nothing else gets to be bright.' },
      ],
    },
    quote: {
      quote: 'If you cannot read it from the back of the room, you have not finished the page.',
      attribution: 'Bold Studio',
      role: 'Principle 04',
    },
    timeline: {
      kicker: 'Process',
      title: 'Four moves, no detours',
      steps: [
        { label: '01', title: 'Commit', body: 'Pick the one sentence the page exists to say.' },
        { label: '02', title: 'Scale', body: 'Set it big enough that the size itself is the layout.' },
        { label: '03', title: 'Contrast', body: 'Drop everything else to a whisper.' },
        { label: '04', title: 'Ship', body: 'Export and present. Polish in the next deck.' },
      ],
    },
    closing: {
      kicker: 'Over to you',
      title: 'Go make\nsome noise.',
      body: 'Steal the grid, replace the copy, and put it in front of people this week.',
      cta: 'Build the deck',
    },
  },
};
